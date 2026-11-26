// @vitest-environment node
import type { BuiltPost } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BRAN,
  CLEO,
  DION,
  MINUTE_MS,
  recordsOf,
  socialNetwork,
  T0,
  withAuthor,
  withPartialActivity,
} from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { postStreamKeys, type PostStreamParams } from './postStream';
import { InvalidQueryError, NotFoundQueryError, UnavailableQueryError } from './queries.errors';
import { isoOf } from './queries.types';

const network = socialNetwork();
const { a1, b1, repost, quote, article, image, collection } = network.posts;
const view = buildSocialView(recordsOf(network));
const minute = (n: number) => T0 + n * MINUTE_MS;
const key = (author: string, post: BuiltPost) => `${author}:${post.id}`;
const keys = (params: PostStreamParams) => postStreamKeys(view, params).data.post_keys;

/** Every root post in scope, newest first. */
const ALL = [
  key(DION, collection),
  key(BRAN, image),
  key(ALICE, article),
  key(CLEO, quote),
  key(BRAN, repost),
  key(ALICE, a1),
];

function invalid(params: PostStreamParams): string {
  try {
    postStreamKeys(view, params);
  } catch (error) {
    if (error instanceof InvalidQueryError) return error.parameter;
    throw error;
  }
  throw new Error('expected an InvalidQueryError');
}

describe('postStreamKeys sources', () => {
  it('streams every root post in scope by creation time, scored in milliseconds', () => {
    const answer = postStreamKeys(view, {});

    expect(answer.data).toEqual({ post_keys: ALL, last_post_score: minute(1) });
    expect(answer.coverage.kind).toBe('scope');
  });

  it('streams the root posts of the observer’s followees, exact when every followee is in scope', () => {
    const answer = postStreamKeys(view, { source: 'following', observer_id: ALICE });

    expect(answer.data.post_keys).toEqual([key(BRAN, image), key(CLEO, quote), key(BRAN, repost)]);
    expect(answer.coverage.kind).toBe('exact');
    expect(postStreamKeys(view, { source: 'following', observer_id: CLEO }).coverage.kind).toBe('exact');
  });

  it('streams followers and friends from what the scope saw, never the observer’s own posts', () => {
    const followers = postStreamKeys(view, { source: 'followers', observer_id: ALICE });

    expect(followers.data.post_keys).toEqual([key(BRAN, image), key(BRAN, repost)]);
    expect(followers.coverage.kind).toBe('scope');
    expect(keys({ source: 'friends', observer_id: ALICE })).toEqual([key(BRAN, image), key(BRAN, repost)]);
    expect(keys({ source: 'friends', observer_id: CLEO })).toEqual([]);
  });

  it('streams an author’s root posts or replies, exactly', () => {
    const author = postStreamKeys(view, { source: 'author', author_id: ALICE });

    expect(author.data.post_keys).toEqual([key(ALICE, article), key(ALICE, a1)]);
    expect(author.coverage.kind).toBe('exact');
    expect(keys({ source: 'author_replies', author_id: BRAN })).toEqual([key(BRAN, b1)]);
  });

  it('streams the replies to a post and the collections that hold it', () => {
    expect(keys({ source: 'post_replies', author_id: ALICE, post_id: a1.id })).toEqual([key(BRAN, b1)]);
    expect(keys({ source: 'post_collections', author_id: ALICE, post_id: a1.id })).toEqual([key(DION, collection)]);
  });

  it('streams a collection’s posts in curator order, with no score', () => {
    const answer = postStreamKeys(view, { source: 'collection', author_id: DION, post_id: collection.id });

    expect(answer.data).toEqual({ post_keys: [key(ALICE, a1), key(ALICE, article)], last_post_score: null });
    expect(answer.coverage.kind).toBe('exact');
    expect(keys({ source: 'collection', author_id: DION, post_id: collection.id, skip: 1, limit: 1 })).toEqual([
      key(ALICE, article),
    ]);
  });

  it('streams the web of trust at depth 1 and 2', () => {
    expect(keys({ source: 'wot', observer_id: ALICE, depth: 1 })).toEqual([
      key(BRAN, image),
      key(CLEO, quote),
      key(BRAN, repost),
    ]);
    expect(keys({ source: 'wot', observer_id: ALICE })).toEqual([
      key(DION, collection),
      key(BRAN, image),
      key(CLEO, quote),
      key(BRAN, repost),
    ]);
  });
});

describe('postStreamKeys parameters', () => {
  it('sorts by engagement, ties by key, scored by replies, reposts and tags', () => {
    const answer = postStreamKeys(view, { sorting: 'total_engagement' });

    expect(answer.data).toEqual({
      post_keys: [
        key(ALICE, a1),
        key(BRAN, image),
        key(BRAN, repost),
        key(DION, collection),
        key(ALICE, article),
        key(CLEO, quote),
      ],
      last_post_score: 0,
    });
    expect(postStreamKeys(view, { sorting: 'total_engagement', limit: 1 }).data.last_post_score).toBe(7);
    expect(answer.coverage.kind).toBe('scope');
    expect(
      postStreamKeys(view, { source: 'author', author_id: ALICE, sorting: 'total_engagement' }).coverage.kind,
    ).toBe('scope');
  });

  it('orders ascending and bounds the score inclusively, start from above and end from below', () => {
    expect(keys({ order: 'ascending' })).toEqual([...ALL].reverse());
    expect(keys({ start: minute(8), end: minute(6) })).toEqual([
      key(ALICE, article),
      key(CLEO, quote),
      key(BRAN, repost),
    ]);
    expect(keys({ order: 'ascending', end: minute(8) })).toEqual([
      key(ALICE, article),
      key(BRAN, image),
      key(DION, collection),
    ]);
  });

  it('filters by kind, excluded kinds, lock and tags', () => {
    expect(keys({ kind: 'image' })).toEqual([key(BRAN, image)]);
    expect(keys({ kind: 'unknown' })).toEqual([]);
    expect(keys({ exclude_kinds: ['note'] })).toEqual([key(DION, collection), key(BRAN, image), key(ALICE, article)]);
    expect(keys({ locked: true })).toEqual([]);
    expect(keys({ tags: ['rust'] })).toEqual([key(ALICE, a1)]);
    expect(keys({ tags: [' RUST', 'none'] })).toEqual([key(ALICE, a1)]);
    expect(postStreamKeys(view, { source: 'author', author_id: ALICE, tags: ['rust'] }).coverage.kind).toBe('scope');
  });

  it('pages with skip and limit, 10 by default and 50 at most', () => {
    expect(keys({ skip: 2, limit: 2 })).toEqual(ALL.slice(2, 4));
    expect(keys({ skip: 6 })).toEqual([]);
    expect(postStreamKeys(view, { skip: 6 }).data.last_post_score).toBeNull();
  });

  it('rejects what the central indexer rejects, naming the parameter', () => {
    expect(invalid({ source: 'bookmarks' })).toBe('source');
    expect(invalid({ limit: 0 })).toBe('limit');
    expect(invalid({ limit: 51 })).toBe('limit');
    expect(invalid({ skip: 10001 })).toBe('skip');
    expect(invalid({ sorting: 'random' })).toBe('sorting');
    expect(invalid({ order: 'up' })).toBe('order');
    expect(invalid({ kind: 'short' })).toBe('kind');
    expect(invalid({ exclude_kinds: ['note', 'long'] })).toBe('exclude_kinds');
    expect(invalid({ kind: 'note', exclude_kinds: ['image'] })).toBe('exclude_kinds');
    expect(invalid({ kind: 'note', locked: true })).toBe('locked');
    expect(invalid({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe('tags');
    expect(invalid({ source: 'following' })).toBe('observer_id');
    expect(invalid({ source: 'post_replies', author_id: ALICE })).toBe('post_id');
    expect(invalid({ source: 'author_replies', author_id: BRAN, kind: 'note' })).toBe('kind');
    expect(invalid({ source: 'post_collections', author_id: ALICE, post_id: a1.id, locked: true })).toBe('locked');
    expect(invalid({ source: 'collection', author_id: DION, post_id: collection.id, sorting: 'timeline' })).toBe(
      'sorting',
    );
    expect(invalid({ source: 'wot', observer_id: ALICE, depth: 0 })).toBe('depth');
    expect(invalid({ source: 'wot', observer_id: ALICE, depth: 4 })).toBe('depth');
  });

  it('refuses what needs more than the scope', () => {
    const unavailable = (params: PostStreamParams) => () => postStreamKeys(view, params);

    expect(unavailable({ source: 'wot', observer_id: ALICE, depth: 3 })).toThrow(UnavailableQueryError);
    expect(unavailable({ source: 'wot_domain', observer_id: ALICE, domain_tags: ['dev'] })).toThrow(
      UnavailableQueryError,
    );
    expect(unavailable({ source: 'following', observer_id: 'stranger' })).toThrow(UnavailableQueryError);
    expect(unavailable({ source: 'collection', author_id: DION, post_id: a1.id })).toThrow(NotFoundQueryError);
  });
});

describe('postStreamKeys by membership', () => {
  it('answers the stream of an author whose own records are not loaded as unknown, asking for the user', () => {
    const referenced = buildSocialView(withAuthor(recordsOf(network), DION, { membership: 'referenced' }));

    for (const author of ['stranger', DION]) {
      const answer = postStreamKeys(referenced, { source: 'author', author_id: author });
      expect(answer.data).toEqual({ post_keys: [], last_post_score: null });
      expect(answer.coverage.kind).toBe('scope');
      expect(answer.more).toEqual([{ kind: 'user', user: author }]);
    }
    expect(postStreamKeys(referenced, { source: 'author_replies', author_id: DION }).more).toEqual([
      { kind: 'user', user: DION },
    ]);
  });

  it('streams a visited author alone and leaves them out of the network stream', () => {
    const visited = buildSocialView(withAuthor(recordsOf(network), DION, { membership: 'visited' }));

    expect(postStreamKeys(visited, { source: 'author', author_id: DION })).toEqual({
      data: { post_keys: [key(DION, collection)], last_post_score: minute(12) },
      coverage: { kind: 'exact' },
    });
    expect(postStreamKeys(visited, { source: 'all', limit: 50 }).data.post_keys).toEqual(
      ALL.filter((entry) => entry !== key(DION, collection)),
    );
  });
});

describe('postStreamKeys over a partly loaded history', () => {
  const iso = (n: number) => new Date(minute(n)).toISOString();

  it('streams an author whose activity is loaded from minute 3 as scope, hinting at a backfill past the window', () => {
    const partial = buildSocialView(withPartialActivity(recordsOf(network), ALICE, BigInt(11)));
    const answer = postStreamKeys(partial, { source: 'author', author_id: ALICE });

    expect(answer.data.post_keys).toEqual([key(ALICE, article)]);
    expect(answer.coverage).toEqual({
      kind: 'scope',
      note: `activity loaded only partly, estimated: ${ALICE} since ${iso(3)}; served only above ${iso(3)}`,
    });
    expect(answer.more).toEqual([{ kind: 'backfill', author: ALICE }]);
    expect(postStreamKeys(partial, { source: 'author_replies', author_id: ALICE }).more).toEqual([
      { kind: 'backfill', author: ALICE },
    ]);

    const firstPage = postStreamKeys(partial, { source: 'author', author_id: ALICE, limit: 1 });
    expect(firstPage.coverage.kind).toBe('scope');
    expect(firstPage.more).toBeUndefined();
  });

  it('serves a thread over the scope uncut, saying where its time order is complete', () => {
    const partial = buildSocialView(withPartialActivity(recordsOf(network), CLEO, BigInt(14)));
    const answer = postStreamKeys(partial, { source: 'post_replies', author_id: ALICE, post_id: a1.id });

    // Any member may reply: a cut at the latest start would follow the busiest one, so the note says it instead.
    expect(answer.data.post_keys).toEqual([key(BRAN, b1)]);
    expect(answer.coverage).toEqual({
      kind: 'scope',
      note: `activity of the scope loaded only partly, the latest start ${isoOf(partial.historyOf(CLEO).sinceMs)}, estimated: an older item may still join between those served`,
    });
    expect(answer.more).toBeUndefined();
    expect(postStreamKeys(view, { source: 'post_replies', author_id: ALICE, post_id: a1.id }).coverage).toEqual({
      kind: 'scope',
    });
  });

  it('hints at a followee’s backfill only once the page reaches past their loaded window', () => {
    const partial = buildSocialView(withPartialActivity(recordsOf(network), CLEO, BigInt(14)));
    const following = (limit: number) => postStreamKeys(partial, { source: 'following', observer_id: ALICE, limit });

    expect(following(2).data.post_keys).toEqual([key(BRAN, image), key(CLEO, quote)]);
    expect(following(2).coverage.kind).toBe('scope');
    expect(following(2).more).toBeUndefined();
    expect(following(10).more).toEqual([{ kind: 'backfill', author: CLEO }]);
  });

  it('stops a page above the latest loaded start of its authors, never skipping past a partly loaded one', () => {
    const partial = buildSocialView(withPartialActivity(recordsOf(network), CLEO, BigInt(14)));
    const following = (params: PostStreamParams) =>
      postStreamKeys(partial, { source: 'following', observer_id: ALICE, ...params });

    // bran's repost is older than where cleo's loaded history starts: cleo may have posted between, so the page is
    // short instead, and bran's repost comes once cleo's history reaches below it.
    expect(following({ limit: 10 }).data.post_keys).toEqual([key(BRAN, image), key(CLEO, quote)]);
    expect(following({ limit: 10, skip: 1 }).data.post_keys).toEqual([key(CLEO, quote)]);
    expect(keys({ source: 'following', observer_id: ALICE, limit: 10 })).toContain(key(BRAN, repost));
    // Oldest first, a page starts below the bound unless `end` keeps it above.
    expect(following({ order: 'ascending' }).data.post_keys).toEqual([]);
    expect(following({ order: 'ascending' }).more).toEqual([{ kind: 'backfill', author: CLEO }]);
    const since = partial.historyOf(CLEO).sinceMs ?? 0;
    expect(following({ order: 'ascending', end: since + 1 }).data.post_keys).toEqual([
      key(CLEO, quote),
      key(BRAN, image),
    ]);
    // Engagement says nothing of age: no bound, the page is a ranking of what is loaded.
    expect(following({ sorting: 'total_engagement', limit: 10 }).data.post_keys).toContain(key(BRAN, repost));
  });

  it('hints at a backfill for a page bounded from below only when older posts could still reach that bound', () => {
    const partial = buildSocialView(withPartialActivity(recordsOf(network), ALICE, BigInt(11)));
    const above = (end: number) => postStreamKeys(partial, { source: 'author', author_id: ALICE, end });

    // A head poll asks for what is newer than the newest post shown, which no older post can join.
    expect(above(minute(8)).data.post_keys).toEqual([key(ALICE, article)]);
    expect(above(minute(8)).more).toBeUndefined();
    expect(above(minute(4)).more).toBeUndefined();
    expect(above(minute(2)).more).toEqual([{ kind: 'backfill', author: ALICE }]);
  });

  it('hints at a backfill for a full page that is not newest first, where an older post can land anywhere', () => {
    const partial = buildSocialView(withPartialActivity(recordsOf(network), ALICE, BigInt(11)));
    const hint = [{ kind: 'backfill', author: ALICE }];

    expect(postStreamKeys(partial, { source: 'author', author_id: ALICE, limit: 1, order: 'ascending' }).more).toEqual(
      hint,
    );
    expect(
      postStreamKeys(partial, { source: 'author', author_id: ALICE, limit: 1, sorting: 'total_engagement' }).more,
    ).toEqual(hint);
  });

  it('stays exact and hint-free over whole histories', () => {
    expect(postStreamKeys(view, { source: 'author', author_id: ALICE }).more).toBeUndefined();
    expect(postStreamKeys(view, { source: 'following', observer_id: ALICE }).more).toBeUndefined();
  });
});

describe('postStreamKeys pagination', () => {
  /** Walks a stream page by page the way the app does, collecting every key served. */
  function walk(next: (served: { keys: string[]; lastScore: number | null }) => PostStreamParams | null): string[] {
    const seen: string[] = [];
    let params: PostStreamParams | null = { limit: 2 };
    while (params !== null) {
      const page: { post_keys: string[]; last_post_score: number | null } = postStreamKeys(view, params).data;
      seen.push(...page.post_keys);
      params = page.post_keys.length === 0 ? null : next({ keys: seen, lastScore: page.last_post_score });
    }
    return seen;
  }

  it('visits every post once by skip', () => {
    expect(walk(({ keys: served }) => ({ limit: 2, skip: served.length }))).toEqual(ALL);
  });

  it('visits every post once by score, descending from just below the last score', () => {
    expect(walk(({ lastScore }) => (lastScore === null ? null : { limit: 2, start: lastScore - 1 }))).toEqual(ALL);
  });

  it('visits every post once by score, ascending from just above the last score', () => {
    const seen: string[] = [];
    let end: number | undefined;
    for (;;) {
      const { post_keys, last_post_score } = postStreamKeys(view, { order: 'ascending', limit: 2, end }).data;
      if (post_keys.length === 0 || last_post_score === null) break;
      seen.push(...post_keys);
      end = last_post_score + 1;
    }
    expect(seen).toEqual([...ALL].reverse());
  });

  it('visits every engagement-sorted post once by skip', () => {
    const seen: string[] = [];
    for (let skip = 0; ; skip += 4) {
      const { post_keys } = postStreamKeys(view, { sorting: 'total_engagement', skip, limit: 4 }).data;
      if (post_keys.length === 0) break;
      seen.push(...post_keys);
    }
    expect(new Set(seen).size).toBe(ALL.length);
    expect([...seen].sort()).toEqual([...ALL].sort());
  });
});
