import {
  MUTE_HOMESERVER_EVENTS_PATH_PREFIX,
  MUTE_SYNC_CURSOR_STORAGE_PREFIX,
  MUTE_SYNC_DEBOUNCE_MS,
} from '@/config/mute-sync';
import { MuteController } from '@/controllers/mute/mute';
import { EventStreamSyncCoordinator } from '@/coordinators/base/event-stream-sync-coordinator';
import type { Pubky } from '@/models/models.types';

/**
 * Keeps the Dexie-backed mute list aligned with the homeserver when another session mutates users.
 *
 * Follows `/pub/pubky.app/mutes/` on the tab's shared homeserver event stream; the connection, its gating, backoff
 * and outage reporting live in `HomeserverEventStreamCoordinator`, the debounced refresh and cursor in
 * {@link EventStreamSyncCoordinator}. Refresh uses {@link MuteController.fetchMutedUsers} only. No polling fallback.
 */
export class MuteListSyncCoordinator extends EventStreamSyncCoordinator {
  private static instance: MuteListSyncCoordinator | null = null;

  private constructor() {
    super({
      coordinatorName: 'MuteListSyncCoordinator',
      streamLabel: 'Mute list',
      path: MUTE_HOMESERVER_EVENTS_PATH_PREFIX,
      debounceMs: MUTE_SYNC_DEBOUNCE_MS,
      cursorStoragePrefix: MUTE_SYNC_CURSOR_STORAGE_PREFIX,
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

  protected refresh(pubky: Pubky): Promise<unknown> {
    return MuteController.fetchMutedUsers(pubky);
  }
}
