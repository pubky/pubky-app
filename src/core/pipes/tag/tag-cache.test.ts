import { describe, expect, it } from 'vitest';
import type { TagCollectionModelSchema } from '@/models/shared/tag/tag.schema';
import { reconcileTagCounts, reconcileTagWindow } from '@/pipes/tag/tag-cache';
import type { NexusTag } from '@/services/nexus/nexus.types';

const tag = (count: number, relationship: boolean): NexusTag => ({
  label: 'x',
  taggers: [],
  taggers_count: count,
  relationship,
});

describe('retained optimistic tags', () => {
  it.each([
    { append: false, complete: false },
    { append: true, complete: false },
    { append: false, complete: true },
  ])('does not count either viewer twice across repeated refreshes (%j)', (options) => {
    for (const synced of [false, true]) {
      let existing: TagCollectionModelSchema<string> = {
        id: 'post',
        tags: [{ ...tag(2, true), taggers: ['alice', 'bob'] }],
        cache: { viewerId: 'alice', cursor: 0, exhausted: false, fetchedAt: 0, revision: 2 },
        mutations: {
          alice: { id: 'a', label: 'x', viewerId: 'alice', relationship: true, expiresAt: 200, synced },
          bob: { id: 'b', label: 'x', viewerId: 'bob', relationship: true, expiresAt: 200, synced },
        },
      };
      for (let refresh = 0; refresh < 3; refresh++) {
        const result = reconcileTagWindow([], existing, 100, 'bob', options);
        expect(result.tags).toEqual([{ ...tag(2, true), taggers: ['alice', 'bob'] }]);
        existing = { ...existing, ...result, cache: { ...existing.cache!, viewerId: 'bob' } };
      }
    }
  });

  it('preserves the current viewer selection when retaining another viewer addition', () => {
    const existing = {
      id: 'post',
      tags: [{ ...tag(2, true), taggers: ['bob', 'alice'] }],
      cache: { viewerId: 'bob', cursor: 5, exhausted: false, fetchedAt: 1, revision: 2 },
      mutations: {
        alice: { id: 'a', label: 'x', viewerId: 'alice', relationship: true, expiresAt: 200, synced: true },
      },
    };
    const result = reconcileTagWindow([], existing, 100, 'bob');
    expect(result.tags).toEqual(existing.tags);
    expect(existing.tags[0].relationship).toBe(true);
  });

  it('does not retain expired additions when a complete response proves the label absent', () => {
    const existing = {
      id: 'post',
      tags: [{ ...tag(2, true), taggers: ['alice', 'bob'] }],
      mutations: {
        alice: { id: 'a', label: 'x', viewerId: 'alice', relationship: true, expiresAt: 99, synced: true },
        bob: { id: 'b', label: 'x', viewerId: 'bob', relationship: true, expiresAt: 200, synced: false },
      },
    };
    expect(reconcileTagWindow([], existing, 100, 'bob', { complete: true }).tags).toEqual([
      { ...tag(1, true), taggers: ['bob'] },
    ]);
  });
});

describe('tag count reconciliation', () => {
  it.each([true, false])(
    'retires an expired pending mutation when a fresh window replaces it (intent=%s)',
    (relationship) => {
      const existing = {
        id: 'post',
        tags: [tag(1, relationship)],
        mutations: {
          x: { label: 'x', viewerId: 'viewer', relationship, expiresAt: 100, synced: false, id: 'abandoned' },
        },
      };
      const incoming = [tag(2, !relationship)];
      expect(reconcileTagWindow(incoming, existing, 100, 'viewer')).toEqual({ tags: incoming, mutations: {} });
    },
  );

  it('keeps an expired pending operation owned while pagination retains its earlier page', () => {
    const mutation = {
      label: 'x',
      viewerId: 'other-viewer',
      relationship: true,
      expiresAt: 100,
      synced: false,
      id: 'in-flight',
    };
    const existing = { id: 'post', tags: [tag(1, true)], mutations: { x: mutation } };
    expect(reconcileTagWindow([], existing, 100, 'viewer', { append: true })).toEqual({
      tags: existing.tags,
      mutations: { x: mutation },
    });
  });
  it('accepts fresh totals when a guest preview proves another viewer addition was indexed', () => {
    const incoming = { ...tag(2, false), taggers: ['viewer', 'remaining'] };
    const existing = {
      id: 'post',
      tags: [{ ...incoming, taggers_count: 3 }],
      mutations: {
        x: { id: 'viewer-operation', label: 'x', synced: true, viewerId: 'viewer', relationship: true, expiresAt: 200 },
      },
    };
    expect(
      reconcileTagCounts(
        { tags: 2, unique_tags: 1 },
        [incoming],
        existing,
        { tags: 3, unique_tags: 1 },
        undefined,
        100,
      ),
    ).toEqual({ tags: 2, unique_tags: 1 });
    expect(reconcileTagWindow([incoming], existing, 100).mutations).toEqual({});
  });

  it('preserves a pending viewer membership through a guest refresh', () => {
    const incoming = { ...tag(1, false), taggers: ['other'] };
    const existing = {
      id: 'post',
      tags: [{ ...tag(2, true), taggers: ['other', 'viewer'] }],
      mutations: {
        x: {
          id: 'viewer-operation',
          label: 'x',
          viewerId: 'viewer',
          relationship: true,
          expiresAt: 200,
          synced: false,
        },
      },
    };
    expect(reconcileTagWindow([incoming], existing, 100).tags).toEqual([
      { ...incoming, taggers: ['other', 'viewer'], taggers_count: 2 },
    ]);
  });
  it.each([
    { name: 'unacknowledged addition', intent: true, remote: [], total: 0, expected: 1, unique: 1 },
    { name: 'acknowledged addition', intent: true, remote: [tag(1, true)], total: 1, expected: 1, unique: 1 },
    { name: 'addition to an existing label', intent: true, remote: [tag(3, false)], total: 3, expected: 4, unique: 1 },
    { name: 'removal of the last tagger', intent: false, remote: [tag(1, true)], total: 1, expected: 0, unique: 0 },
    { name: 'removal with another tagger', intent: false, remote: [tag(2, true)], total: 2, expected: 1, unique: 1 },
    { name: 'acknowledged removal', intent: false, remote: [], total: 0, expected: 0, unique: 0 },
  ])('$name', ({ intent, remote, total, expected, unique }) => {
    expect(
      reconcileTagCounts(
        { tags: total, unique_tags: remote.length },
        remote,
        {
          id: 'post',
          tags: [],
          mutations: {
            x: {
              id: 'viewer-operation',
              label: 'x',
              synced: true,
              viewerId: 'viewer',
              relationship: intent,
              expiresAt: 200,
            },
          },
        },
        { tags: 9, unique_tags: 9 },
        'viewer',
        100,
      ),
    ).toEqual({ tags: expected, unique_tags: unique });
  });

  it('accepts authoritative totals after protection expires', () => {
    expect(
      reconcileTagCounts(
        { tags: 4, unique_tags: 3 },
        [],
        {
          id: 'post',
          tags: [],
          mutations: {
            x: {
              id: 'viewer-operation',
              label: 'x',
              synced: true,
              viewerId: 'viewer',
              relationship: true,
              expiresAt: 100,
            },
          },
        },
        { tags: 9, unique_tags: 9 },
        'viewer',
        100,
      ),
    ).toEqual({ tags: 4, unique_tags: 3 });
  });

  it.each([
    { name: 'pending addition', intent: true, previous: 41, expected: 41 },
    { name: 'pending removal', intent: false, previous: 39, expected: 39 },
    { name: 'stale low total with an addition', intent: true, previous: 1, expected: 40 },
    { name: 'stale low total with a removal', intent: false, previous: 0, expected: 39 },
    { name: 'stale high total with an addition', intent: true, previous: 80, expected: 41 },
    { name: 'stale high total with a removal', intent: false, previous: 80, expected: 40 },
  ])('bounds $name when a preview cannot acknowledge the label', ({ intent, previous, expected }) => {
    expect(
      reconcileTagCounts(
        { tags: 40, unique_tags: 40 },
        [],
        {
          id: 'post',
          tags: [],
          mutations: {
            x: {
              id: 'viewer-operation',
              label: 'x',
              synced: true,
              viewerId: 'viewer',
              relationship: intent,
              expiresAt: 200,
            },
          },
        },
        { tags: previous, unique_tags: previous },
        'viewer',
        100,
      ),
    ).toEqual({ tags: expected, unique_tags: expected });
  });
});

describe('shared-viewer counter reconciliation', () => {
  it.each([
    { intent: true, previous: { tags: 22, unique_tags: 12 }, expected: { tags: 22, unique_tags: 11 } },
    { intent: false, previous: { tags: 18, unique_tags: 8 }, expected: { tags: 18, unique_tags: 9 } },
  ])('bounds unknown memberships once per label (addition: $intent)', ({ intent, previous, expected }) => {
    const existing = {
      id: 'profile',
      tags: [],
      mutations: {
        a: {
          id: 'alice-operation',
          synced: true,
          label: 'bitcoin',
          viewerId: 'alice',
          relationship: intent,
          expiresAt: 200,
        },
        b: {
          id: 'bob-operation',
          synced: true,
          label: 'Bitcoin',
          viewerId: 'bob',
          relationship: intent,
          expiresAt: 200,
        },
      },
    };
    expect(reconcileTagCounts({ tags: 20, unique_tags: 10 }, [], existing, previous, undefined, 100)).toEqual(expected);
  });

  it('counts a new label once when two viewers add it', () => {
    const existing = {
      id: 'profile',
      tags: [],
      mutations: {
        a: {
          id: 'alice-operation',
          synced: true,
          label: 'bitcoin',
          viewerId: 'alice',
          relationship: true,
          expiresAt: 200,
        },
        b: { id: 'bob-operation', synced: true, label: 'Bitcoin', viewerId: 'bob', relationship: true, expiresAt: 200 },
      },
    };
    expect(reconcileTagCounts({ tags: 0, unique_tags: 0 }, [], existing, undefined, undefined, 100)).toEqual({
      tags: 2,
      unique_tags: 1,
    });
  });

  it('removes a label once after its two remaining viewers delete it', () => {
    const preview = [{ label: 'bitcoin', taggers: ['alice', 'bob'], taggers_count: 2, relationship: false }];
    const existing = {
      id: 'profile',
      tags: [],
      mutations: {
        a: {
          id: 'alice-operation',
          synced: true,
          label: 'bitcoin',
          viewerId: 'alice',
          relationship: false,
          expiresAt: 200,
        },
        b: {
          id: 'bob-operation',
          synced: true,
          label: 'Bitcoin',
          viewerId: 'bob',
          relationship: false,
          expiresAt: 200,
        },
      },
    };
    expect(reconcileTagCounts({ tags: 2, unique_tags: 1 }, preview, existing, undefined, undefined, 100)).toEqual({
      tags: 0,
      unique_tags: 0,
    });
  });
});
