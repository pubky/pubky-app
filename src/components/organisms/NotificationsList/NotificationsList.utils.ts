import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import {
  getNotificationKindBucket,
  getUserIdFromNotification,
} from '@/organisms/NotificationItem/NotificationItem.utils';
import type { GroupableNotification, NotificationListEntry } from './NotificationsList.types';

/** A run shorter than this renders as ungrouped NotificationItem rows. */
const MIN_NOTIFICATION_GROUP_SIZE = 2;

/** Deleted and edited notifications arrive one per affected post, so bursts flood the list. */
function isGroupable(notification: FlatNotification): notification is GroupableNotification {
  return notification.type === NotificationType.PostDeleted || notification.type === NotificationType.PostEdited;
}

/**
 * Whether `notification` continues the run headed by `head`.
 *
 * Kept separate from the walk below so the rule can change — a time window, say — without
 * touching the traversal.
 */
function continuesRun(head: GroupableNotification, notification: GroupableNotification): boolean {
  return (
    head.type === notification.type &&
    getUserIdFromNotification(head) === getUserIdFromNotification(notification) &&
    getNotificationKindBucket(head) === getNotificationKindBucket(notification)
  );
}

/**
 * URI of the post whose change the notification reports — the identity repeated
 * notifications about the same post share.
 */
function getChangedPostUri(notification: GroupableNotification): string {
  return notification.type === NotificationType.PostDeleted ? notification.deleted_uri : notification.edited_uri;
}

/**
 * Collapses consecutive runs of deleted/edited notifications that share an actor and a
 * post kind into single rows.
 *
 * Within a run, repeats about the same post (the same post edited several times, or one
 * deletion reported once per interaction) keep only their newest occurrence, so the row
 * count and the title list reflect distinct posts. Order is otherwise preserved, and runs
 * shorter than MIN_NOTIFICATION_GROUP_SIZE come back as individual `single` entries.
 */
export function groupNotifications(notifications: FlatNotification[]): NotificationListEntry[] {
  const entries: NotificationListEntry[] = [];
  let run: GroupableNotification[] = [];
  let runPostUris = new Set<string>();

  const flush = () => {
    if (run.length >= MIN_NOTIFICATION_GROUP_SIZE) {
      entries.push({ kind: 'group', notifications: run });
    } else {
      entries.push(...run.map((notification) => ({ kind: 'single' as const, notification })));
    }
    run = [];
    runPostUris = new Set();
  };

  for (const notification of notifications) {
    if (!isGroupable(notification)) {
      flush();
      entries.push({ kind: 'single', notification });
      continue;
    }

    if (run.length > 0 && !continuesRun(run[0], notification)) flush();

    // The list is newest-first, so the occurrence already in the run is the newer one.
    const postUri = getChangedPostUri(notification);
    if (runPostUris.has(postUri)) continue;
    runPostUris.add(postUri);

    run.push(notification);
  }

  flush();

  return entries;
}
