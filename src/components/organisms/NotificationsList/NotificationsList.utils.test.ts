import { describe, expect, it } from 'vitest';
import { type FlatNotification, NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import { getNotificationKindBucket } from '@/organisms/NotificationItem/NotificationItem.utils';
import type { GroupableNotification } from './NotificationsList.types';
import { groupNotifications } from './NotificationsList.utils';

let nextTimestamp = 100_000;

/** Timestamps only need to be distinct; grouping never reads them. */
const uniqueTimestamp = () => (nextTimestamp -= 1000);

function deleted(actor: string, postKind?: string, deletedUri?: string): GroupableNotification {
  const timestamp = uniqueTimestamp();
  return {
    id: `post_deleted:${timestamp}:${actor}`,
    type: NotificationType.PostDeleted,
    timestamp,
    delete_source: PostChangedSource.Reply,
    deleted_by: actor,
    deleted_uri: deletedUri ?? `pubky://${actor}/pub/pubky.app/posts/deleted-${timestamp}`,
    linked_uri: `pubky://viewer/pub/pubky.app/posts/linked-${timestamp}`,
    post_kind: postKind,
  };
}

function edited(actor: string, postKind?: string, editedUri?: string): GroupableNotification {
  const timestamp = uniqueTimestamp();
  return {
    id: `post_edited:${timestamp}:${actor}`,
    type: NotificationType.PostEdited,
    timestamp,
    edit_source: PostChangedSource.Reply,
    edited_by: actor,
    edited_uri: editedUri ?? `pubky://${actor}/pub/pubky.app/posts/edited-${timestamp}`,
    linked_uri: `pubky://viewer/pub/pubky.app/posts/linked-${timestamp}`,
    post_kind: postKind,
  };
}

function follow(actor: string): FlatNotification {
  const timestamp = uniqueTimestamp();
  return {
    id: `follow:${timestamp}:${actor}`,
    type: NotificationType.Follow,
    timestamp,
    followed_by: actor,
  };
}

function reply(actor: string): FlatNotification {
  const timestamp = uniqueTimestamp();
  return {
    id: `reply:${timestamp}:${actor}`,
    type: NotificationType.Reply,
    timestamp,
    replied_by: actor,
    parent_post_uri: `pubky://viewer/pub/pubky.app/posts/parent-${timestamp}`,
    reply_uri: `pubky://${actor}/pub/pubky.app/posts/reply-${timestamp}`,
  };
}

/** Flattens entries back to their notifications, in render order. */
const flatten = (entries: ReturnType<typeof groupNotifications>): FlatNotification[] =>
  entries.flatMap((entry) => (entry.kind === 'group' ? entry.notifications : [entry.notification]));

describe('groupNotifications', () => {
  it('returns no entries for an empty list', () => {
    expect(groupNotifications([])).toEqual([]);
  });

  it.each([2, 3, 8])('collapses a run of %i deletions into one group', (size) => {
    const run = Array.from({ length: size }, () => deleted('deleter'));

    const entries = groupNotifications(run);

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('group');
    expect(entries[0].kind === 'group' && entries[0].notifications).toHaveLength(size);
  });

  it('leaves a lone deletion as a single with its unchanged business key', () => {
    const only = deleted('deleter');

    const entries = groupNotifications([only]);

    expect(entries).toEqual([{ kind: 'single', notification: only }]);
  });

  it('never merges runs from different actors', () => {
    const entries = groupNotifications([deleted('alice'), deleted('bob')]);

    expect(entries.map((entry) => entry.kind)).toEqual(['single', 'single']);
  });

  it('never merges different post kinds, so the copy stays accurate', () => {
    const entries = groupNotifications([
      deleted('alice', 'short'),
      deleted('alice', 'short'),
      deleted('alice', 'collection'),
      deleted('alice', 'collection'),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0].kind === 'group' && getNotificationKindBucket(entries[0].notifications[0])).toBe('post');
    expect(entries[1].kind === 'group' && getNotificationKindBucket(entries[1].notifications[0])).toBe('collection');
  });

  it('splits a deleted run from an edited run by the same actor', () => {
    const entries = groupNotifications([deleted('alice'), deleted('alice'), edited('alice'), edited('alice')]);

    expect(entries).toHaveLength(2);
    expect(entries[0].kind === 'group' && entries[0].notifications[0].type).toBe(NotificationType.PostDeleted);
    expect(entries[1].kind === 'group' && entries[1].notifications[0].type).toBe(NotificationType.PostEdited);
  });

  it.each([
    ['follow', follow],
    ['reply', reply],
  ])('never groups consecutive %s notifications from the same actor', (_label, build) => {
    const entries = groupNotifications([build('alice'), build('alice'), build('alice')]);

    expect(entries.map((entry) => entry.kind)).toEqual(['single', 'single', 'single']);
  });

  it('splits a run interrupted by an unrelated notification', () => {
    const entries = groupNotifications([deleted('alice'), follow('bob'), deleted('alice'), deleted('alice')]);

    expect(entries.map((entry) => entry.kind)).toEqual(['single', 'single', 'group']);
  });

  it('keeps a run split when interrupted mid-burst, preserving chronological order', () => {
    const first = deleted('alice');
    const second = deleted('alice');
    const interruption = reply('bob');
    const third = deleted('alice');
    const fourth = deleted('alice');

    const entries = groupNotifications([first, second, interruption, third, fourth]);

    expect(entries.map((entry) => entry.kind)).toEqual(['group', 'single', 'group']);
    expect(flatten(entries)).toEqual([first, second, interruption, third, fourth]);
  });

  it('preserves order and emits every notification exactly once when all posts are distinct', () => {
    // Same-post repeats within a run are the one exception: they collapse to their
    // newest occurrence (covered by the dedup tests below).
    const input = [deleted('alice'), deleted('alice'), follow('bob'), edited('carol'), reply('dave'), deleted('alice')];

    expect(flatten(groupNotifications(input))).toEqual(input);
  });

  it('keeps the group key stable when a later page extends the run', () => {
    const pageOne = [follow('bob'), deleted('alice'), deleted('alice')];
    const pageTwo = [deleted('alice'), deleted('alice'), deleted('alice')];

    const beforePaging = groupNotifications(pageOne);
    const afterPaging = groupNotifications([...pageOne, ...pageTwo]);

    const groupBefore = beforePaging.find((entry) => entry.kind === 'group');
    const groupAfter = afterPaging.find((entry) => entry.kind === 'group');

    // The run only ever grows at its tail during pagination, so the head stays put and
    // the oldest member (NotificationsList's row key) is appended, never moved.
    expect(groupBefore?.kind === 'group' && groupBefore.notifications[0]).toBe(
      groupAfter?.kind === 'group' && groupAfter.notifications[0],
    );
    expect(groupBefore?.kind === 'group' && groupBefore.notifications).toHaveLength(2);
    expect(groupAfter?.kind === 'group' && groupAfter.notifications).toHaveLength(5);
  });

  it('promotes a trailing single to a group once the next page arrives', () => {
    const pageOne = [follow('bob'), deleted('alice')];
    const pageTwo = [deleted('alice')];

    expect(groupNotifications(pageOne).map((entry) => entry.kind)).toEqual(['single', 'single']);
    expect(groupNotifications([...pageOne, ...pageTwo]).map((entry) => entry.kind)).toEqual(['single', 'group']);
  });

  it('collapses repeated edits of the same post into its newest notification', () => {
    const uri = 'pubky://alice/pub/pubky.app/posts/same-post';
    const newest = edited('alice', undefined, uri);
    const input = [newest, edited('alice', undefined, uri), edited('alice', undefined, uri)];

    const entries = groupNotifications(input);

    expect(entries).toEqual([{ kind: 'single', notification: newest }]);
  });

  it('keeps one notification per post when a run mixes repeats and distinct posts', () => {
    const uri = 'pubky://alice/pub/pubky.app/posts/same-post';
    const newestOfRepeated = edited('alice', undefined, uri);
    const distinct = edited('alice');

    const entries = groupNotifications([newestOfRepeated, distinct, edited('alice', undefined, uri)]);

    expect(entries).toEqual([{ kind: 'group', notifications: [newestOfRepeated, distinct] }]);
  });

  it('collapses one deletion reported once per interaction into a single row', () => {
    const uri = 'pubky://alice/pub/pubky.app/posts/gone-post';
    const newest = deleted('alice', undefined, uri);

    const entries = groupNotifications([newest, deleted('alice', undefined, uri)]);

    expect(entries).toEqual([{ kind: 'single', notification: newest }]);
  });

  it('does not deduplicate the same post across separate runs', () => {
    const uri = 'pubky://alice/pub/pubky.app/posts/same-post';

    const entries = groupNotifications([
      edited('alice', undefined, uri),
      follow('bob'),
      edited('alice', undefined, uri),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(['single', 'single', 'single']);
  });

  it('stays well-formed when the input is not sorted by timestamp', () => {
    const older = deleted('alice');
    const newer = deleted('alice');
    // Deliberately ascending, the opposite of the list's usual newest-first order.
    const input = [older, newer];

    const entries = groupNotifications(input);

    expect(entries).toHaveLength(1);
    expect(flatten(entries)).toEqual(input);
    // The head is whatever came first in the input; grouping never reorders.
    expect(entries[0].kind === 'group' && entries[0].notifications[0]).toBe(older);
  });
});
