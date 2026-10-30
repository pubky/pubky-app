import {
  MUTE_SYNC_CURSOR_STORAGE_PREFIX,
  MUTE_SYNC_DEBOUNCE_MS,
  MUTE_SYNC_RECONNECT_BACKOFF_MAX_MS,
  MUTE_SYNC_RECONNECT_BACKOFF_MS,
  MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD,
  MUTE_SYNC_STREAM_HEALTHY_AFTER_MS,
} from '@/config/mute-sync';
import { MuteController } from '@/controllers/mute/mute';
import type { TMuteDirectoryEvent } from '@/controllers/mute/mute.types';
import { EventStreamSyncCoordinator } from '@/coordinators/base/event-stream-sync-coordinator';
import type { Pubky } from '@/models/models.types';

/**
 * Keeps the Dexie-backed mute list aligned with the homeserver when another session mutates users.
 *
 * Stream lifecycle, gating, backoff and outage reporting live in {@link EventStreamSyncCoordinator}.
 * Refresh uses {@link MuteController.fetchMutedUsers} only (debounced). No polling fallback.
 */
export class MuteListSyncCoordinator extends EventStreamSyncCoordinator<TMuteDirectoryEvent> {
  private static instance: MuteListSyncCoordinator | null = null;

  private constructor() {
    super({
      coordinatorName: 'MuteListSyncCoordinator',
      streamLabel: 'Mute list',
      debounceMs: MUTE_SYNC_DEBOUNCE_MS,
      cursorStoragePrefix: MUTE_SYNC_CURSOR_STORAGE_PREFIX,
      reconnectBackoffMs: MUTE_SYNC_RECONNECT_BACKOFF_MS,
      reconnectBackoffMaxMs: MUTE_SYNC_RECONNECT_BACKOFF_MAX_MS,
      healthyAfterMs: MUTE_SYNC_STREAM_HEALTHY_AFTER_MS,
      failureAlertThreshold: MUTE_SYNC_STREAM_FAILURE_ALERT_THRESHOLD,
      exhaustedOperation: 'muteListEventStreamExhausted',
      exhaustedMessage: 'Mute list event stream unavailable after repeated failures',
    });
  }

  public static getInstance(): MuteListSyncCoordinator {
    if (!MuteListSyncCoordinator.instance) {
      MuteListSyncCoordinator.instance = new MuteListSyncCoordinator();
    }
    return MuteListSyncCoordinator.instance;
  }

  public static resetInstance(): void {
    if (MuteListSyncCoordinator.instance) {
      MuteListSyncCoordinator.instance.destroy();
      MuteListSyncCoordinator.instance = null;
    }
  }

  protected subscribe(pubky: Pubky, cursor: string | null): Promise<ReadableStream<TMuteDirectoryEvent>> {
    return MuteController.subscribeMuteDirectoryEventStream(pubky, cursor);
  }

  protected refresh(pubky: Pubky): Promise<unknown> {
    return MuteController.fetchMutedUsers(pubky);
  }
}
