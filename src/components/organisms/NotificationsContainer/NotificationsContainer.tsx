'use client';

import { useEffect } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useNotifications } from '@/hooks/useNotifications/useNotifications';
import { NotificationsEmpty } from '@/molecules/NotificationsEmpty/NotificationsEmpty';
import { useAuthStore } from '@/stores/auth/auth.store';
import { NotificationsList } from '../NotificationsList/NotificationsList';
import { groupNotifications } from '../NotificationsList/NotificationsList.utils';
import { NotificationsContainerSkeleton, NotificationsLoadMoreSkeleton } from './NotificationsContainer.skeleton';

/** Consecutive automatic loads allowed without the rendered list getting any longer. */
const MAX_UNPRODUCTIVE_AUTO_LOADS = 3;

/**
 * Organism that handles all notification business logic:
 * - Fetching notifications via useNotifications
 * - Marking as read
 * - Infinite scroll pagination
 * - Loading/error/empty states
 */
export function NotificationsContainer() {
  const {
    notifications,
    unreadNotifications,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    markAllAsRead,
  } = useNotifications();

  const entries = groupNotifications(notifications);

  // Grouping collapses many notifications into few rows, so a page can leave the scroll
  // sentinel on screen and immediately trigger the next one. A page that merges entirely
  // into existing groups adds no rows at all, which would loop to the end of the user's
  // history. The hook budgets the loads that fail to make the list longer, then hands
  // the decision back to the user via the manual button below.
  const { sentinelRef, isStalled, resumeAutoLoad } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: isLoadingMore,
    itemCount: entries.length,
    maxUnproductiveLoads: MAX_UNPRODUCTIVE_AUTO_LOADS,
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

  // A failure with nothing loaded yet is a dead end, so it owns the page. A failure
  // with rows on screen must not throw them away — it renders inline below the list.
  if (error && notifications.length === 0) {
    return (
      <Container overrideDefaults={true} className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">{error}</p>
        <Button variant={ButtonVariant.SECONDARY} type="button" onClick={refresh} data-cy="notifications-retry">
          {'Try again'}
        </Button>
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
      <NotificationsList entries={entries} unreadNotifications={unreadNotifications} />

      {/* Infinite scroll sentinel - triggers loadMore when visible. Unmounted while an
          error shows so the observer cannot loop retries against a failing network;
          recovery goes through the Try again button instead. */}
      {!error && <div ref={sentinelRef} className="h-10" data-cy="notifications-sentinel" />}

      {error && (
        <Container overrideDefaults={true} className="flex flex-col items-center gap-2 py-4">
          <p className="text-muted-foreground">{error}</p>
          <Button variant={ButtonVariant.SECONDARY} type="button" onClick={refresh} data-cy="notifications-retry">
            {'Try again'}
          </Button>
        </Container>
      )}

      {isLoadingMore && <NotificationsLoadMoreSkeleton />}

      {hasMore && isStalled && !isLoadingMore && (
        <Container overrideDefaults={true} className="flex justify-center py-2">
          <Button
            variant={ButtonVariant.SECONDARY}
            type="button"
            onClick={resumeAutoLoad}
            data-cy="notifications-load-more"
          >
            {'Load more'}
          </Button>
        </Container>
      )}
    </>
  );
}
