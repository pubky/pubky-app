import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, AUTH_ROUTES, PROFILE_ROUTES } from '@/app/routes';
import type { TLastReadEvent } from '@/application/notification/notification.types';
import {
  NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
  NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS,
  NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS,
} from '@/config/notification-last-read-sync';
import { NotificationController } from '@/controllers/notification/notification';
import { NotificationLastReadSyncCoordinator } from '@/coordinators/notification-last-read-sync/notification-last-read-sync';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';

const PUBKY = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;

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

function authenticate() {
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: PUBKY, hasProfile: true });
}

/** Builds a stream that enqueues the given events once, then stays open. */
function streamOf(...events: TLastReadEvent[]): ReadableStream<TLastReadEvent> {
  return new ReadableStream<TLastReadEvent>({
    start(controller) {
      for (const event of events) controller.enqueue(event);
    },
  });
}

/** A stream that opens then closes immediately with no events (reader.read() → { done: true }). */
function closedStream(): ReadableStream<TLastReadEvent> {
  return new ReadableStream<TLastReadEvent>({
    start(controller) {
      controller.close();
    },
  });
}

/** A stream that delivers events then closes, so the loop reconnects instead of blocking on read. */
function streamThenClose(...events: TLastReadEvent[]): ReadableStream<TLastReadEvent> {
  return new ReadableStream<TLastReadEvent>({
    start(controller) {
      for (const event of events) controller.enqueue(event);
      controller.close();
    },
  });
}

describe('NotificationLastReadSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibilityState('visible');
    NotificationLastReadSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    sessionStorage.clear();
    vi.spyOn(NotificationController, 'subscribeLastReadEventStream').mockImplementation(async () =>
      streamOf({ cursor: 'c1', eventType: 'PUT' }),
    );
    vi.spyOn(NotificationController, 'refreshLastReadFromHomeserver').mockResolvedValue(undefined);
  });

  afterEach(() => {
    NotificationLastReadSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.useRealTimers();
  });

  it('calls refreshLastReadFromHomeserver after debounce on a PUT event', async () => {
    authenticate();
    const refresh = vi.mocked(NotificationController.refreshLastReadFromHomeserver);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(NotificationController.subscribeLastReadEventStream).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(PUBKY);
  });

  it('coalesces multiple PUT events into a single refresh', async () => {
    vi.mocked(NotificationController.subscribeLastReadEventStream).mockImplementation(async () =>
      streamOf({ cursor: 'c1', eventType: 'PUT' }, { cursor: 'c2', eventType: 'PUT' }),
    );
    authenticate();
    const refresh = vi.mocked(NotificationController.refreshLastReadFromHomeserver);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores DEL events (no refresh) and warns, while advancing the cursor', async () => {
    vi.mocked(NotificationController.subscribeLastReadEventStream).mockImplementation(async () =>
      streamOf({ cursor: 'del-1', eventType: 'DEL' }),
    );
    const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    authenticate();
    const refresh = vi.mocked(NotificationController.refreshLastReadFromHomeserver);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS + 50);

    expect(refresh).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(sessionStorage.getItem(`${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${PUBKY}`)).toBe('del-1');
  });

  it('subscribes using the cursor persisted in sessionStorage', async () => {
    sessionStorage.setItem(`${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${PUBKY}`, 'stored-cursor');
    authenticate();
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(subscribe).toHaveBeenCalledWith(PUBKY, 'stored-cursor');
  });

  it('cancels a pending debounced refresh on stop', async () => {
    authenticate();
    const refresh = vi.mocked(NotificationController.refreshLastReadFromHomeserver);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    // PUT received → debounce scheduled but not yet fired.
    coordinator.stop();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS + 50);

    expect(refresh).not.toHaveBeenCalled();
  });

  it('persists the cursor after a successful refresh', async () => {
    const cursorKey = `${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${PUBKY}`;
    authenticate();

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(sessionStorage.getItem(cursorKey)).toBeNull();

    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);
    expect(sessionStorage.getItem(cursorKey)).toBe('c1');
  });

  it('retries a failed refresh and stores the cursor after success', async () => {
    const cursorKey = `${NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX}${PUBKY}`;
    vi.mocked(NotificationController.refreshLastReadFromHomeserver)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(undefined);
    authenticate();
    const refresh = vi.mocked(NotificationController.refreshLastReadFromHomeserver);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(cursorKey)).toBeNull();

    // First retry waits one base backoff (exponential step 1).
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(cursorKey)).toBe('c1');
  });

  it('uses exponential backoff between refresh retries (1s, then 2s)', async () => {
    vi.mocked(NotificationController.refreshLastReadFromHomeserver).mockRejectedValue(new Error('down'));
    authenticate();
    const refresh = vi.mocked(NotificationController.refreshLastReadFromHomeserver);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    // 2nd attempt fires after 1s.
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS - 1);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(2);

    // 3rd attempt waits 2s (not 1s).
    await vi.advanceTimersByTimeAsync(2 * NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS - 1);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('gives up refresh retries after the max attempts', async () => {
    vi.mocked(NotificationController.refreshLastReadFromHomeserver).mockRejectedValue(new Error('down'));
    authenticate();
    const refresh = vi.mocked(NotificationController.refreshLastReadFromHomeserver);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    // Far exceed the cumulative exponential backoff so every retry would have fired.
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS + 500_000);

    expect(refresh).toHaveBeenCalledTimes(NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS);
  });

  it('gives up reconnecting the stream after the max attempts', async () => {
    vi.mocked(NotificationController.subscribeLastReadEventStream).mockRejectedValue(new Error('unreachable'));
    authenticate();
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await vi.advanceTimersByTimeAsync(500_000);

    expect(subscribe).toHaveBeenCalledTimes(NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS);
  });

  it('gives up reconnecting when the stream opens but closes immediately with no events', async () => {
    // A clean close (done: true) is not an error, so without counting empty connections the loop
    // would reset its retry budget every iteration and reconnect forever.
    vi.mocked(NotificationController.subscribeLastReadEventStream).mockImplementation(async () => closedStream());
    authenticate();
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await vi.advanceTimersByTimeAsync(500_000);

    expect(subscribe).toHaveBeenCalledTimes(NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS);
  });

  it('resets the reconnect budget once the stream delivers an event', async () => {
    // Closed-empty MAX-1 times (budget nearly exhausted), then a real event must reset the counter so
    // the stream is not abandoned prematurely. Each closed connection is followed by another closed one
    // until a healthy stream arrives.
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);
    for (let i = 0; i < NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS - 1; i += 1) {
      subscribe.mockImplementationOnce(async () => closedStream());
    }
    subscribe.mockImplementationOnce(async () => streamThenClose({ cursor: 'c1', eventType: 'PUT' }));
    // Subsequent reconnects keep closing empty; the counter restarts from the delivered event above.
    subscribe.mockImplementation(async () => closedStream());

    authenticate();
    const refresh = vi.mocked(NotificationController.refreshLastReadFromHomeserver);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await vi.advanceTimersByTimeAsync(500_000);

    // The event after the near-exhausted budget was still processed (counter reset, not abandoned).
    expect(refresh).toHaveBeenCalledWith(PUBKY);
    // Total subscribes = (MAX-1 empty) + 1 healthy + (MAX empty after reset) = 2 * MAX.
    expect(subscribe).toHaveBeenCalledTimes(2 * NOTIFICATION_LAST_READ_SYNC_MAX_RETRY_ATTEMPTS);
  });

  it('does not reconnect the stream when moving between allowed routes', async () => {
    authenticate();
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);

    coordinator.setRoute(PROFILE_ROUTES.PROFILE);
    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('opens the stream after navigating from a disabled route to an allowed route', async () => {
    authenticate();
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
    coordinator.start();

    await flushPromises();
    expect(subscribe).not.toHaveBeenCalled();

    coordinator.setRoute(APP_ROUTES.HOME);
    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not open the stream on disabled auth routes', async () => {
    authenticate();
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(AUTH_ROUTES.SIGN_IN);
    coordinator.start();

    await flushPromises();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS + 50);

    expect(subscribe).not.toHaveBeenCalled();
    coordinator.stop();
  });

  it('clears the reconnect backoff on stop so no further subscribe is scheduled', async () => {
    vi.mocked(NotificationController.subscribeLastReadEventStream).mockImplementation(
      async () =>
        new ReadableStream<TLastReadEvent>({
          start(controller) {
            controller.close();
          },
        }),
    );
    authenticate();
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
    coordinator.setRoute(APP_ROUTES.HOME);
    coordinator.start();

    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);

    coordinator.stop();
    await vi.advanceTimersByTimeAsync(NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS + 100);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('pauses the stream while hidden and resumes when visible', async () => {
    const cancelFirstStream = vi.fn();
    vi.mocked(NotificationController.subscribeLastReadEventStream).mockImplementation(
      async () => new ReadableStream<TLastReadEvent>({ cancel: cancelFirstStream }),
    );
    authenticate();
    const subscribe = vi.mocked(NotificationController.subscribeLastReadEventStream);

    const coordinator = NotificationLastReadSyncCoordinator.getInstance();
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
