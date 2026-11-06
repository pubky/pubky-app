import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import {
  HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS,
  HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS,
} from '@/config/homeserver-event-stream';
import { HomeserverEventController } from '@/controllers/homeserver-event/homeserver-event';
import type { THomeserverEvent } from '@/controllers/homeserver-event/homeserver-event.types';
import {
  EventStreamSyncCoordinator,
  type TEventStreamSyncConfig,
} from '@/coordinators/base/event-stream-sync-coordinator';
import { HomeserverEventStreamCoordinator } from '@/coordinators/homeserver-event-stream/homeserver-event-stream';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
const OWN_PATH = '/pub/test.app/things/';
const OTHER_PATH = '/pub/test.app/other';

const config: TEventStreamSyncConfig = {
  coordinatorName: 'TestStreamSyncCoordinator',
  streamLabel: 'Test stream',
  path: OWN_PATH,
  debounceMs: 250,
  cursorStoragePrefix: 'test-stream-cursor:',
};
const cursorKey = `${config.cursorStoragePrefix}${pubky}`;

class TestStreamSyncCoordinator extends EventStreamSyncCoordinator {
  readonly refreshSpy = vi.fn<(pubky: Pubky) => Promise<unknown>>().mockResolvedValue(undefined);

  constructor() {
    super(config);
  }

  protected refresh(pubky: Pubky): Promise<unknown> {
    return this.refreshSpy(pubky);
  }
}

async function flushPromises() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

function event(cursor: string, path = `${OWN_PATH}a`, eventType = 'PUT'): THomeserverEvent {
  return { cursor, eventType, path };
}

describe('EventStreamSyncCoordinator', () => {
  let coordinator: TestStreamSyncCoordinator | undefined;
  let subscribe: MockInstance<typeof HomeserverEventController.subscribeUserEventStream>;
  let open: ReadableStreamDefaultController<THomeserverEvent> | undefined;

  function startWithStream(...events: THomeserverEvent[]): TestStreamSyncCoordinator {
    subscribe.mockImplementation(
      async () =>
        new ReadableStream<THomeserverEvent>({
          start(controller) {
            open = controller;
            for (const item of events) controller.enqueue(item);
          },
        }),
    );
    const hub = HomeserverEventStreamCoordinator.getInstance();
    hub.setRoute(APP_ROUTES.HOME);
    coordinator ??= new TestStreamSyncCoordinator();
    coordinator.start();
    hub.start();
    return coordinator;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    HomeserverEventStreamCoordinator.resetInstance();
    useAuthStore.getState().reset();
    sessionStorage.clear();
    useAuthStore.getState().init({ session: mockSession(), currentUserPubky: pubky, hasProfile: true });
    subscribe = vi.spyOn(HomeserverEventController, 'subscribeUserEventStream');
    open = undefined;
  });

  afterEach(() => {
    coordinator?.destroy();
    coordinator = undefined;
    HomeserverEventStreamCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('registers its path with the shared stream', async () => {
    startWithStream();
    await flushPromises();

    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribe.mock.calls[0][0]).toMatchObject({ pubky, cursor: null, paths: [OWN_PATH] });
  });

  it('refreshes after the configured debounce and stores the cursor under the configured prefix', async () => {
    const current = startWithStream(event('7'));
    await flushPromises();

    await vi.advanceTimersByTimeAsync(config.debounceMs - 1);
    expect(current.refreshSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(current.refreshSpy).toHaveBeenCalledWith(pubky);
    expect(sessionStorage.getItem(cursorKey)).toBe('7');
  });

  it('does not refresh for another path, but moves its cursor past it', async () => {
    const current = startWithStream(event('9', OTHER_PATH));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(config.debounceMs);

    expect(current.refreshSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(cursorKey)).toBe('9');
  });

  it('keeps its cursor behind an own change whose refresh is still pending', async () => {
    const current = startWithStream(event('10'), event('11', OTHER_PATH));
    await flushPromises();
    expect(sessionStorage.getItem(cursorKey)).toBeNull();

    await vi.advanceTimersByTimeAsync(config.debounceMs);
    expect(current.refreshSpy).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(cursorKey)).toBe('10');
  });

  it('skips events replayed at or before its stored cursor', async () => {
    sessionStorage.setItem(cursorKey, '20');
    const current = startWithStream(event('19'), event('20'));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(config.debounceMs);
    expect(current.refreshSpy).not.toHaveBeenCalled();

    open?.enqueue(event('21'));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(config.debounceMs);
    expect(current.refreshSpy).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(cursorKey)).toBe('21');
  });

  it('reconciles on every connect, and a failed reconcile reconnects instead of reading the stream', async () => {
    const reconcile = vi.fn<(pubky: Pubky) => Promise<unknown>>().mockRejectedValueOnce(new Error('read failed'));
    reconcile.mockResolvedValue(undefined);
    class ReconcilingCoordinator extends TestStreamSyncCoordinator {
      public reconcileOnConnect(pubky: Pubky): Promise<unknown> {
        return reconcile(pubky);
      }
    }
    coordinator = new ReconcilingCoordinator();
    const current = startWithStream(event('8'));
    await flushPromises();

    expect(reconcile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(config.debounceMs);
    expect(current.refreshSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(cursorKey)).toBeNull();

    await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS);
    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(config.debounceMs);
    expect(current.refreshSpy).toHaveBeenCalledWith(pubky);
    expect(sessionStorage.getItem(cursorKey)).toBe('8');
  });

  it('backs a failing refresh off by doubling up to the cap, and starts over after one succeeds', async () => {
    coordinator = new TestStreamSyncCoordinator();
    coordinator.refreshSpy.mockRejectedValue(new Error('read failed'));
    const current = startWithStream(event('1'));
    await flushPromises();

    const callsAfter = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      return current.refreshSpy.mock.calls.length;
    };
    expect(await callsAfter(config.debounceMs)).toBe(1);
    let calls = 1;
    let delay = HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS;
    while (delay < HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS) {
      expect(await callsAfter(delay - 1)).toBe(calls);
      calls += 1;
      expect(await callsAfter(1)).toBe(calls);
      delay *= 2;
    }
    // Held at the cap.
    calls += 1;
    expect(await callsAfter(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS)).toBe(calls);
    calls += 1;
    expect(await callsAfter(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS)).toBe(calls);

    current.refreshSpy.mockResolvedValueOnce(undefined);
    calls += 1;
    expect(await callsAfter(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS)).toBe(calls);
    expect(sessionStorage.getItem(cursorKey)).toBe('1');

    open?.enqueue(event('2'));
    calls += 1;
    expect(await callsAfter(config.debounceMs)).toBe(calls);
    calls += 1;
    expect(await callsAfter(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS)).toBe(calls);
  });

  it('drops a pending refresh when the stream is torn down by sign-out', async () => {
    const current = startWithStream(event('3'));
    await flushPromises();

    useAuthStore.getState().reset();
    await vi.advanceTimersByTimeAsync(config.debounceMs + HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS);

    expect(current.refreshSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(cursorKey)).toBeNull();
  });

  it('leaves the shared stream on stop() and drops its pending refresh', async () => {
    const current = startWithStream(event('4'));
    await flushPromises();
    expect(subscribe).toHaveBeenCalledOnce();

    current.stop();
    await vi.advanceTimersByTimeAsync(config.debounceMs + HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MAX_MS);

    expect(current.refreshSpy).not.toHaveBeenCalled();
    expect(subscribe.mock.calls[0][0].signal.aborted).toBe(true);
    expect(subscribe).toHaveBeenCalledOnce();
  });
});
