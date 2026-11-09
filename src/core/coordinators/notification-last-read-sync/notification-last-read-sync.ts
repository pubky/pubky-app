import {
  NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
} from '@/config/notification-last-read-sync';
import { NotificationController } from '@/controllers/notification/notification';
import { EventStreamSyncCoordinator } from '@/coordinators/base/event-stream-sync-coordinator';
import type { Pubky } from '@/models/models.types';
import type { AuthState } from '@/stores/auth/auth.types';

/**
 * Keeps the notification read boundary (`lastRead`) and the unread badge aligned with the homeserver when another
 * session marks notifications as read.
 *
 * Follows the `last_read` file on the tab's shared homeserver event stream; the connection, its gating (auth, route,
 * tab visibility), backoff and outage reporting live in `HomeserverEventStreamCoordinator`, the debounced refresh and
 * cursor in {@link EventStreamSyncCoordinator}. Refresh uses {@link NotificationController.fetchLastReadFromHomeserver}
 * only, which applies a remote value only when it is newer. No polling fallback.
 */
export class NotificationLastReadSyncCoordinator extends EventStreamSyncCoordinator {
  private static instance: NotificationLastReadSyncCoordinator | null = null;

  private constructor() {
    super({
      coordinatorName: 'NotificationLastReadSyncCoordinator',
      streamLabel: 'Notification last_read',
      path: NOTIFICATION_LAST_READ_HOMESERVER_EVENTS_PATH_PREFIX,
      debounceMs: NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
      cursorStoragePrefix: NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
    });
  }

  public static getInstance(): NotificationLastReadSyncCoordinator {
    if (!NotificationLastReadSyncCoordinator.instance) {
      NotificationLastReadSyncCoordinator.instance = new NotificationLastReadSyncCoordinator();
    }
    return NotificationLastReadSyncCoordinator.instance;
  }

  public static resetInstance(): void {
    if (NotificationLastReadSyncCoordinator.instance) {
      NotificationLastReadSyncCoordinator.instance.destroy();
      NotificationLastReadSyncCoordinator.instance = null;
    }
  }

  /** Bootstrap replaces the notification snapshot; reconcile only after it can no longer overwrite this read. */
  public isReadyToSync(auth: AuthState): boolean {
    return auth.restoreStatus === 'ready' && !auth.needsAccountSync;
  }

  protected refresh(pubky: Pubky): Promise<unknown> {
    return NotificationController.fetchLastReadFromHomeserver(pubky);
  }

  /**
   * The persisted `lastRead` is shared by every tab, and a tab can overwrite it with an older snapshot after this
   * one acknowledged a newer event. The stored cursor would skip that event on resume, so read the file again.
   */
  public reconcileOnConnect(pubky: Pubky): Promise<unknown> {
    return NotificationController.fetchLastReadFromHomeserver(pubky);
  }
}
