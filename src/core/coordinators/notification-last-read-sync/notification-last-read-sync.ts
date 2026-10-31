import {
  NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
  NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
  NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MAX_MS,
  NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS,
  NOTIFICATION_LAST_READ_SYNC_STREAM_FAILURE_ALERT_THRESHOLD,
  NOTIFICATION_LAST_READ_SYNC_STREAM_HEALTHY_AFTER_MS,
} from '@/config/notification-last-read-sync';
import { NotificationController } from '@/controllers/notification/notification';
import type { TLastReadEvent } from '@/controllers/notification/notification.types';
import { EventStreamSyncCoordinator } from '@/coordinators/base/event-stream-sync-coordinator';
import type { Pubky } from '@/models/models.types';

/**
 * Keeps the notification read boundary (`lastRead`) and the unread badge aligned with the homeserver when another
 * session marks notifications as read.
 *
 * Stream lifecycle, gating (auth, route, tab visibility), backoff and outage reporting live in
 * {@link EventStreamSyncCoordinator}. Refresh uses {@link NotificationController.fetchLastReadFromHomeserver} only
 * (debounced), which applies a remote value only when it is newer. No polling fallback.
 */
export class NotificationLastReadSyncCoordinator extends EventStreamSyncCoordinator<TLastReadEvent> {
  private static instance: NotificationLastReadSyncCoordinator | null = null;

  private constructor() {
    super({
      coordinatorName: 'NotificationLastReadSyncCoordinator',
      streamLabel: 'Notification last_read',
      debounceMs: NOTIFICATION_LAST_READ_SYNC_DEBOUNCE_MS,
      cursorStoragePrefix: NOTIFICATION_LAST_READ_SYNC_CURSOR_STORAGE_PREFIX,
      reconnectBackoffMs: NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MS,
      reconnectBackoffMaxMs: NOTIFICATION_LAST_READ_SYNC_RECONNECT_BACKOFF_MAX_MS,
      healthyAfterMs: NOTIFICATION_LAST_READ_SYNC_STREAM_HEALTHY_AFTER_MS,
      failureAlertThreshold: NOTIFICATION_LAST_READ_SYNC_STREAM_FAILURE_ALERT_THRESHOLD,
      exhaustedOperation: 'notificationLastReadEventStreamExhausted',
      exhaustedMessage: 'Notification last_read event stream unavailable after repeated failures',
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

  protected subscribe(pubky: Pubky, cursor: string | null): Promise<ReadableStream<TLastReadEvent>> {
    return NotificationController.subscribeLastReadEventStream(pubky, cursor);
  }

  protected refresh(pubky: Pubky): Promise<unknown> {
    return NotificationController.fetchLastReadFromHomeserver(pubky);
  }
}
