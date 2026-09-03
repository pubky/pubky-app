'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotificationController } from '@/controllers/notification/notification';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { Logger } from '@/libs/logger/logger';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { UseNotificationsResult } from './useNotifications.types';

/**
 * Hook for notifications with infinite scroll pagination.
 * Fetches directly from NotificationController using timestamp-based pagination.
 */
export function useNotifications(): UseNotificationsResult {
  const [notifications, setNotifications] = useState<FlatNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const olderThanRef = useRef<number | undefined>(undefined);
  const loadingRef = useRef(false);
  // Mirrors `notifications` so `refresh` can diff against the loaded list without
  // subscribing to it (its identity changes on every merge).
  const notificationsRef = useRef<FlatNotification[]>([]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const { currentUserPubky } = useAuthStore();
  const notificationPreferences = useSettingsStore((s) => s.notifications);
  const previousPreferencesRef = useRef(notificationPreferences);

  /**
   * Mute filtering for notifications.
   * Ensures notifications from muted users are hidden, consistent with timeline behavior.
   */
  const { mutedUserIdSet } = useMutedUsers();
  const lastRead = useNotificationStore((s) => s.lastRead);
  const unread = useNotificationStore((s) => s.unread);
  // `lastRead` is frozen at the first non-zero value this hook instance sees, so
  // marking notifications as read mid-session does not immediately clear the
  // unread highlight. Held in state rather than a ref because it is read during
  // render (`unreadNotifications`), which the React Compiler `refs` rule forbids.
  const [frozenLastRead, setFrozenLastRead] = useState(lastRead);
  const previousUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (frozenLastRead === 0 && lastRead > 0) {
      setFrozenLastRead(lastRead);
    }
  }, [lastRead, frozenLastRead]);

  /**
   * Extracts the actor (initiator) user ID from a notification.
   * Used for mute filtering - if the actor is muted, the notification is hidden.
   *
   * Returns empty string for notification types without a clear actor,
   * which causes them to pass through the mute filter (not hidden).
   */
  const getActorUserId = useCallback((notification: FlatNotification) => {
    switch (notification.type) {
      // Social interactions - actor is the person who followed/friended
      case NotificationType.Follow:
      case NotificationType.NewFriend:
        return notification.followed_by;

      // Tagging - actor is the person who tagged you
      case NotificationType.TagPost:
      case NotificationType.TagProfile:
        return notification.tagged_by;

      // Content interactions - actor is the person who replied/reposted/mentioned
      case NotificationType.Reply:
        return notification.replied_by;
      case NotificationType.Repost:
        return notification.reposted_by;
      case NotificationType.Mention:
        return notification.mentioned_by;

      // Moderation actions - actor is the moderator/editor
      case NotificationType.PostDeleted:
        return notification.deleted_by;
      case NotificationType.PostEdited:
        return notification.edited_by;

      // Exhaustiveness check - if we reach here, a new notification type was added
      // Log a warning but still pass through (fail-open for mute filter)
      default: {
        const unhandledType: never = notification;
        Logger.warn(
          `[useNotifications] Unhandled notification type for mute filtering: ${(unhandledType as FlatNotification).type}`,
        );
        return '';
      }
    }
  }, []);

  // Filter out activity from muted users to match timeline mute behavior.
  const filterMutedNotifications = useCallback(
    (items: FlatNotification[]) =>
      items.filter((notification) => {
        const actorId = getActorUserId(notification);
        return actorId ? !mutedUserIdSet.has(actorId) : true;
      }),
    [getActorUserId, mutedUserIdSet],
  );

  /**
   * Perform initial load - fetches first page of notifications
   */
  const performInitialLoad = useCallback(async () => {
    if (!currentUserPubky || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const { flatNotifications: notifications, olderThan } = await NotificationController.getOrFetchNotifications({});

      setNotifications(filterMutedNotifications(notifications));
      olderThanRef.current = olderThan;
      setHasMore(olderThan !== undefined);
    } catch {
      setError('Failed to load notifications');
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [currentUserPubky, filterMutedNotifications]);

  /**
   * Load more notifications using timestamp-based pagination
   */
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !currentUserPubky) return;
    if (olderThanRef.current === undefined) {
      setHasMore(false);
      return;
    }

    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      const { flatNotifications: notifications, olderThan } = await NotificationController.getOrFetchNotifications({
        olderThan: olderThanRef.current,
      });

      setNotifications((prev) => {
        // Deduplicate using id (business key). Defensive code for edge cases.
        const existingIds = new Set(prev.map((n) => n.id));
        const filtered = filterMutedNotifications(notifications);
        const newNotifications = filtered.filter((n) => !existingIds.has(n.id));
        return [...prev, ...newNotifications];
      });
      olderThanRef.current = olderThan;
      setHasMore(olderThan !== undefined);
    } catch {
      setError('Failed to load more notifications');
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [hasMore, currentUserPubky, filterMutedNotifications]);

  /**
   * Refresh notifications - fetches the newest page and merges it in place.
   *
   * Runs silently (no `isLoading` flip): the poll fires it whenever anything new
   * arrives, and swapping the mounted list for a skeleton would collapse expanded
   * group rows and throw away scroll position every few seconds on active accounts.
   * New notifications are prepended onto what is already loaded; the list is replaced
   * (and pagination restarted) only when there is nothing to prepend onto, or when the
   * fresh page shares nothing with the loaded list — more than a page arrived at once,
   * so prepending would leave an invisible gap.
   */
  const refresh = useCallback(async () => {
    if (!currentUserPubky || loadingRef.current) return;

    loadingRef.current = true;
    setError(null);

    try {
      const { flatNotifications: fetched, olderThan } = await NotificationController.getOrFetchNotifications({});

      const fresh = filterMutedNotifications(fetched);
      const existingIds = new Set(notificationsRef.current.map((n) => n.id));
      const newNotifications = fresh.filter((n) => !existingIds.has(n.id));

      // Nothing loaded yet — the first load failed and the user retried, so this call
      // stands in for it and has to establish the pagination cursor too.
      const isEmptyList = notificationsRef.current.length === 0;
      // An empty page proves nothing about overlap (every actor on it may be muted), so
      // it must never be mistaken for a gap and wipe the loaded list.
      const hasGap = !isEmptyList && fresh.length > 0 && newNotifications.length === fresh.length;

      if (isEmptyList || hasGap) {
        setNotifications(fresh);
        olderThanRef.current = olderThan;
        setHasMore(olderThan !== undefined);
      } else if (newNotifications.length > 0) {
        setNotifications((prev) => [...newNotifications, ...prev]);
      }
    } catch {
      setError('Failed to refresh notifications');
    } finally {
      loadingRef.current = false;
    }
  }, [currentUserPubky, filterMutedNotifications]);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(() => {
    void NotificationController.markAllAsRead();
  }, []);

  /**
   * Check if a notification is unread
   */
  const isNotificationUnread = useCallback(
    (n: FlatNotification) => {
      return n.timestamp > frozenLastRead;
    },
    [frozenLastRead],
  );

  /**
   * List of unread notifications
   */
  const unreadNotifications = useMemo(() => {
    return notifications.filter((n) => n.timestamp > frozenLastRead);
  }, [notifications, frozenLastRead]);

  /**
   * Initial load - fetch first page when component mounts
   */
  useEffect(() => {
    if (!currentUserPubky) return;
    performInitialLoad();
  }, [currentUserPubky, performInitialLoad]);

  /**
   * Reset pagination when notification filter preferences change.
   * Preference changes create a new query context, so we must restart from
   * the first page instead of continuing with the previous olderThan cursor.
   * This is a full reload (not the silent merge `refresh`), because the already
   * loaded list was built under the old filter and cannot be patched in place.
   */
  useEffect(() => {
    if (!currentUserPubky) return;

    const hasPreferencesChanged = previousPreferencesRef.current !== notificationPreferences;
    previousPreferencesRef.current = notificationPreferences;

    if (!hasPreferencesChanged) return;

    performInitialLoad();
  }, [currentUserPubky, notificationPreferences, performInitialLoad]);

  /**
   * Reactively filter notifications when mute state changes.
   * This handles the case where a user mutes someone while viewing notifications.
   * Note: We only depend on mutedUserIdSet to avoid infinite loops since setNotifications
   * is called within this effect. The functional update ensures we always filter
   * the latest notifications state.
   */
  useEffect(() => {
    if (mutedUserIdSet.size === 0) return;

    setNotifications((prev) => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter((notification) => {
        const actorId = getActorUserId(notification);
        return actorId ? !mutedUserIdSet.has(actorId) : true;
      });
      // Only update if content actually changed to prevent unnecessary re-renders
      return filtered.length !== prev.length ? filtered : prev;
    });
  }, [mutedUserIdSet, getActorUserId]);

  // Refresh list when new notifications come in via polling
  useEffect(() => {
    // Skip initial render
    if (previousUnreadRef.current === null) {
      previousUnreadRef.current = unread;
      return;
    }

    if (unread > previousUnreadRef.current) {
      refresh();
    }

    previousUnreadRef.current = unread;
  }, [unread, refresh]);

  return {
    notifications,
    unreadNotifications,
    count: notifications.length,
    unreadCount: unreadNotifications.length,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    markAllAsRead,
    isNotificationUnread,
  };
}
