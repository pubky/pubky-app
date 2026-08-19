import { truncateByGraphemes } from '@/libs/utils/truncate';
import { NotificationType } from '@/models/notification/notification.types';
import type { NotificationKindBucket } from '../NotificationItem/NotificationItem.utils';
import type { GroupableNotificationType } from '../NotificationsList/NotificationsList.types';

/**
 * Grouped post titles get more room than the single-row preview (20 chars) because they
 * sit on their own line rather than sharing one with the action text.
 */
export const GROUP_POST_TITLE_MAX_LENGTH = 40;

/**
 * Formats an edited post's title for the grouped list.
 * Double quotes and a longer limit set it apart from the single-row preview.
 * Grapheme-based truncation keeps emoji and combined characters whole at the cut.
 */
export function formatGroupedPostTitle(title: string): string {
  return `"${truncateByGraphemes(title, GROUP_POST_TITLE_MAX_LENGTH)}"`;
}

/**
 * Copy vocabulary for grouped rows, one record per (type × kind bucket). The row text
 * and both of the toggle's accessible labels derive from the same record, so the verbs
 * and nouns cannot drift apart.
 */
const GROUPED_COPY: Record<
  GroupableNotificationType,
  Record<NotificationKindBucket, { verb: string; noun: string; suffix?: string }>
> = {
  [NotificationType.PostDeleted]: {
    post: { verb: 'deleted', noun: 'posts', suffix: ' you interacted with' },
    collection: { verb: 'deleted', noun: 'collections', suffix: ' you interacted with' },
    long: { verb: 'deleted', noun: 'articles', suffix: ' you interacted with' },
  },
  [NotificationType.PostEdited]: {
    post: { verb: 'edited', noun: 'posts', suffix: ' you interacted with' },
    collection: { verb: 'updated', noun: 'collections' },
    long: { verb: 'updated', noun: 'articles' },
  },
};

/**
 * Action text for a group's row (rendered after the actor's username).
 */
export function getGroupedActionText(
  type: GroupableNotificationType,
  kindBucket: NotificationKindBucket,
  count: number,
): string {
  const { verb, noun, suffix } = GROUPED_COPY[type][kindBucket];
  return `${verb} ${count} ${noun}${suffix ?? ''}`;
}

/**
 * Accessible name for the disclosure toggle while collapsed. The visible label is just
 * "Show", so the control is named by its kind, count and actor.
 */
export function getGroupToggleShowLabel(
  type: GroupableNotificationType,
  kindBucket: NotificationKindBucket,
  count: number,
  name: string,
): string {
  const { verb, noun } = GROUPED_COPY[type][kindBucket];
  return `Show the ${count} ${noun} ${verb} by ${name}`;
}

/** Accessible name for the disclosure toggle while expanded. */
export function getGroupToggleHideLabel(
  type: GroupableNotificationType,
  kindBucket: NotificationKindBucket,
  name: string,
): string {
  const { verb, noun } = GROUPED_COPY[type][kindBucket];
  return `Hide the ${noun} ${verb} by ${name}`;
}
