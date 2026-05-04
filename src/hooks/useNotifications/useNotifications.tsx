'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import type { UseNotificationsResult } from './useNotifications.types';
import { Logger } from '@/libs/logger/logger';
import { NotificationController } from '@/controllers/notification/notification';
import { NotificationType, type FlatNotification } from '@/models/notification/notification.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { useSettingsStore } from '@/stores/settings/settings.store';
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
  const lastReadRef = useRef(lastRead);
  const previousUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastReadRef.current === 0 && lastRead > 0) {
      lastReadRef.current = lastRead;
    }
  }, [lastRead]);

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
   * Refresh notifications - resets pagination and fetches from start
   */
  const refresh = useCallback(async () => {
    if (!currentUserPubky || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);
    olderThanRef.current = undefined;
    setHasMore(true);

    try {
      const { flatNotifications: notifications, olderThan } = await NotificationController.getOrFetchNotifications({});

      setNotifications(filterMutedNotifications(notifications));
      olderThanRef.current = olderThan;
      setHasMore(olderThan !== undefined);
    } catch {
      setError('Failed to refresh notifications');
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [currentUserPubky, filterMutedNotifications]);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(() => {
    NotificationController.markAllAsRead();
  }, []);

  /**
   * Check if a notification is unread
   */
  const isNotificationUnread = useCallback((n: FlatNotification) => {
    return n.timestamp > lastReadRef.current;
  }, []);

  /**
   * List of unread notifications
   */
  const unreadNotifications = useMemo(() => {
    return notifications.filter((n) => n.timestamp > lastReadRef.current);
  }, [notifications]);

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
   */
  useEffect(() => {
    if (!currentUserPubky) return;

    const hasPreferencesChanged = previousPreferencesRef.current !== notificationPreferences;
    previousPreferencesRef.current = notificationPreferences;

    if (!hasPreferencesChanged) return;

    refresh();
  }, [currentUserPubky, notificationPreferences, refresh]);

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
