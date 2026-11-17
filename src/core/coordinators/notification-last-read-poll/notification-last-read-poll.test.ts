import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import {
  NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
  NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS,
} from '@/config/notification-last-read-sync';
import { NotificationController } from '@/controllers/notification/notification';
import { NotificationLastReadPollCoordinator } from '@/coordinators/notification-last-read-poll/notification-last-read-poll';
import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { mockPubky, mockSession } from '@/test-utils/pubky';

const PUBKY = mockPubky('5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y');
const OTHER_PUBKY = mockPubky('c5nr657md9g8mut1xb7pyj8fuhm1aukwpmkqqjhiwsp9wdhmwzay');

function setVisibilityState(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibilityState,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function signIn(pubky: Pubky = PUBKY): void {
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: pubky, hasProfile: true });
}

function startOn(route: string): NotificationLastReadPollCoordinator {
  const coordinator = NotificationLastReadPollCoordinator.getInstance();
  void coordinator.setRoute(route);
  void coordinator.start();
  return coordinator;
}

const fetchLastRead = () => vi.mocked(NotificationController.fetchLastReadFromHomeserver);

/** Runs the debounce after a trigger. */
const settleDebounce = () => vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);

describe('NotificationLastReadPollCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    NotificationLastReadPollCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.spyOn(NotificationController, 'fetchLastReadFromHomeserver').mockResolvedValue(undefined);
  });

  afterEach(() => {
    NotificationLastReadPollCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('triggers', () => {
    it('refreshes on start, once the debounce has passed', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);

      expect(fetchLastRead()).not.toHaveBeenCalled();

      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledExactlyOnceWith(PUBKY);
    });

    it('refreshes every poll interval while visible', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).toHaveBeenCalledTimes(3);
    });

    it('refreshes on online', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchLastRead().mockClear();

      window.dispatchEvent(new Event('online'));
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledExactlyOnceWith(PUBKY);
    });

    it('refreshes when the tab becomes visible and restarts the interval from there', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchLastRead().mockClear();

      setVisibilityState('hidden');
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS * 3);
      setVisibilityState('visible');
      await settleDebounce();
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(
        NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS - NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
      );
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
      await settleDebounce();
      expect(fetchLastRead()).toHaveBeenCalledTimes(2);
    });

    it('refreshes once the persisted session is restored after start', async () => {
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      expect(fetchLastRead()).not.toHaveBeenCalled();

      signIn();
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledExactlyOnceWith(PUBKY);
    });
  });

  describe('debounce', () => {
    it('makes one read of triggers that land together', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));

      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
    });

    it('waits the full debounce after the last trigger', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS - 1);
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS - 1);
      expect(fetchLastRead()).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
    });
  });

  describe('page visibility', () => {
    it('pauses while hidden: no interval, no online refresh and a pending refresh is dropped', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);

      setVisibilityState('hidden');
      expect(vi.getTimerCount()).toBe(0);

      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS * 3);

      expect(fetchLastRead()).not.toHaveBeenCalled();
    });

    it('does not start polling while the tab loads hidden', async () => {
      setVisibilityState('hidden');
      NotificationLastReadPollCoordinator.resetInstance();
      signIn();
      startOn(APP_ROUTES.HOME);

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).not.toHaveBeenCalled();

      setVisibilityState('visible');
      await settleDebounce();
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
    });

    it('keeps polling while hidden when the runtime config does not respect visibility, and refreshes on return', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);
      coordinator.configure({ respectPageVisibility: false });
      await settleDebounce();
      fetchLastRead().mockClear();

      setVisibilityState('hidden');
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
      fetchLastRead().mockClear();

      setVisibilityState('visible');
      await settleDebounce();
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
    });

    it('refreshes on online while hidden when the runtime config does not respect visibility', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);
      coordinator.configure({ respectPageVisibility: false });
      await settleDebounce();
      fetchLastRead().mockClear();

      setVisibilityState('hidden');
      window.dispatchEvent(new Event('online'));
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
    });
  });

  describe('route gating', () => {
    it.each([AUTH_ROUTES.SIGN_IN, AUTH_ROUTES.LOGOUT, '/onboarding/profile'])('does not poll on %s', async (route) => {
      signIn();
      startOn(route);

      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS * 2);

      expect(fetchLastRead()).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('refreshes after crossing from a disabled route to an allowed one', async () => {
      signIn();
      const coordinator = startOn(AUTH_ROUTES.SIGN_IN);

      void coordinator.setRoute(APP_ROUTES.HOME);
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
    });

    it('neither refreshes nor restarts the interval when moving between allowed routes', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchLastRead().mockClear();

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS / 2);
      void coordinator.setRoute(PROFILE_ROUTES.PROFILE);
      await settleDebounce();
      expect(fetchLastRead()).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS / 2);
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
    });

    it('stops polling and drops a pending refresh when moving to a disabled route', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);

      void coordinator.setRoute(AUTH_ROUTES.LOGOUT);

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).not.toHaveBeenCalled();
    });
  });

  describe('auth', () => {
    it('does not poll without a profile', async () => {
      useAuthStore.getState().init({ session: mockSession(), currentUserPubky: PUBKY, hasProfile: false });
      startOn(APP_ROUTES.HOME);

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);

      expect(fetchLastRead()).not.toHaveBeenCalled();
    });

    it('starts polling once the profile is created after start (onboarding in an open tab)', async () => {
      useAuthStore.getState().init({ session: mockSession(), currentUserPubky: PUBKY, hasProfile: false });
      startOn(APP_ROUTES.HOME);
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).not.toHaveBeenCalled();

      useAuthStore.getState().setHasProfile(true);
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledExactlyOnceWith(PUBKY);
    });

    it('stops polling when the session ends', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchLastRead().mockClear();

      useAuthStore.getState().reset();

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).not.toHaveBeenCalled();
    });

    it('refreshes the new account right away when the account changes', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchLastRead().mockClear();

      signIn(OTHER_PUBKY);
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledExactlyOnceWith(OTHER_PUBKY);
    });
  });

  describe('a refresh that fails or takes long', () => {
    it('logs a failed refresh once, keeps polling, and the next tick retries', async () => {
      const logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      const error = new Error('temporary');
      fetchLastRead().mockRejectedValueOnce(error);
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalledExactlyOnceWith('Notification last_read refresh failed', { error });

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);

      expect(fetchLastRead()).toHaveBeenCalledTimes(2);
      expect(logError).toHaveBeenCalledOnce();
    });

    it('does not stack a read on one still out, and resumes once it settles', async () => {
      let finish: () => void = () => {};
      fetchLastRead().mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();

      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS * 2);
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);

      finish();
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).toHaveBeenCalledTimes(2);
    });

    it('recovers from a read that never settles after a return to the tab', async () => {
      fetchLastRead().mockImplementationOnce(() => new Promise<void>(() => {}));
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();

      setVisibilityState('hidden');
      setVisibilityState('visible');
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledTimes(2);
    });

    it('recovers from a read that never settles when the same account signs in again', async () => {
      fetchLastRead().mockImplementationOnce(() => new Promise<void>(() => {}));
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();

      useAuthStore.getState().reset();
      signIn();
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenCalledTimes(2);
    });

    it('does not let an older read that settles late free the slot of the newer one', async () => {
      const finish: Array<() => void> = [];
      const pendingRead = () =>
        new Promise<void>((resolve) => {
          finish.push(resolve);
        });
      fetchLastRead().mockImplementationOnce(pendingRead).mockImplementationOnce(pendingRead);
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      setVisibilityState('hidden');
      setVisibilityState('visible');
      await settleDebounce();
      expect(fetchLastRead()).toHaveBeenCalledTimes(2);

      finish[0]();
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).toHaveBeenCalledTimes(2);

      finish[1]();
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).toHaveBeenCalledTimes(3);
    });

    it("does not let a previous account's slow read hold back the new account", async () => {
      fetchLastRead().mockImplementationOnce(() => new Promise<void>(() => {}));
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      expect(fetchLastRead()).toHaveBeenCalledWith(PUBKY);

      signIn(OTHER_PUBKY);
      await settleDebounce();

      expect(fetchLastRead()).toHaveBeenLastCalledWith(OTHER_PUBKY);
    });
  });

  // Through the real controller and application: only the homeserver GET is stubbed
  describe('a homeserver read that never answers', () => {
    let request: MockInstance<typeof HomeserverService.request>;
    const refreshFailures = () =>
      vi.mocked(Logger.error).mock.calls.filter(([message]) => message === 'Notification last_read refresh failed');

    beforeEach(() => {
      fetchLastRead().mockRestore();
      vi.spyOn(Logger, 'error').mockImplementation(() => {});
      request = vi.spyOn(HomeserverService, 'request');
    });

    it('frees the slot at the sync-read bound when the first read hangs, and the next trigger reads again', async () => {
      request.mockImplementation(() => new Promise(() => {}));
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      expect(request).toHaveBeenCalledTimes(1);

      // A trigger just before the bound ends is debounced into a refresh the taken slot would hide
      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS - 1);
      window.dispatchEvent(new Event('online'));
      expect(refreshFailures()).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(refreshFailures()).toEqual([
        [
          'Notification last_read refresh failed',
          { error: expect.objectContaining({ code: TimeoutErrorCode.REQUEST_TIMEOUT }) },
        ],
      ]);
      expect(request).toHaveBeenCalledTimes(1);

      await settleDebounce();
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('frees the slot when a later read hangs, and never applies what that read answers late', async () => {
      let answerLate: (value: { timestamp: number }) => void = () => {};
      request
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              answerLate = resolve;
            }),
        )
        .mockResolvedValue(null);
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(request).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);
      expect(refreshFailures()).toHaveLength(1);
      const reads = request.mock.calls.length;
      window.dispatchEvent(new Event('online'));
      await settleDebounce();
      expect(request).toHaveBeenCalledTimes(reads + 1);

      const lastRead = useNotificationStore.getState().lastRead;
      answerLate({ timestamp: Date.now() + 1_000_000 });
      await vi.advanceTimersByTimeAsync(0);
      expect(useNotificationStore.getState().lastRead).toBe(lastRead);
    });
  });

  describe('stop and destroy', () => {
    it('stop clears the interval and a pending refresh, and start resumes', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);

      coordinator.stop();

      expect(vi.getTimerCount()).toBe(0);
      window.dispatchEvent(new Event('online'));
      setVisibilityState('visible');
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).not.toHaveBeenCalled();

      void coordinator.start();
      await settleDebounce();
      expect(fetchLastRead()).toHaveBeenCalledTimes(1);
    });

    it('destroy clears the timers and removes every listener', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);

      coordinator.destroy();

      expect(vi.getTimerCount()).toBe(0);
      window.dispatchEvent(new Event('online'));
      setVisibilityState('visible');
      signIn(OTHER_PUBKY);
      await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_POLL_INTERVAL_MS);
      expect(fetchLastRead()).not.toHaveBeenCalled();
    });
  });
});
