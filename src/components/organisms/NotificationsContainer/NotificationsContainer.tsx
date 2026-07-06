'use client';

import { useEffect } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useNotifications } from '@/hooks/useNotifications/useNotifications';
import { NotificationsEmpty } from '@/molecules/NotificationsEmpty/NotificationsEmpty';
import { useAuthStore } from '@/stores/auth/auth.store';
import { NotificationsList } from '../NotificationsList/NotificationsList';
import { NotificationsContainerSkeleton, NotificationsLoadMoreSkeleton } from './NotificationsContainer.skeleton';

/**
 * Organism that handles all notification business logic:
 * - Fetching notifications via useNotifications
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

  // Re-run once the session is restored, since the write needs an authenticated session.
  const isAuthenticated = useAuthStore((state) => state.session !== null);

  // Mark all notifications as read when entering the page (once authenticated), so the
  // tab counter shows 0 while viewing.
  useEffect(() => {
    if (!isAuthenticated) return;
    markAllAsRead();
  }, [markAllAsRead, isAuthenticated]);

  if (isLoading) {
    return <NotificationsContainerSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Container overrideDefaults={true} className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">{error}</p>
      </Container>
    );
  }

  // Empty state
  if (notifications.length === 0) {
    return <NotificationsEmpty />;
  }

  return (
    <>
      <Heading level={5} size="lg" className="leading-normal font-light text-muted-foreground lg:hidden">
        Notifications {unreadNotifications.length > 0 && `(${unreadNotifications.length})`}
      </Heading>
      <NotificationsList notifications={notifications} unreadNotifications={unreadNotifications} />

      {/* Infinite scroll sentinel - triggers loadMore when visible */}
      <div ref={sentinelRef} className="h-10" />

      {isLoadingMore && <NotificationsLoadMoreSkeleton />}
    </>
  );
}
