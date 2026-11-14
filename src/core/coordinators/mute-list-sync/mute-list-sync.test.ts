import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import { MUTE_SYNC_DEBOUNCE_MS, MUTE_SYNC_POLL_INTERVAL_MS } from '@/config/mute-sync';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import { MuteController } from '@/controllers/mute/mute';
import { MuteListSyncCoordinator } from '@/coordinators/mute-list-sync/mute-list-sync';
import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { mockSession } from '@/test-utils/pubky';

const PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
const OTHER_PUBKY = 'c5nr657md9g8mut1xb7pyj8fuhm1aukwpmkqqjhiwsp9wdhmwzay' as Pubky;

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

function startOn(route: string): MuteListSyncCoordinator {
  const coordinator = MuteListSyncCoordinator.getInstance();
  void coordinator.setRoute(route);
  void coordinator.start();
  return coordinator;
}

const fetchMuted = () => vi.mocked(MuteController.fetchMutedUsers);

/** Runs the debounce after a trigger. */
const settleDebounce = () => vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS);

describe('MuteListSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    MuteListSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.spyOn(MuteController, 'fetchMutedUsers').mockResolvedValue([]);
  });

  afterEach(() => {
    MuteListSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('triggers', () => {
    it('refreshes on start, once the debounce has passed', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);

      expect(fetchMuted()).not.toHaveBeenCalled();

      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledExactlyOnceWith(PUBKY);
    });

    it('refreshes every poll interval while visible', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).toHaveBeenCalledTimes(3);
    });

    it('refreshes on online', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchMuted().mockClear();

      window.dispatchEvent(new Event('online'));
      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledExactlyOnceWith(PUBKY);
    });

    it('refreshes when the tab becomes visible and restarts the interval from there', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchMuted().mockClear();

      setVisibilityState('hidden');
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS * 3);
      setVisibilityState('visible');
      await settleDebounce();
      expect(fetchMuted()).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS - MUTE_SYNC_DEBOUNCE_MS);
      expect(fetchMuted()).toHaveBeenCalledTimes(1);
      await settleDebounce();
      expect(fetchMuted()).toHaveBeenCalledTimes(2);
    });

    it('refreshes once the persisted session is restored after start', async () => {
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      expect(fetchMuted()).not.toHaveBeenCalled();

      signIn();
      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledExactlyOnceWith(PUBKY);
    });
  });

  describe('debounce', () => {
    it('makes one LIST of triggers that land together', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));

      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledTimes(1);
    });

    it('waits the full debounce after the last trigger', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS - 1);
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS - 1);
      expect(fetchMuted()).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMuted()).toHaveBeenCalledTimes(1);
    });
  });

  describe('page visibility', () => {
    it('pauses while hidden: no interval, no online refresh and a pending refresh is dropped', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);

      setVisibilityState('hidden');
      expect(vi.getTimerCount()).toBe(0);

      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS * 3);

      expect(fetchMuted()).not.toHaveBeenCalled();
    });

    it('does not start polling while the tab loads hidden', async () => {
      setVisibilityState('hidden');
      MuteListSyncCoordinator.resetInstance();
      signIn();
      startOn(APP_ROUTES.HOME);

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).not.toHaveBeenCalled();

      setVisibilityState('visible');
      await settleDebounce();
      expect(fetchMuted()).toHaveBeenCalledTimes(1);
    });

    it('keeps polling while hidden when the runtime config does not respect visibility, and refreshes on return', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);
      coordinator.configure({ respectPageVisibility: false });
      await settleDebounce();
      fetchMuted().mockClear();

      setVisibilityState('hidden');
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).toHaveBeenCalledTimes(1);
      fetchMuted().mockClear();

      setVisibilityState('visible');
      await settleDebounce();
      expect(fetchMuted()).toHaveBeenCalledTimes(1);
    });

    it('refreshes on online while hidden when the runtime config does not respect visibility', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);
      coordinator.configure({ respectPageVisibility: false });
      await settleDebounce();
      fetchMuted().mockClear();

      setVisibilityState('hidden');
      window.dispatchEvent(new Event('online'));
      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledTimes(1);
    });
  });

  describe('route gating', () => {
    it.each([AUTH_ROUTES.SIGN_IN, AUTH_ROUTES.LOGOUT, '/onboarding/profile'])('does not poll on %s', async (route) => {
      signIn();
      startOn(route);

      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS * 2);

      expect(fetchMuted()).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('refreshes after crossing from a disabled route to an allowed one', async () => {
      signIn();
      const coordinator = startOn(AUTH_ROUTES.SIGN_IN);

      void coordinator.setRoute(APP_ROUTES.HOME);
      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledTimes(1);
    });

    it('neither refreshes nor restarts the interval when moving between allowed routes', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchMuted().mockClear();

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS / 2);
      void coordinator.setRoute(PROFILE_ROUTES.PROFILE);
      await settleDebounce();
      expect(fetchMuted()).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS / 2);
      expect(fetchMuted()).toHaveBeenCalledTimes(1);
    });

    it('stops polling and drops a pending refresh when moving to a disabled route', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);

      void coordinator.setRoute(AUTH_ROUTES.LOGOUT);

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).not.toHaveBeenCalled();
    });
  });

  describe('auth', () => {
    it('does not poll without a profile', async () => {
      useAuthStore.getState().init({ session: mockSession(), currentUserPubky: PUBKY, hasProfile: false });
      startOn(APP_ROUTES.HOME);

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);

      expect(fetchMuted()).not.toHaveBeenCalled();
    });

    it('stops polling when the session ends', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchMuted().mockClear();

      useAuthStore.getState().reset();

      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).not.toHaveBeenCalled();
    });

    it('refreshes the new account right away when the account changes', async () => {
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      fetchMuted().mockClear();

      signIn(OTHER_PUBKY);
      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledExactlyOnceWith(OTHER_PUBKY);
    });
  });

  describe('a refresh that fails or takes long', () => {
    it('keeps polling after a failed refresh, and the next tick retries', async () => {
      fetchMuted().mockRejectedValueOnce(new Error('temporary'));
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      expect(fetchMuted()).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);

      expect(fetchMuted()).toHaveBeenCalledTimes(2);
    });

    it('does not stack a LIST on one still out, and resumes once it settles', async () => {
      let finish: (value: Pubky[]) => void = () => {};
      fetchMuted().mockImplementationOnce(
        () =>
          new Promise<Pubky[]>((resolve) => {
            finish = resolve;
          }),
      );
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();

      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS * 2);
      expect(fetchMuted()).toHaveBeenCalledTimes(1);

      finish([]);
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).toHaveBeenCalledTimes(2);
    });

    it('recovers from a LIST that never settles after a return to the tab', async () => {
      fetchMuted().mockImplementationOnce(() => new Promise<Pubky[]>(() => {}));
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();

      setVisibilityState('hidden');
      setVisibilityState('visible');
      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledTimes(2);
    });

    it('recovers from a LIST that never settles when the same account signs in again', async () => {
      fetchMuted().mockImplementationOnce(() => new Promise<Pubky[]>(() => {}));
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();

      useAuthStore.getState().reset();
      signIn();
      await settleDebounce();

      expect(fetchMuted()).toHaveBeenCalledTimes(2);
    });

    it('does not let an older LIST that settles late free the slot of the newer one', async () => {
      const finish: Array<(value: Pubky[]) => void> = [];
      const pendingList = () =>
        new Promise<Pubky[]>((resolve) => {
          finish.push(resolve);
        });
      fetchMuted().mockImplementationOnce(pendingList).mockImplementationOnce(pendingList);
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      setVisibilityState('hidden');
      setVisibilityState('visible');
      await settleDebounce();
      expect(fetchMuted()).toHaveBeenCalledTimes(2);

      finish[0]([]);
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).toHaveBeenCalledTimes(2);

      finish[1]([]);
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).toHaveBeenCalledTimes(3);
    });

    it("does not let a previous account's slow LIST hold back the new account", async () => {
      fetchMuted().mockImplementationOnce(() => new Promise<Pubky[]>(() => {}));
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      expect(fetchMuted()).toHaveBeenCalledWith(PUBKY);

      signIn(OTHER_PUBKY);
      await settleDebounce();

      expect(fetchMuted()).toHaveBeenLastCalledWith(OTHER_PUBKY);
    });

    it('frees its slot once the bounded wait for a LIST that never answers ends, so the next trigger lists again', async () => {
      // The real controller and application, down to an in-memory homeserver whose LIST never answers.
      fetchMuted().mockRestore();
      const homeserver = stubMemoryHomeserver(PUBKY);
      homeserver.spies.list.mockImplementation(() => new Promise<string[]>(() => {}));
      const error = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      const refreshFailures = () => error.mock.calls.filter(([message]) => message === 'Mute list refresh failed');
      signIn();
      startOn(APP_ROUTES.HOME);
      await settleDebounce();
      expect(homeserver.spies.listAll).toHaveBeenCalledTimes(1);

      // A trigger just before the bound ends is debounced into a refresh the taken slot would hide.
      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS - 1);
      window.dispatchEvent(new Event('online'));
      expect(refreshFailures()).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1);
      expect(refreshFailures()).toEqual([
        ['Mute list refresh failed', { error: expect.objectContaining({ code: TimeoutErrorCode.REQUEST_TIMEOUT }) }],
      ]);
      expect(homeserver.spies.listAll).toHaveBeenCalledTimes(1);

      await settleDebounce();
      expect(homeserver.spies.listAll).toHaveBeenCalledTimes(2);

      // The second LIST never answers either: let its wait end, so no task is left in the per-tab lock queue.
      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);
      expect(refreshFailures()).toHaveLength(2);
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
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).not.toHaveBeenCalled();

      void coordinator.start();
      await settleDebounce();
      expect(fetchMuted()).toHaveBeenCalledTimes(1);
    });

    it('destroy clears the timers and removes every listener', async () => {
      signIn();
      const coordinator = startOn(APP_ROUTES.HOME);

      coordinator.destroy();

      expect(vi.getTimerCount()).toBe(0);
      window.dispatchEvent(new Event('online'));
      setVisibilityState('visible');
      signIn(OTHER_PUBKY);
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_POLL_INTERVAL_MS);
      expect(fetchMuted()).not.toHaveBeenCalled();
    });
  });
});
