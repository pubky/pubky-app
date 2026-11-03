import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import {
  EventStreamSyncCoordinator,
  type TEventStreamSyncConfig,
  type TEventStreamSyncEvent,
} from '@/coordinators/base/event-stream-sync-coordinator';
import { Err } from '@/libs/error/error.factories';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

const config: TEventStreamSyncConfig = {
  coordinatorName: 'TestStreamSyncCoordinator',
  streamLabel: 'Test stream',
  debounceMs: 250,
  cursorStoragePrefix: 'test-stream-cursor:',
  reconnectBackoffMs: 100,
  reconnectBackoffMaxMs: 400,
  healthyAfterMs: 10_000,
  failureAlertThreshold: 2,
  exhaustedOperation: 'testEventStreamExhausted',
  exhaustedMessage: 'Test event stream unavailable after repeated failures',
};

/** A subclass with its own timings, so the base is proven to read the config rather than mute constants. */
class TestStreamSyncCoordinator extends EventStreamSyncCoordinator<TEventStreamSyncEvent> {
  readonly subscribeSpy =
    vi.fn<(pubky: Pubky, cursor: string | null) => Promise<ReadableStream<TEventStreamSyncEvent>>>();
  readonly refreshSpy = vi.fn<(pubky: Pubky) => Promise<unknown>>().mockResolvedValue(undefined);

  constructor() {
    super(config);
  }

  protected subscribe(pubky: Pubky, cursor: string | null): Promise<ReadableStream<TEventStreamSyncEvent>> {
    return this.subscribeSpy(pubky, cursor);
  }

  protected refresh(pubky: Pubky): Promise<unknown> {
    return this.refreshSpy(pubky);
  }
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('EventStreamSyncCoordinator', () => {
  let coordinator: TestStreamSyncCoordinator | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.getState().reset();
    sessionStorage.clear();
    useAuthStore.getState().init({ session: mockSession(), currentUserPubky: pubky, hasProfile: true });
  });

  afterEach(() => {
    coordinator?.destroy();
    coordinator = undefined;
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('refreshes after the configured debounce and stores the cursor under the configured prefix', async () => {
    coordinator = new TestStreamSyncCoordinator();
    coordinator.subscribeSpy.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue({ cursor: 'c7', eventType: 'PUT' });
        },
      }),
    );
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();
    await flushPromises();

    expect(coordinator.subscribeSpy).toHaveBeenCalledWith(pubky, null);
    await vi.advanceTimersByTimeAsync(config.debounceMs - 1);
    expect(coordinator.refreshSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(coordinator.refreshSpy).toHaveBeenCalledWith(pubky);
    expect(sessionStorage.getItem(`${config.cursorStoragePrefix}${pubky}`)).toBe('c7');
  });

  it('reconciles on every connect, and a failed reconcile reconnects instead of reading the stream', async () => {
    const reconcile = vi.fn<(pubky: Pubky) => Promise<unknown>>().mockRejectedValueOnce(new Error('read failed'));
    reconcile.mockResolvedValue(undefined);
    class ReconcilingCoordinator extends TestStreamSyncCoordinator {
      protected reconcileOnConnect(pubky: Pubky): Promise<unknown> {
        return reconcile(pubky);
      }
    }
    coordinator = new ReconcilingCoordinator();
    coordinator.subscribeSpy.mockImplementation(
      async () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ cursor: 'c8', eventType: 'PUT' });
          },
        }),
    );
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();
    await flushPromises();
    await flushPromises();

    expect(reconcile).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(config.debounceMs);
    expect(coordinator.refreshSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(`${config.cursorStoragePrefix}${pubky}`)).toBeNull();

    await vi.advanceTimersByTimeAsync(config.reconnectBackoffMs);
    await flushPromises();
    expect(coordinator.subscribeSpy).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(config.debounceMs);
    expect(coordinator.refreshSpy).toHaveBeenCalledWith(pubky);
    expect(sessionStorage.getItem(`${config.cursorStoragePrefix}${pubky}`)).toBe('c8');
  });

  it('backs a failing refresh off by doubling up to the cap, and starts over after one succeeds', async () => {
    coordinator = new TestStreamSyncCoordinator();
    let open: ReadableStreamDefaultController<TEventStreamSyncEvent> | undefined;
    coordinator.subscribeSpy.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          open = controller;
          controller.enqueue({ cursor: 'c1', eventType: 'PUT' });
        },
      }),
    );
    coordinator.refreshSpy.mockRejectedValue(new Error('read failed'));
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();
    await flushPromises();

    const callsAfter = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      return coordinator!.refreshSpy.mock.calls.length;
    };
    expect(await callsAfter(config.debounceMs)).toBe(1);
    // 100, 200, 400, then held at the 400 cap.
    expect(await callsAfter(99)).toBe(1);
    expect(await callsAfter(1)).toBe(2);
    expect(await callsAfter(199)).toBe(2);
    expect(await callsAfter(1)).toBe(3);
    expect(await callsAfter(399)).toBe(3);
    expect(await callsAfter(1)).toBe(4);
    expect(await callsAfter(400)).toBe(5);

    coordinator.refreshSpy.mockResolvedValueOnce(undefined);
    expect(await callsAfter(400)).toBe(6);
    expect(sessionStorage.getItem(`${config.cursorStoragePrefix}${pubky}`)).toBe('c1');

    open?.enqueue({ cursor: 'c2', eventType: 'PUT' });
    expect(await callsAfter(config.debounceMs)).toBe(7);
    expect(await callsAfter(config.reconnectBackoffMs)).toBe(8);
  });

  it('reports the outage once under the configured operation at the configured threshold', async () => {
    const serverSpy = vi.spyOn(Err, 'server');
    coordinator = new TestStreamSyncCoordinator();
    coordinator.subscribeSpy.mockRejectedValue(new Error('connect failed'));
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();
    await flushPromises();

    const reports = () =>
      serverSpy.mock.calls.filter(([, , params]) => params.operation === config.exhaustedOperation).length;
    expect(reports()).toBe(0);

    await vi.advanceTimersByTimeAsync(config.reconnectBackoffMs);
    await flushPromises();
    expect(coordinator.subscribeSpy).toHaveBeenCalledTimes(2);
    expect(reports()).toBe(1);

    await vi.advanceTimersByTimeAsync(config.reconnectBackoffMaxMs * 2);
    await flushPromises();
    expect(reports()).toBe(1);
    const [, message] = serverSpy.mock.calls.find(([, , p]) => p.operation === config.exhaustedOperation)!;
    expect(message).toBe(config.exhaustedMessage);
  });
});
