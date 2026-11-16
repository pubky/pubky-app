import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS } from '@/config/homeserver-event-stream';
import {
  MUTE_HOMESERVER_EVENTS_PATH_PREFIX,
  MUTE_SYNC_CURSOR_STORAGE_PREFIX,
  MUTE_SYNC_DEBOUNCE_MS,
} from '@/config/mute-sync';
import { NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX } from '@/config/notification-last-read-sync';
import { HomeserverEventController } from '@/controllers/homeserver-event/homeserver-event';
import type { THomeserverEvent } from '@/controllers/homeserver-event/homeserver-event.types';
import { MuteController } from '@/controllers/mute/mute';
import { HomeserverEventStreamCoordinator } from '@/coordinators/homeserver-event-stream/homeserver-event-stream';
import { MuteListSyncCoordinator } from '@/coordinators/mute-list-sync/mute-list-sync';
import type { Pubky } from '@/models/models.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { mockSession } from '@/test-utils/pubky';

const pubky = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y' as Pubky;
const cursorKey = `${MUTE_SYNC_CURSOR_STORAGE_PREFIX}${pubky}`;

async function flushPromises() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

function muteEvent(cursor: string, eventType = 'PUT'): THomeserverEvent {
  return { cursor, eventType, path: `${MUTE_HOMESERVER_EVENTS_PATH_PREFIX}${pubky}` };
}

function streamOf(...events: THomeserverEvent[]) {
  return async () =>
    new ReadableStream<THomeserverEvent>({
      start(controller) {
        for (const event of events) controller.enqueue(event);
      },
    });
}

function start(): void {
  useAuthStore.getState().init({ session: mockSession(), currentUserPubky: pubky, hasProfile: true });
  const hub = HomeserverEventStreamCoordinator.getInstance();
  hub.setRoute(APP_ROUTES.HOME);
  MuteListSyncCoordinator.getInstance().start();
  hub.start();
}

describe('MuteListSyncCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    HomeserverEventStreamCoordinator.resetInstance();
    MuteListSyncCoordinator.resetInstance();
    useAuthStore.getState().reset();
    sessionStorage.clear();
    vi.spyOn(HomeserverEventController, 'subscribeUserEventStream').mockImplementation(streamOf(muteEvent('1')));
    vi.spyOn(MuteController, 'fetchMutedUsers').mockResolvedValue([]);
  });

  afterEach(() => {
    MuteListSyncCoordinator.resetInstance();
    HomeserverEventStreamCoordinator.resetInstance();
    useAuthStore.getState().reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('follows the mutes directory on the shared homeserver event stream', async () => {
    start();
    await flushPromises();

    expect(HomeserverEventController.subscribeUserEventStream).toHaveBeenCalledOnce();
    expect(vi.mocked(HomeserverEventController.subscribeUserEventStream).mock.calls[0][0]).toMatchObject({
      pubky,
      cursor: null,
      paths: [MUTE_HOMESERVER_EVENTS_PATH_PREFIX],
    });
  });

  it('calls fetchMutedUsers after debounce when homeserver events arrive', async () => {
    start();
    await flushPromises();

    await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS);
    expect(MuteController.fetchMutedUsers).toHaveBeenCalledOnce();
    expect(MuteController.fetchMutedUsers).toHaveBeenCalledWith(pubky);
    expect(sessionStorage.getItem(cursorKey)).toBe('1');
  });

  it('debounces bursty PUT events into a single fetch', async () => {
    vi.mocked(HomeserverEventController.subscribeUserEventStream).mockImplementation(
      streamOf(muteEvent('1'), muteEvent('2', 'DEL')),
    );
    start();
    await flushPromises();

    await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS);
    expect(MuteController.fetchMutedUsers).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(cursorKey)).toBe('2');
  });

  it('ignores last_read events on the shared stream', async () => {
    vi.mocked(HomeserverEventController.subscribeUserEventStream).mockImplementation(
      streamOf({ cursor: '5', eventType: 'PUT', path: NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX }),
    );
    start();
    await flushPromises();

    await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS);
    expect(MuteController.fetchMutedUsers).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(cursorKey)).toBe('5');
  });

  it('retries failed mute refreshes and stores the cursor after success', async () => {
    vi.mocked(MuteController.fetchMutedUsers).mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce([]);
    start();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(MUTE_SYNC_DEBOUNCE_MS);

    expect(MuteController.fetchMutedUsers).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(cursorKey)).toBeNull();

    await vi.advanceTimersByTimeAsync(HOMESERVER_EVENT_STREAM_RECONNECT_BACKOFF_MS);

    expect(MuteController.fetchMutedUsers).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(cursorKey)).toBe('1');
  });
});
