import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES } from '@/app/routes';
import {
  NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
} from '@/config/notification-last-read-sync';
import { HomeserverEventController } from '@/controllers/homeserver-event/homeserver-event';
import type { THomeserverEvent } from '@/controllers/homeserver-event/homeserver-event.types';
import { MuteController } from '@/controllers/mute/mute';
import { NotificationController } from '@/controllers/notification/notification';
import { HomeserverEventStreamCoordinator } from '@/coordinators/homeserver-event-stream/homeserver-event-stream';
import { MuteListSyncCoordinator } from '@/coordinators/mute-list-sync/mute-list-sync';
import { NotificationLastReadSyncCoordinator } from '@/coordinators/notification-last-read-sync/notification-last-read-sync';
import { clearNotificationLastReadSyncCursorSessionStorage } from '@/libs/notification-last-read-sync/clear-cursor-session-storage';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

async function flushPromises() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
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

function start(route: string): HomeserverEventStreamCoordinator {
  const hub = HomeserverEventStreamCoordinator.getInstance();
  hub.setRoute(route);
  NotificationLastReadSyncCoordinator.getInstance().start();
  hub.start();
  return hub;
}

const subscribe = () => vi.mocked(HomeserverEventController.subscribeUserEventStream);

describe('NotificationLastReadSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    HomeserverEventStreamCoordinator.resetInstance();
    NotificationLastReadSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    sessionStorage.clear();
    vi.spyOn(HomeserverEventController, 'subscribeUserEventStream').mockImplementation(async () => {
      return new ReadableStream<THomeserverEvent>({
        start(controller) {
          controller.enqueue({
            cursor: '1',
            eventType: 'PUT',
            path: NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX,
          });
        },
      });
    });
    vi.spyOn(NotificationController, 'fetchLastReadFromHomeserver').mockResolvedValue(undefined);
  });

  afterEach(() => {
    MuteListSyncCoordinator.resetInstance();
    NotificationLastReadSyncCoordinator.resetInstance();
    HomeserverEventStreamCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('refreshes lastRead from the homeserver after a last_read event and stores the cursor', async () => {
    signIn();
    start(APP_ROUTES.HOME);
    await flushPromises();

    expect(subscribe().mock.calls[0][0]).toMatchObject({
      pubky,
      cursor: null,
      paths: [NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX],
    });
    // One read when the stream connects, one after the debounced event.
    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);

    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledTimes(2);
    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledWith(pubky);
    expect(sessionStorage.getItem(`${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`)).toBe('1');
  });

  // Social v1: the mute directory is private and polled (ADR-0014), so the mute list never joins the shared stream.
  it('subscribes to its own path only, with the polling mute list running beside it', async () => {
    vi.spyOn(MuteController, 'fetchMutedUsers').mockResolvedValue([]);
    signIn();
    MuteListSyncCoordinator.getInstance().start();
    start(APP_ROUTES.HOME);
    await flushPromises();

    expect(subscribe()).toHaveBeenCalledOnce();
    expect(subscribe().mock.calls[0][0].paths).toEqual([NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX]);
  });

  it('re-reads last_read when it resumes from a stored cursor, before any event arrives', async () => {
    // The local boundary can be older than the one the stored cursor acknowledged (another tab persisted a stale
    // snapshot); the resumed stream will not replay the event that corrected it.
    sessionStorage.setItem(`${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`, '1');
    subscribe().mockImplementation(async () => new ReadableStream<THomeserverEvent>());
    signIn();
    start(APP_ROUTES.HOME);
    await flushPromises();
    await flushPromises();

    expect(subscribe().mock.calls[0][0]).toMatchObject({ pubky, cursor: '1' });
    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledTimes(1);
    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledWith(pubky);
  });

  it.each(['idle', 'restoring', 'temporary-error', 'reauth-required'] as const)(
    'waits for a ready session before opening the stream from %s',
    async (restoreStatus) => {
      signIn();
      useAuthStore.getState().setRestoreStatus(restoreStatus);
      start(APP_ROUTES.HOME);
      await flushPromises();

      expect(subscribe()).not.toHaveBeenCalled();
      expect(NotificationController.fetchLastReadFromHomeserver).not.toHaveBeenCalled();

      useAuthStore.getState().setRestoreStatus('ready');
      await flushPromises();
      expect(subscribe()).toHaveBeenCalledOnce();
      expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledOnce();
    },
  );

  it('waits for account sync even after the session becomes ready', async () => {
    signIn();
    useAuthStore.setState({ restoreStatus: 'restoring', needsAccountSync: true });
    start(APP_ROUTES.HOME);
    await flushPromises();

    useAuthStore.getState().setRestoreStatus('ready');
    await flushPromises();
    expect(subscribe()).not.toHaveBeenCalled();

    useAuthStore.getState().setNeedsAccountSync(false);
    await flushPromises();
    expect(subscribe()).toHaveBeenCalledOnce();
    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledOnce();
  });

  it('starts reconciliation when profile creation finishes for a ready session', async () => {
    signIn();
    useAuthStore.getState().setHasProfile(false);
    start(APP_ROUTES.HOME);
    await flushPromises();
    expect(subscribe()).not.toHaveBeenCalled();

    useAuthStore.getState().setHasProfile(true);
    await flushPromises();
    expect(subscribe()).toHaveBeenCalledOnce();
    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledOnce();
  });

  it.each(['restore', 'account sync'] as const)('pauses and reconciles again across %s', async (reason) => {
    const cancel = vi.fn();
    subscribe().mockImplementation(async () => new ReadableStream<THomeserverEvent>({ cancel }));
    signIn();
    start(APP_ROUTES.HOME);
    await flushPromises();

    useAuthStore.getState().setShowSignInDialog(true);
    await flushPromises();
    expect(subscribe()).toHaveBeenCalledOnce();

    if (reason === 'restore') useAuthStore.getState().setRestoreStatus('restoring');
    else useAuthStore.getState().setNeedsAccountSync(true);
    await flushPromises();
    expect(cancel).toHaveBeenCalledOnce();
    expect(subscribe()).toHaveBeenCalledOnce();

    if (reason === 'restore') useAuthStore.getState().setRestoreStatus('ready');
    else useAuthStore.getState().setNeedsAccountSync(false);
    await flushPromises();
    expect(subscribe()).toHaveBeenCalledTimes(2);
    expect(NotificationController.fetchLastReadFromHomeserver).toHaveBeenCalledTimes(2);
  });

  it('does not open the stream on disabled auth routes', async () => {
    signIn();
    start(AUTH_ROUTES.SIGN_IN);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS + 50);

    expect(subscribe()).not.toHaveBeenCalled();
  });

  it('does not open the stream while signed out', async () => {
    start(APP_ROUTES.HOME);
    await flushPromises();

    expect(subscribe()).not.toHaveBeenCalled();
  });

  it('pauses the stream while the tab is hidden and resumes when visible', async () => {
    const cancel = vi.fn();
    subscribe().mockImplementation(async () => new ReadableStream<THomeserverEvent>({ cancel }));
    signIn();
    start(APP_ROUTES.HOME);
    await flushPromises();
    expect(subscribe()).toHaveBeenCalledTimes(1);

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(cancel).toHaveBeenCalledTimes(1);

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(subscribe()).toHaveBeenCalledTimes(2);
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
