'use client';

import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useNotifications } from '@/hooks/useNotifications/useNotifications';
import { useEffect } from 'react';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Molecules from '@/molecules';
import { NotificationsContainerSkeleton, NotificationsLoadMoreSkeleton } from './NotificationsContainer.skeleton';

/**
 * Organism that handles all notification business logic:
 * - Fetching notifications via Core
 * - Marking as read
 * - Infinite scroll pagination
 * - Loading/error/empty states
 */
export function NotificationsContainer() {
  const { notifications, unreadNotifications, isLoading, isLoadingMore, hasMore, error, loadMore, markAllAsRead } =
    useNotifications();

  // Infinite scroll sentinel
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: isLoadingMore,
  });

  // Mark all notifications as read when entering the notifications page
  // This allows the tab counter to show 0 while viewing notifications
  useEffect(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  if (isLoading) {
    return <NotificationsContainerSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Atoms.Container overrideDefaults={true} className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">{error}</p>
      </Atoms.Container>
    );
  }

  // Empty state
  if (notifications.length === 0) {
    return <Molecules.NotificationsEmpty />;
  }

  return (
    <>
      <Atoms.Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
        Notifications {unreadNotifications.length > 0 && `(${unreadNotifications.length})`}
      </Atoms.Heading>
      <Organisms.NotificationsList notifications={notifications} unreadNotifications={unreadNotifications} />

      {/* Infinite scroll sentinel - triggers loadMore when visible */}
      <div ref={sentinelRef} className="h-10" />

      {isLoadingMore && <NotificationsLoadMoreSkeleton />}
    </>
  );
}
