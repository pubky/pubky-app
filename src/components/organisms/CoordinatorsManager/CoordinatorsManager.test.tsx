import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoordinatorsManager } from './CoordinatorsManager';

const mocks = vi.hoisted(() => {
  const coordinator = () => ({ start: vi.fn(), stop: vi.fn(), setRoute: vi.fn() });
  return {
    status: 'AUTHENTICATED' as string,
    pathname: '/home',
    notification: coordinator(),
    stream: coordinator(),
    ttl: coordinator(),
    muteListSync: coordinator(),
    notificationLastReadPoll: coordinator(),
    lastReadChannel: coordinator(),
  };
});

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/hooks/useAuthStatus/useAuthStatus', () => ({
  useAuthStatus: () => ({ status: mocks.status, isLoading: false }),
}));
vi.mock('@/coordinators/notifications/notifications', () => ({
  NotificationCoordinator: { getInstance: () => mocks.notification },
}));
vi.mock('@/coordinators/streams/stream', () => ({ StreamCoordinator: { getInstance: () => mocks.stream } }));
vi.mock('@/coordinators/ttl/ttl', () => ({ TtlCoordinator: { getInstance: () => mocks.ttl } }));
vi.mock('@/coordinators/mute-list-sync/mute-list-sync', () => ({
  MuteListSyncCoordinator: { getInstance: () => mocks.muteListSync },
}));
vi.mock('@/coordinators/notification-last-read-poll/notification-last-read-poll', () => ({
  NotificationLastReadPollCoordinator: { getInstance: () => mocks.notificationLastReadPoll },
}));
vi.mock('@/coordinators/notification-last-read-sync/notification-last-read-sync', () => ({
  NotificationLastReadSyncCoordinator: { getInstance: () => mocks.lastReadChannel },
}));

const all = () => [mocks.notification, mocks.stream, mocks.ttl, mocks.muteListSync, mocks.notificationLastReadPoll];

describe('CoordinatorsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = 'AUTHENTICATED';
    mocks.pathname = '/home';
  });

  it('applies the route and starts every coordinator, and stops them on unmount', () => {
    const { unmount } = render(<CoordinatorsManager />);
    for (const coordinator of all()) expect(coordinator.start).toHaveBeenCalledOnce();
    expect(mocks.stream.setRoute).toHaveBeenCalledWith('/home');
    expect(mocks.notificationLastReadPoll.setRoute).toHaveBeenCalledWith('/home');
    unmount();
    for (const coordinator of all()) expect(coordinator.stop).toHaveBeenCalledOnce();
  });

  it('hands every route change to the route-gated coordinators', () => {
    const { rerender } = render(<CoordinatorsManager />);
    mocks.pathname = '/sign-in';
    rerender(<CoordinatorsManager />);
    for (const coordinator of [mocks.notification, mocks.stream, mocks.muteListSync, mocks.notificationLastReadPoll]) {
      expect(coordinator.setRoute).toHaveBeenLastCalledWith('/sign-in');
    }
  });

  // Social v1: the private `last_read` is polled; the event-stream channel stays unregistered (ADR-0029).
  it('never starts the last_read event-stream channel', () => {
    render(<CoordinatorsManager />);
    expect(mocks.lastReadChannel.start).not.toHaveBeenCalled();
  });

  it('starts nothing while the account is held behind the migration gate, then starts once it passes', () => {
    mocks.status = 'NEEDS_SOCIAL_MIGRATION';
    const { rerender } = render(<CoordinatorsManager />);
    for (const coordinator of all()) expect(coordinator.start).not.toHaveBeenCalled();

    mocks.status = 'AUTHENTICATED';
    rerender(<CoordinatorsManager />);
    for (const coordinator of all()) expect(coordinator.start).toHaveBeenCalledOnce();

    mocks.status = 'NEEDS_SOCIAL_MIGRATION';
    rerender(<CoordinatorsManager />);
    for (const coordinator of all()) expect(coordinator.stop).toHaveBeenCalledOnce();
  });
});
