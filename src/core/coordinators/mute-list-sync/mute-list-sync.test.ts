import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import {
  MUTE_SYNC_CURSOR_STORAGE_PREFIX,
  MUTE_SYNC_DEBOUNCE_MS,
  MUTE_SYNC_RECONNECT_BACKOFF_MAX_MS,
  MUTE_SYNC_RECONNECT_BACKOFF_MS,
  MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD,
} from '@/config/mute-sync';
import { MuteController } from '@/controllers/mute/mute';
import type { TMuteDirectoryEvent } from '@/controllers/mute/mute.types';
import { MuteListSyncCoordinator } from '@/coordinators/mute-list-sync/mute-list-sync';
import type { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION } from '@/libs/observability/sentry.constants';
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

  describe('persistent stream failures', () => {
    const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

    function subscribeConnectFailure(): AppError {
      return Err.server(ServerErrorCode.INTERNAL_ERROR, 'HTTP transport error: error sending request', {
        service: ErrorService.Homeserver,
        operation: HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION,
      });
    }

    /** Backoff after the n-th consecutive failure (1-based), as scheduled by the coordinator. */
    function backoffAfterFailure(n: number): number {
      return Math.min(MUTE_SYNC_RECONNECT_BACKOFF_MS * 2 ** (n - 1), MUTE_SYNC_RECONNECT_BACKOFF_MAX_MS);
    }

    function startCoordinator(): void {
      useAuthStore.getState().init({ session: mockSession(), currentUserPubky: pubky, hasProfile: true });
      const coordinator = MuteListSyncCoordinator.getInstance();
      coordinator.setRoute(APP_ROUTES.HOME);
      coordinator.start();
    }

    type ErrServerSpy = MockInstance<typeof Err.server>;

    function escalationReports(serverSpy: ErrServerSpy): number {
      return serverSpy.mock.calls.filter(([, , params]) => params.operation === 'muteListEventStreamExhausted').length;
    }

    it('reports the outage to Sentry exactly once when the failure streak reaches the threshold', async () => {
      vi.mocked(MuteController.subscribeMuteDirectoryEventStream).mockImplementation(async () => {
        throw subscribeConnectFailure();
      });
      const serverSpy = vi.spyOn(Err, 'server');
      const subscribe = vi.mocked(MuteController.subscribeMuteDirectoryEventStream);

      startCoordinator();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(1);

      for (let failure = 1; failure < MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        expect(escalationReports(serverSpy)).toBe(0);
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure));
        await flushPromises();
        expect(subscribe).toHaveBeenCalledTimes(failure + 1);
      }

      expect(escalationReports(serverSpy)).toBe(1);
      const [, , params] = serverSpy.mock.calls.find(([, , p]) => p.operation === 'muteListEventStreamExhausted')!;
      expect(params).toMatchObject({
        service: ErrorService.Homeserver,
        context: {
          consecutiveFailures: MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD,
          lastErrorCode: ServerErrorCode.INTERNAL_ERROR,
          lastErrorOperation: HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION,
        },
      });
      expect(params.cause).toBeUndefined();

      // Keeps reconnecting past the threshold without reporting again.
      await vi.advanceTimersByTimeAsync(backoffAfterFailure(MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD + 1);
      expect(escalationReports(serverSpy)).toBe(1);
    });

    it('doubles the reconnect delay per consecutive failure up to the cap', async () => {
      vi.mocked(MuteController.subscribeMuteDirectoryEventStream).mockImplementation(async () => {
        throw subscribeConnectFailure();
      });
      const subscribe = vi.mocked(MuteController.subscribeMuteDirectoryEventStream);

      startCoordinator();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(1);

      // Second failure is scheduled at 2 × base: not yet at base, present just after 2 × base.
      await vi.advanceTimersByTimeAsync(backoffAfterFailure(1));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(backoffAfterFailure(2) - 1);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(3);

      // Walk to the cap and confirm the delay stops growing.
      let failures = 3;
      while (backoffAfterFailure(failures) < MUTE_SYNC_RECONNECT_BACKOFF_MAX_MS) {
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failures));
        await flushPromises();
        failures += 1;
        expect(subscribe).toHaveBeenCalledTimes(failures);
      }
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_RECONNECT_BACKOFF_MAX_MS - 1);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(failures);
      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(failures + 1);
    });

    it('ignores a rejection from a stale loop generation so the new loop does not inherit the failure', async () => {
      const subscribe = vi.mocked(MuteController.subscribeMuteDirectoryEventStream);
      let rejectStale: ((error: unknown) => void) | undefined;
      subscribe.mockImplementationOnce(
        () =>
          new Promise<ReadableStream<TMuteDirectoryEvent>>((_, reject) => {
            rejectStale = reject;
          }),
      );
      subscribe.mockImplementation(async () => {
        throw subscribeConnectFailure();
      });
      const serverSpy = vi.spyOn(Err, 'server');

      startCoordinator();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(rejectStale).toBeDefined();

      // Restart while the first subscribe is still pending: generation 1 is now stale.
      const coordinator = MuteListSyncCoordinator.getInstance();
      coordinator.stop();
      coordinator.start();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(2);

      // The stale generation rejects after the new loop already failed once.
      rejectStale!(subscribeConnectFailure());
      await flushPromises();

      // New loop: 1 own failure + 0 inherited. If the stale rejection had counted, the streak would be 2 and the
      // threshold-th own failure would report one early; walk exactly (threshold - 1) more failures and assert
      // no report, then one more and assert the report.
      for (let ownFailures = 1; ownFailures < MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD; ownFailures += 1) {
        expect(escalationReports(serverSpy)).toBe(0);
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(ownFailures));
        await flushPromises();
      }
      expect(subscribe).toHaveBeenCalledTimes(1 + MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD);
      expect(escalationReports(serverSpy)).toBe(1);
    });

    it('resets the failure streak after a healthy read so a later blip does not report', async () => {
      const subscribe = vi.mocked(MuteController.subscribeMuteDirectoryEventStream);
      let call = 0;
      subscribe.mockImplementation(async () => {
        call += 1;
        // Fail (threshold - 1) times, then deliver one event and close, then fail again.
        if (call === MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD) {
          return new ReadableStream({
            start(controller) {
              controller.enqueue({ cursor: 'c1', eventType: 'CURSOR' });
              controller.close();
            },
          });
        }
        throw subscribeConnectFailure();
      });
      const serverSpy = vi.spyOn(Err, 'server');

      startCoordinator();
      await flushPromises();

      for (let failure = 1; failure < MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure));
        await flushPromises();
      }
      // The threshold-th connect succeeded and read an event: streak reset, no report.
      expect(subscribe).toHaveBeenCalledTimes(MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD);
      expect(escalationReports(serverSpy)).toBe(0);

      // Stream closed cleanly → reconnect after the base delay (streak is 0) → fails once.
      await vi.advanceTimersByTimeAsync(MUTE_SYNC_RECONNECT_BACKOFF_MS);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD + 1);
      expect(escalationReports(serverSpy)).toBe(0);
    });
  });
});
