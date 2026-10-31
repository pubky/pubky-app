import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES } from '@/app/routes';
import {
  NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
} from '@/config/notification-last-read-sync';
import { NotificationController } from '@/controllers/notification/notification';
import { NotificationLastReadSyncCoordinator } from '@/coordinators/notification-last-read-sync/notification-last-read-sync';
import { clearNotificationLastReadSyncCursorSessionStorage } from '@/libs/notification-last-read-sync/clear-cursor-session-storage';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

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

function signIn(): void {
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: pubky, hasProfile: true });
}

describe('NotificationLastReadSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    NotificationLastReadSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    sessionStorage.clear();
    vi.spyOn(NotificationController, 'subscribeLastReadEventStream').mockImplementation(async () => {
      return new ReadableStream({
        start(controller) {
          controller.enqueue({ cursor: 'c1', eventType: 'PUT' });
        },
      });
    });
    vi.spyOn(NotificationController, 'fetchLastReadFromHomeserver').mockResolvedValue(undefined);
  });

  afterEach(() => {
    NotificationLastReadSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('refreshes lastRead from the homeserver after a last_read event and stores the cursor', async () => {
    signIn();
    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();
    await flushPromises();

    expect(NotificationController.subscribeLastReadEventStream).toHaveBeenCalledWith(pubky, null);
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);

    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledTimes(1);
    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledWith(pubky);
    expect(sessionStorage.getItem(`${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`)).toBe('c1');
  });

  it('does not open the stream on disabled auth routes', async () => {
    signIn();
    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
    coordinator.start();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS + 50);

    expect(NotificationController.subscribeLastReadEventStream).not.toHaveBeenCalled();
  });

  it('does not open the stream while signed out', async () => {
    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();
    await flushPromises();

    expect(NotificationController.subscribeLastReadEventStream).not.toHaveBeenCalled();
  });

  it('pauses the stream while the tab is hidden and resumes when visible', async () => {
    const cancel = vi.fn();
    vi.mocked(NotificationController.subscribeLastReadEventStream).mockImplementation(
      async () => new ReadableStream({ cancel }),
    );
    signIn();
    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();
    await flushPromises();
    expect(NotificationController.subscribeLastReadEventStream).toHaveBeenCalledTimes(1);

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(cancel).toHaveBeenCalledTimes(1);

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(NotificationController.subscribeLastReadEventStream).toHaveBeenCalledTimes(2);
  });

  it('clears only the last_read cursors from sessionStorage on logout cleanup', () => {
    const own = `${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`;
    sessionStorage.setItem(own, 'c9');
    sessionStorage.setItem('unrelated', 'keep');

    clearNotificationLastReadSyncCursorSessionStorage();

    expect(sessionStorage.getItem(own)).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });
});
