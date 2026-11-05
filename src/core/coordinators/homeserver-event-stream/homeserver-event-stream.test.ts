import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import {
  HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD,
  HOMESERVER_EVENT_STREAM_HEALTHY_AFTER_MS,
  HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS,
  HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS,
} from '@/config/homeserver-event-stream';
import { HomeserverEventController } from '@/controllers/homeserver-event/homeserver-event';
import type {
  THomeserverEvent,
  TSubscribeUserEventStreamParams,
} from '@/controllers/homeserver-event/homeserver-event.types';
import {
  HomeserverEventStreamCoordinator,
  type THomeserverEventStreamChannel,
} from '@/coordinators/homeserver-event-stream/homeserver-event-stream';
import type { AppError } from '@/libs/error/error';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION } from '@/libs/observability/sentry.constants';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthState } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
const otherPubky = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy' as Pubky;
const MUTES_PATH = '/pub/pubky.app/mutes/';
const LAST_READ_PATH = '/pub/pubky.app/last_read';
const EXHAUSTED_OPERATION = 'homeserverEventStreamExhausted';

type TestChannel = THomeserverEventStreamChannel & {
  readCursor: MockInstance<(pubky: Pubky) => string | null>;
  reconcileOnConnect: MockInstance<(pubky: Pubky) => Promise<unknown>>;
  handleEvent: MockInstance<(pubky: Pubky, event: THomeserverEvent) => void>;
  reset: MockInstance<() => void>;
};

function createChannel(path: string, isReadyToSync: (auth: AuthState) => boolean = () => true): TestChannel {
  return {
    path,
    isReadyToSync,
    readCursor: vi.fn<(pubky: Pubky) => string | null>().mockReturnValue(null),
    reconcileOnConnect: vi.fn<(pubky: Pubky) => Promise<unknown>>().mockResolvedValue(undefined),
    handleEvent: vi.fn<(pubky: Pubky, event: THomeserverEvent) => void>(),
    reset: vi.fn<() => void>(),
  };
}

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

function signIn(user: Pubky = pubky): void {
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: user, hasProfile: true });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function subscribeConnectFailure(): AppError {
  return Err.server(ServerErrorCode.INTERNAL_ERROR, 'HTTP transport error: error sending request', {
    service: ErrorService.Homeserver,
    operation: HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION,
  });
}

/** Backoff after the n-th consecutive failure (1-based), as scheduled by the coordinator. */
function backoffAfterFailure(n: number): number {
  return Math.min(
    HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS * 2 ** (n - 1),
    HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS,
  );
}

function escalationReports(serverSpy: MockInstance<typeof Err.server>): number {
  return serverSpy.mock.calls.filter(([, , params]) => params.operation === EXHAUSTED_OPERATION).length;
}

describe('HomeserverEventStreamCoordinator', () => {
  let subscribe: MockInstance<typeof HomeserverEventController.subscribeUserEventStream>;

  const subscribeParams = (call: number): TSubscribeUserEventStreamParams => subscribe.mock.calls[call][0];

  function startWith(...channels: THomeserverEventStreamChannel[]): HomeserverEventStreamCoordinator {
    const coordinator = HomeserverEventStreamCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    for (const channel of channels) {
      coordinator.register(channel);
    }
    coordinator.start();
    return coordinator;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    HomeserverEventStreamCoordinator.resetInstance();
    useAuthStore.getState().reset();
    subscribe = vi
      .spyOn(HomeserverEventController, 'subscribeUserEventStream')
      .mockImplementation(async () => new ReadableStream<THomeserverEvent>());
  });

  afterEach(() => {
    HomeserverEventStreamCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('one shared subscription', () => {
    it('subscribes once to the union of the channel paths and hands every event to every channel', async () => {
      const mutes = createChannel(MUTES_PATH);
      const lastRead = createChannel(LAST_READ_PATH);
      const event: THomeserverEvent = { cursor: '42', eventType: 'PUT', path: LAST_READ_PATH };
      subscribe.mockImplementation(
        async () =>
          new ReadableStream<THomeserverEvent>({
            start(controller) {
              controller.enqueue(event);
            },
          }),
      );
      signIn();

      startWith(mutes, lastRead);
      await flushPromises();

      expect(subscribe).toHaveBeenCalledOnce();
      expect(subscribeParams(0)).toMatchObject({ pubky, cursor: null, paths: [MUTES_PATH, LAST_READ_PATH] });
      expect(mutes.reconcileOnConnect).toHaveBeenCalledWith(pubky);
      expect(lastRead.reconcileOnConnect).toHaveBeenCalledWith(pubky);
      expect(mutes.handleEvent).toHaveBeenCalledWith(pubky, event);
      expect(lastRead.handleEvent).toHaveBeenCalledWith(pubky, event);
    });

    it('resumes from the earliest channel cursor so no channel misses an event', async () => {
      const mutes = createChannel(MUTES_PATH);
      const lastRead = createChannel(LAST_READ_PATH);
      mutes.readCursor.mockReturnValue('120');
      lastRead.readCursor.mockReturnValue('95');
      signIn();

      startWith(mutes, lastRead);
      await flushPromises();

      expect(subscribeParams(0).cursor).toBe('95');
    });

    it('replays from the start when any channel has no cursor yet', async () => {
      const mutes = createChannel(MUTES_PATH);
      const lastRead = createChannel(LAST_READ_PATH);
      mutes.readCursor.mockReturnValue('120');
      signIn();

      startWith(mutes, lastRead);
      await flushPromises();

      expect(subscribeParams(0).cursor).toBeNull();
    });

    it('leaves a channel out until it is ready, then reconnects once with its path added', async () => {
      const mutes = createChannel(MUTES_PATH);
      const lastRead = createChannel(LAST_READ_PATH, (auth) => !auth.needsAccountSync);
      signIn();
      useAuthStore.getState().setNeedsAccountSync(true);

      startWith(mutes, lastRead);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();
      expect(subscribeParams(0).paths).toEqual([MUTES_PATH]);

      useAuthStore.getState().setNeedsAccountSync(false);
      await flushPromises();

      expect(subscribeParams(0).signal.aborted).toBe(true);
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(subscribeParams(1).paths).toEqual([MUTES_PATH, LAST_READ_PATH]);
    });

    it('does not subscribe without a ready channel', async () => {
      signIn();
      const coordinator = startWith(createChannel(LAST_READ_PATH, () => false));
      await flushPromises();
      expect(subscribe).not.toHaveBeenCalled();

      coordinator.register(createChannel(MUTES_PATH));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();
      expect(subscribeParams(0).paths).toEqual([MUTES_PATH]);
    });

    it('drops a channel that unregisters and resets its pending work', async () => {
      const mutes = createChannel(MUTES_PATH);
      const lastRead = createChannel(LAST_READ_PATH);
      signIn();
      const coordinator = startWith(mutes, lastRead);
      await flushPromises();

      coordinator.unregister(lastRead);
      await flushPromises();

      expect(lastRead.reset).toHaveBeenCalled();
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(subscribeParams(1).paths).toEqual([MUTES_PATH]);
    });

    it('fails the connection when a channel cannot reconcile, and reconnects after the backoff', async () => {
      const mutes = createChannel(MUTES_PATH);
      const lastRead = createChannel(LAST_READ_PATH);
      lastRead.reconcileOnConnect.mockRejectedValueOnce(new Error('read failed'));
      subscribe.mockImplementation(
        async () =>
          new ReadableStream<THomeserverEvent>({
            start(controller) {
              controller.enqueue({ cursor: '8', eventType: 'PUT', path: MUTES_PATH });
            },
          }),
      );
      signIn();

      startWith(mutes, lastRead);
      await flushPromises();
      expect(mutes.handleEvent).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(mutes.handleEvent).toHaveBeenCalledOnce();
    });
  });

  describe('teardown', () => {
    it('aborts the connection and cancels its stream on sign-out, and stays closed', async () => {
      const cancel = vi.fn();
      subscribe.mockImplementation(async () => new ReadableStream<THomeserverEvent>({ cancel }));
      const mutes = createChannel(MUTES_PATH);
      signIn();
      startWith(mutes);
      await flushPromises();

      useAuthStore.getState().reset();
      await flushPromises();

      expect(subscribeParams(0).signal.aborted).toBe(true);
      expect(cancel).toHaveBeenCalledOnce();
      expect(mutes.reset).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS);
      expect(subscribe).toHaveBeenCalledOnce();
    });

    it('tears the connection down on the logout route', async () => {
      const cancel = vi.fn();
      subscribe.mockImplementation(async () => new ReadableStream<THomeserverEvent>({ cancel }));
      signIn();
      const coordinator = startWith(createChannel(MUTES_PATH));
      await flushPromises();

      coordinator.setRoute(AUTH_ROUTES.LOGOUT);
      await flushPromises();

      expect(subscribeParams(0).signal.aborted).toBe(true);
      expect(cancel).toHaveBeenCalledOnce();
    });

    it('never holds two connections: a restart waits for the subscribe in flight and cancels its stream', async () => {
      const first = deferred<ReadableStream<THomeserverEvent>>();
      const cancelFirst = vi.fn();
      subscribe.mockImplementationOnce(() => first.promise);
      signIn();
      startWith(createChannel(MUTES_PATH));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      // Sign out and straight back in while the first subscribe has not resolved yet.
      useAuthStore.getState().reset();
      signIn(otherPubky);
      await flushPromises();
      expect(subscribeParams(0).signal.aborted).toBe(true);
      expect(subscribe).toHaveBeenCalledOnce();

      first.resolve(new ReadableStream<THomeserverEvent>({ cancel: cancelFirst }));
      await flushPromises();

      expect(cancelFirst).toHaveBeenCalledOnce();
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(subscribeParams(1).pubky).toBe(otherPubky);
    });

    it('closes the previous account’s connection before opening the next on an account switch', async () => {
      const order: string[] = [];
      subscribe.mockImplementation(async ({ pubky: user }) => {
        order.push(`open ${user}`);
        return new ReadableStream<THomeserverEvent>({ cancel: () => void order.push(`close ${user}`) });
      });
      signIn();
      startWith(createChannel(MUTES_PATH));
      await flushPromises();

      useAuthStore.getState().setCurrentUserPubky(otherPubky);
      await flushPromises();

      expect(order).toEqual([`open ${pubky}`, `close ${pubky}`, `open ${otherPubky}`]);
    });

    it('stops streaming on stop() and schedules no reconnect', async () => {
      subscribe.mockImplementation(
        async () =>
          new ReadableStream<THomeserverEvent>({
            start(controller) {
              controller.close();
            },
          }),
      );
      signIn();
      const coordinator = startWith(createChannel(MUTES_PATH));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      coordinator.stop();
      await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS + 100);
      expect(subscribe).toHaveBeenCalledOnce();
    });
  });

  describe('gating', () => {
    it('does not reconnect when moving between allowed routes', async () => {
      signIn();
      const coordinator = startWith(createChannel(MUTES_PATH));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      coordinator.setRoute(PROFILE_ROUTES.PROFILE);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();
    });

    it('opens the stream after navigating from a disabled route to an allowed route', async () => {
      signIn();
      const coordinator = HomeserverEventStreamCoordinator.getInstance();
      coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
      coordinator.register(createChannel(MUTES_PATH));
      coordinator.start();
      await flushPromises();
      await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS);
      expect(subscribe).not.toHaveBeenCalled();

      coordinator.setRoute(APP_ROUTES.HOME);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();
    });

    it('opens the stream once the persisted session is restored after start()', async () => {
      // Public-route reload: the persisted identity hydrates first, the live session lands later.
      useAuthStore.getState().setCurrentUserPubky(pubky);
      useAuthStore.getState().setHasProfile(true);
      startWith(createChannel(MUTES_PATH));
      await flushPromises();
      expect(subscribe).not.toHaveBeenCalled();

      signIn();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();
      expect(subscribeParams(0).pubky).toBe(pubky);
    });

    it('does not open the stream while signed out', async () => {
      startWith(createChannel(MUTES_PATH));
      await flushPromises();
      expect(subscribe).not.toHaveBeenCalled();
    });

    it('pauses the stream while hidden and resumes when visible', async () => {
      const cancel = vi.fn();
      subscribe.mockImplementation(async () => new ReadableStream<THomeserverEvent>({ cancel }));
      signIn();
      startWith(createChannel(MUTES_PATH));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      expect(subscribeParams(0).signal.aborted).toBe(true);
      expect(cancel).toHaveBeenCalledOnce();

      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('persistent stream failures', () => {
    function startFailingStream(): void {
      signIn();
      startWith(createChannel(MUTES_PATH), createChannel(LAST_READ_PATH));
    }

    it('reports the outage to Sentry exactly once when the failure streak reaches the threshold', async () => {
      subscribe.mockImplementation(async () => {
        throw subscribeConnectFailure();
      });
      const serverSpy = vi.spyOn(Err, 'server');

      startFailingStream();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      for (let failure = 1; failure < HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        expect(escalationReports(serverSpy)).toBe(0);
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure));
        await flushPromises();
        expect(subscribe).toHaveBeenCalledTimes(failure + 1);
      }

      expect(escalationReports(serverSpy)).toBe(1);
      const [, message, params] = serverSpy.mock.calls.find(([, , p]) => p.operation === EXHAUSTED_OPERATION)!;
      expect(message).toBe('Homeserver event stream unavailable after repeated failures');
      expect(params).toMatchObject({
        service: ErrorService.Homeserver,
        context: {
          consecutiveFailures: HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD,
          paths: [MUTES_PATH, LAST_READ_PATH],
          lastErrorCode: ServerErrorCode.INTERNAL_ERROR,
          lastErrorOperation: HOMESERVER_EVENT_STREAM_SUBSCRIBE_OPERATION,
        },
      });
      expect(params.cause).toBeUndefined();

      // Keeps reconnecting past the threshold without reporting again.
      await vi.advanceTimersByTimeAsync(backoffAfterFailure(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD + 1);
      expect(escalationReports(serverSpy)).toBe(1);
    });

    it('doubles the reconnect delay per consecutive failure up to the cap', async () => {
      subscribe.mockImplementation(async () => {
        throw subscribeConnectFailure();
      });

      startFailingStream();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(backoffAfterFailure(1));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(backoffAfterFailure(2) - 1);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(3);

      let failures = 3;
      while (backoffAfterFailure(failures) < HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS) {
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failures));
        await flushPromises();
        failures += 1;
        expect(subscribe).toHaveBeenCalledTimes(failures);
      }
      await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS - 1);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(failures);
      await vi.advanceTimersByTimeAsync(1);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(failures + 1);
    });

    it('ignores a rejection from a stale loop so the next loop does not inherit the failure', async () => {
      const stale = deferred<ReadableStream<THomeserverEvent>>();
      subscribe.mockImplementationOnce(() => stale.promise);
      subscribe.mockImplementation(async () => {
        throw subscribeConnectFailure();
      });
      const serverSpy = vi.spyOn(Err, 'server');

      startFailingStream();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      // Restart while the first subscribe is still pending: the next loop waits for it to settle.
      const coordinator = HomeserverEventStreamCoordinator.getInstance();
      coordinator.stop();
      coordinator.start();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      stale.reject(subscribeConnectFailure());
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(2);

      // New loop: 1 own failure + 0 inherited; the report lands on its threshold-th own failure.
      for (let ownFailures = 1; ownFailures < HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD; ownFailures += 1) {
        expect(escalationReports(serverSpy)).toBe(0);
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(ownFailures));
        await flushPromises();
      }
      expect(subscribe).toHaveBeenCalledTimes(1 + HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD);
      expect(escalationReports(serverSpy)).toBe(1);
    });

    /** Subscribe resolves to an idle stream (read never completes) that can be errored later from the test. */
    function subscribeIdleStreams(): { dropCurrent: () => void } {
      let controller: ReadableStreamDefaultController<THomeserverEvent> | undefined;
      subscribe.mockImplementation(async () => {
        return new ReadableStream<THomeserverEvent>({
          start(c) {
            controller = c;
          },
        });
      });
      return {
        dropCurrent: () => {
          controller?.error(subscribeConnectFailure());
          controller = undefined;
        },
      };
    }

    it('does not treat drops of long-lived idle connections as an accumulating outage', async () => {
      const idle = subscribeIdleStreams();
      const serverSpy = vi.spyOn(Err, 'server');
      const tenMinutes = 10 * 60 * 1000;

      startFailingStream();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      for (let connection = 1; connection <= HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD + 1; connection += 1) {
        await vi.advanceTimersByTimeAsync(tenMinutes);
        idle.dropCurrent();
        await flushPromises();
        // Each drop starts a fresh streak of 1, so the reconnect delay stays at the base value.
        await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS);
        await flushPromises();
        expect(subscribe).toHaveBeenCalledTimes(connection + 1);
      }

      expect(escalationReports(serverSpy)).toBe(0);
    });

    it('still reports when connections are established but drop again before the healthy window', async () => {
      const idle = subscribeIdleStreams();
      const serverSpy = vi.spyOn(Err, 'server');

      startFailingStream();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      for (let failure = 1; failure <= HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_HEALTHY_AFTER_MS - 1);
        idle.dropCurrent();
        await flushPromises();
        expect(escalationReports(serverSpy)).toBe(failure === HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD ? 1 : 0);
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure));
        await flushPromises();
      }

      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD + 1);
      expect(escalationReports(serverSpy)).toBe(1);
    });

    it('resets the failure streak after a healthy read so a later blip does not report', async () => {
      let call = 0;
      subscribe.mockImplementation(async () => {
        call += 1;
        // Fail (threshold - 1) times, then deliver one event and close, then fail again.
        if (call === HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD) {
          return new ReadableStream<THomeserverEvent>({
            start(controller) {
              controller.enqueue({ cursor: '1', eventType: 'PUT', path: MUTES_PATH });
              controller.close();
            },
          });
        }
        throw subscribeConnectFailure();
      });
      const serverSpy = vi.spyOn(Err, 'server');

      startFailingStream();
      await flushPromises();

      for (let failure = 1; failure < HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure));
        await flushPromises();
      }
      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD);
      expect(escalationReports(serverSpy)).toBe(0);

      // Stream closed cleanly → reconnect after the base delay (streak is 0) → fails once.
      await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD + 1);
      expect(escalationReports(serverSpy)).toBe(0);
    });

    it('treats a stream that closes before delivering an event as a failure: backoff grows and the outage reports', async () => {
      subscribe.mockImplementation(async () => {
        return new ReadableStream<THomeserverEvent>({
          start(controller) {
            controller.close();
          },
        });
      });
      const serverSpy = vi.spyOn(Err, 'server');

      startFailingStream();
      await flushPromises();
      expect(subscribe).toHaveBeenCalledOnce();

      for (let failure = 1; failure < HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        expect(escalationReports(serverSpy)).toBe(0);
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure) - 1);
        await flushPromises();
        expect(subscribe).toHaveBeenCalledTimes(failure);
        await vi.advanceTimersByTimeAsync(1);
        await flushPromises();
        expect(subscribe).toHaveBeenCalledTimes(failure + 1);
      }

      expect(escalationReports(serverSpy)).toBe(1);
      const [, , params] = serverSpy.mock.calls.find(([, , p]) => p.operation === EXHAUSTED_OPERATION)!;
      expect(params.context).toMatchObject({
        consecutiveFailures: HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD,
        lastFailure: 'prematureClose',
      });
    });

    it('lets a healthy connection torn down by hide/show clear earlier failures instead of carrying them over', async () => {
      const tenMinutes = 10 * 60 * 1000;
      let call = 0;
      subscribe.mockImplementation(async () => {
        call += 1;
        // Fail (threshold - 1) times, then hand out an idle stream that stays healthy until torn down, then fail.
        if (call === HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD) {
          return new ReadableStream<THomeserverEvent>({ start() {} });
        }
        throw subscribeConnectFailure();
      });
      const serverSpy = vi.spyOn(Err, 'server');

      startFailingStream();
      await flushPromises();
      for (let failure = 1; failure < HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure));
        await flushPromises();
      }
      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD);
      expect(escalationReports(serverSpy)).toBe(0);

      await vi.advanceTimersByTimeAsync(tenMinutes);
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD + 1);

      // The reconnect after show failed once: with the streak cleared by the healthy connection, that is 1, not
      // threshold — no report, and the next reconnect is scheduled at the base delay.
      expect(escalationReports(serverSpy)).toBe(0);
      await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD + 2);
      expect(escalationReports(serverSpy)).toBe(0);
    });

    it('scopes the failure streak to the signed-in user so a second user’s outage is reported on its own', async () => {
      subscribe.mockImplementation(async () => {
        throw subscribeConnectFailure();
      });
      const serverSpy = vi.spyOn(Err, 'server');

      startFailingStream();
      await flushPromises();
      for (let failure = 1; failure < HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure));
        await flushPromises();
      }
      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD);
      expect(escalationReports(serverSpy)).toBe(1);

      // Switch users mid-outage: the new loop starts a streak of its own instead of inheriting the exhausted one.
      useAuthStore.getState().setCurrentUserPubky(otherPubky);
      await flushPromises();
      expect(subscribe).toHaveBeenCalledTimes(HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD + 1);
      expect(subscribe.mock.lastCall?.[0]).toMatchObject({ pubky: otherPubky, cursor: null });
      expect(escalationReports(serverSpy)).toBe(1);

      for (let failure = 1; failure < HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD; failure += 1) {
        expect(escalationReports(serverSpy)).toBe(1);
        await vi.advanceTimersByTimeAsync(backoffAfterFailure(failure));
        await flushPromises();
      }
      expect(subscribe).toHaveBeenCalledTimes(2 * HOMESERVER_EVENT_STREAM_FAILURE_ALERT_THRESHOLD);
      expect(escalationReports(serverSpy)).toBe(2);
    });
  });
});
