import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES } from '@/app/routes';
import { MUTE_SYNC_DEBOUNCE_MS } from '@/config/mute-sync';
import { MuteController } from '@/controllers/mute/mute';
import { MuteListSyncCoordinator } from '@/coordinators/mute-list-sync/mute-list-sync';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('MuteListSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MuteListSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    sessionStorage.clear();
    vi.spyOn(MuteController, 'subscribeMuteDirectoryEventStream').mockImplementation(async () => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ cursor: 'c1', eventType: 'PUT', free: vi.fn() });
        },
      });
    });
    vi.spyOn(MuteController, 'fetchMutedUsers').mockResolvedValue([]);
  });

  afterEach(() => {
    MuteListSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.useRealTimers();
  });

  it('calls fetchMutedUsers after debounce when homeserver events arrive', async () => {
    const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: pubky,
      hasProfile: true,
    });

    const fetchMuted = vi.mocked(MuteController.fetchMutedUsers);

    const coordinator = MuteListSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(MuteController.subscribeMuteDirectoryEventStream).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS);
    expect(fetchMuted).toHaveBeenCalledTimes(1);
    expect(fetchMuted).toHaveBeenCalledWith(pubky);
  });

  it('debounces bursty PUT events into a single fetch', async () => {
    const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
    vi.mocked(MuteController.subscribeMuteDirectoryEventStream).mockImplementation(async () => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ cursor: 'c1', eventType: 'PUT', free: vi.fn() });
          controller.enqueue({ cursor: 'c2', eventType: 'PUT', free: vi.fn() });
        },
      });
    });

    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: pubky,
      hasProfile: true,
    });

    const fetchMuted = vi.mocked(MuteController.fetchMutedUsers);

    const coordinator = MuteListSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS);
    expect(fetchMuted).toHaveBeenCalledTimes(1);
  });

  it('does not open the homeserver stream on disabled auth routes', async () => {
    const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: pubky,
      hasProfile: true,
    });

    const subscribe = vi.mocked(MuteController.subscribeMuteDirectoryEventStream);

    const coordinator = MuteListSyncCoordinator.getInstance();
    coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
    coordinator.start();

    await flushPromises();
    await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS + 50);

    expect(subscribe).not.toHaveBeenCalled();
    coordinator.stop();
  });
});
