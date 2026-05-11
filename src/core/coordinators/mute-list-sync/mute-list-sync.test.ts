import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import {
  MUTE_SYNC_CURSOR_STORAGE_PREFIX,
  MUTE_SYNC_DEBOUNCE_MS,
  MUTE_SYNC_RECONNECT_BACKOFF_MS,
} from '@/config/mute-sync';
import { MuteController } from '@/controllers/mute/mute';
import { MuteListSyncCoordinator } from '@/coordinators/mute-list-sync/mute-list-sync';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function setVisibilityState(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibilityState,
  });
}

describe('MuteListSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    MuteListSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    sessionStorage.clear();
    vi.spyOn(MuteController, 'subscribeMuteDirectoryEventStream').mockImplementation(async () => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ cursor: 'c1', eventType: 'PUT' });
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
          controller.enqueue({ cursor: 'c1', eventType: 'PUT' });
          controller.enqueue({ cursor: 'c2', eventType: 'PUT' });
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

  it('retries failed mute refreshes and stores the cursor after success', async () => {
    const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
    const cursorKey = `${MUTE_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`;
    vi.mocked(MuteController.fetchMutedUsers).mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce([]);

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
    expect(sessionStorage.getItem(cursorKey)).toBeNull();

    await vi.advanceTimersByTimeAsync(MUTE_SYNC_RECONNECT_BACKOFF_MS);

    expect(fetchMuted).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(cursorKey)).toBe('c1');
  });

  it('does not reconnect the homeserver stream when moving between allowed routes', async () => {
    const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: pubky,
      hasProfile: true,
    });

    const subscribe = vi.mocked(MuteController.subscribeMuteDirectoryEventStream);

    const coordinator = MuteListSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);

    coordinator.setRoute(PROFILE_ROUTES.PROFILE);
    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('opens the homeserver stream after navigating from a disabled route to an allowed route', async () => {
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
    expect(subscribe).not.toHaveBeenCalled();

    coordinator.setRoute(APP_ROUTES.HOME);
    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);
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

  it('clears reconnect backoff on stop so a second subscribe is not scheduled after backoff', async () => {
    const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
    vi.mocked(MuteController.subscribeMuteDirectoryEventStream).mockImplementation(async () => {
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    });

    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: pubky,
      hasProfile: true,
    });

    const subscribe = vi.mocked(MuteController.subscribeMuteDirectoryEventStream);

    const coordinator = MuteListSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);

    coordinator.stop();

    await vi.advanceTimersByTimeAsync(MUTE_SYNC_RECONNECT_BACKOFF_MS + 100);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('pauses the homeserver stream while hidden and resumes when visible', async () => {
    const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
    const cancelFirstStream = vi.fn();

    vi.mocked(MuteController.subscribeMuteDirectoryEventStream).mockImplementation(async () => {
      return new ReadableStream({
        cancel: cancelFirstStream,
      });
    });

    useAuthStore.getState().init({
      session: mockSession(),
      currentUserPubky: pubky,
      hasProfile: true,
    });

    const subscribe = vi.mocked(MuteController.subscribeMuteDirectoryEventStream);
    const coordinator = MuteListSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();

    expect(cancelFirstStream).toHaveBeenCalledTimes(1);

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();

    expect(subscribe).toHaveBeenCalledTimes(2);
  });
});
