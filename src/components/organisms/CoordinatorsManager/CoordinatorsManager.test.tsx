import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoordinatorsManager } from './CoordinatorsManager';

const mocks = vi.hoisted(() => {
  const coordinator = () => ({ start: vi.fn(), stop: vi.fn(), setRoute: vi.fn() });
  return {
    status: 'AUTHENTICATED' as string,
    notification: coordinator(),
    stream: coordinator(),
    ttl: coordinator(),
    muteListSync: coordinator(),
  };
});

vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));
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

const all = () => [mocks.notification, mocks.stream, mocks.ttl, mocks.muteListSync];

describe('CoordinatorsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = 'AUTHENTICATED';
  });

  it('applies the route and starts every coordinator, and stops them on unmount', () => {
    const { unmount } = render(<CoordinatorsManager />);
    for (const coordinator of all()) expect(coordinator.start).toHaveBeenCalledOnce();
    expect(mocks.stream.setRoute).toHaveBeenCalledWith('/home');
    unmount();
    for (const coordinator of all()) expect(coordinator.stop).toHaveBeenCalledOnce();
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
