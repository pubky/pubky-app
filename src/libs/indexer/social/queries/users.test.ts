// @vitest-environment node
import { buildTag, buildUri } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BRAN,
  CLEO,
  DAY_MS,
  DION,
  HOUR_MS,
  MINUTE_MS,
  recordsOf,
  socialNetwork,
  T0,
  withPartialActivity,
  withProfile,
} from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { InvalidQueryError, NotFoundQueryError, UnavailableQueryError } from './queries.errors';
import {
  ingest,
  userCounts,
  userDetails,
  usersByIds,
  userStreamIds,
  type UserStreamParams,
  userTaggers,
  userTags,
} from './users';

const records = recordsOf(socialNetwork());
const view = buildSocialView(records);
/** The same network with a profile for dion, the one user two hops out. */
const profiled = buildSocialView(withProfile(records, DION, 'Dion'));
const branUri = buildUri(BRAN, 'user');
/** An hour after the network was written, so every post and tag is inside the trailing timeframes. */
const context = { seed: ALICE, now: () => T0 + HOUR_MS };

function notFound(query: () => unknown): NotFoundQueryError {
  try {
    query();
  } catch (error) {
    if (error instanceof NotFoundQueryError) return error;
    throw error;
  }
  throw new Error('expected a NotFoundQueryError');
}

describe('userDetails and userCounts', () => {
  it('serves a profile exactly, indexed at the estimated time of its write', () => {
    const answer = userDetails(view, { user_id: ALICE });

    expect(answer.data).toEqual({
      name: 'Alice',
      bio: 'Local-first',
      id: ALICE,
      links: [],
      status: 'Around',
      image: null,
      indexed_at: T0 + MINUTE_MS,
      deleted: false,
      epoch: 'v1',
    });
    expect(answer.coverage).toEqual({ kind: 'exact', note: 'indexed_at estimated from homeserver event order' });
    expect(userDetails(view, { user_id: BRAN }).data.links).toEqual([
      { title: 'Site', url: 'https://example.com/bran' },
    ]);
  });

  it('finds no profile a whole graph history lacks, and calls a user outside the scope unknown', () => {
    expect(notFound(() => userDetails(view, { user_id: DION }))).toMatchObject({
      entity: 'user',
      key: DION,
      known: true,
      more: [],
    });
    expect(notFound(() => userDetails(view, { user_id: 'stranger' }))).toMatchObject({
      known: false,
      retryable: true,
      more: [{ kind: 'user', user: 'stranger' }],
    });
  });

  it('counts what the user wrote and what the scope saw of them', () => {
    const answer = userCounts(view, { user_id: BRAN });

    expect(answer.data).toEqual({
      tagged: 1,
      tags: 3,
      unique_tags: 2,
      posts: 3,
      replies: 1,
      collections: 0,
      following: 2,
      followers: 1,
      friends: 1,
    });
    expect(answer.coverage.kind).toBe('scope');
    expect(userCounts(view, { user_id: DION }).data.collections).toBe(1);
    expect(answer.more).toBeUndefined();
    expect(() => userCounts(view, { user_id: 'stranger' })).toThrow(UnavailableQueryError);
  });

  it('notes the counts a partly loaded history limits and hints at its backfill', () => {
    const partial = buildSocialView(withPartialActivity(records, ALICE, BigInt(11)));
    const answer = userCounts(partial, { user_id: ALICE });

    expect(answer.data).toMatchObject({ posts: 1, tagged: 2 });
    expect(answer.coverage.note).toBe(
      `posts, replies and tags given count activity since ${new Date(T0 + 3 * MINUTE_MS).toISOString()}, estimated`,
    );
    expect(answer.more).toEqual([{ kind: 'backfill', author: ALICE }]);
  });
});

describe('userTags and userTaggers', () => {
  it('serves the labels on a user with the viewer’s own tag file', () => {
    const answer = userTags(view, { user_id: BRAN, viewer_id: ALICE });

    expect(answer.data).toEqual([
      { label: 'friend', taggers: [CLEO, ALICE], taggers_count: 2, tag_uri: buildTag(ALICE, branUri, 'friend').url },
      { label: 'dev', taggers: [DION], taggers_count: 1, tag_uri: null },
    ]);
    expect(answer.coverage.kind).toBe('scope');
    expect(userTaggers(view, { user_id: BRAN, label: 'friend', limit: 1 }).data).toEqual({
      users: [CLEO],
      tag_uri: null,
    });
    expect(userTaggers(view, { user_id: BRAN, label: 'dev', viewer_id: DION }).data).toEqual({
      users: [DION],
      tag_uri: buildTag(DION, branUri, 'dev').url,
    });
  });
});

describe('usersByIds', () => {
  it('serves the listed users with a profile, with the viewer’s relationship', () => {
    const answer = usersByIds(view, { user_ids: [BRAN, DION, CLEO], viewer_id: ALICE });

    expect(answer.data.map(({ details }) => details.id)).toEqual([BRAN, CLEO]);
    expect(answer.data[0].relationship).toEqual({ following: true, followed_by: true });
    expect(answer.data[1].relationship).toEqual({ following: true, followed_by: false });
    expect(answer.data[0].social_graph_status).toBeNull();
    expect(answer.data[0].tags.map(({ label }) => label)).toEqual(['friend', 'dev']);
    expect(usersByIds(view, { user_ids: [ALICE] }).data[0].relationship).toEqual({
      following: false,
      followed_by: false,
    });
    expect(answer.coverage.kind).toBe('scope');
    expect(answer.more).toBeUndefined();
    expect(usersByIds(view, { user_ids: ['stranger', ALICE] }).more).toEqual([{ kind: 'user', user: 'stranger' }]);
    expect(() => usersByIds(view, { user_ids: Array.from({ length: 101 }, () => ALICE) })).toThrow(InvalidQueryError);
  });
});

describe('userStreamIds', () => {
  const ids = (params: UserStreamParams, on = view, at = context) => userStreamIds(on, at, params).data;

  it('lists follows, followers and friends', () => {
    expect(userStreamIds(view, context, { source: 'following', user_id: ALICE })).toEqual({
      data: [CLEO, BRAN],
      coverage: { kind: 'exact' },
    });
    expect(userStreamIds(view, context, { source: 'followers', user_id: CLEO }).coverage.kind).toBe('scope');
    expect(ids({ source: 'followers', user_id: CLEO })).toEqual([ALICE, BRAN]);
    expect(ids({ source: 'friends', user_id: ALICE })).toEqual([BRAN]);
    expect(ids({ source: 'following', user_id: ALICE, skip: 1, limit: 1 })).toEqual([BRAN]);
  });

  it('ranks users with a profile by followers in the scope, then by id', () => {
    expect(ids({ source: 'most_followed' })).toEqual([CLEO, ALICE, BRAN]);
    expect(ids({ source: 'most_followed' }, profiled)).toEqual([CLEO, ALICE, DION, BRAN]);
  });

  it('ranks influencers by tags given and posts times the square root of followers, then by id', () => {
    // All time: cleo (3 + 2) * sqrt(2), bran and dion (1 + 3) and (2 + 2) * 1, alice (1 + 2) * 1.
    expect(ids({ source: 'influencers' })).toEqual([CLEO, BRAN, ALICE]);
    expect(ids({ source: 'influencers', user_id: ALICE, reach: 'following' })).toEqual([CLEO, BRAN]);
    expect(ids({ source: 'influencers', preview: true, skip: 2, limit: 1 }, profiled)).toEqual([CLEO, DION, BRAN]);
    // Today only tags on posts count: alice's tag on bran's profile drops out.
    expect(ids({ source: 'influencers', timeframe: 'today' })).toEqual([CLEO, BRAN, ALICE]);
  });

  it('counts only the activity inside the trailing timeframe', () => {
    const later = { ...context, now: () => T0 + 2 * DAY_MS };
    const today = userStreamIds(view, later, { source: 'influencers', timeframe: 'today' });

    expect(today.data).toEqual([CLEO, ALICE, BRAN]);
    expect(today.coverage.note).toBe('ranked inside the scope; tag and follow times estimated');
    expect(ids({ source: 'influencers', timeframe: 'this_week' }, view, later)).toEqual([CLEO, BRAN, ALICE]);
    expect(userStreamIds(view, later, { source: 'influencers' }).coverage.note).toBe('ranked inside the scope');
  });

  it('recommends the users the user’s followees follow', () => {
    expect(ids({ source: 'recommended', user_id: ALICE })).toEqual([]);
    expect(ids({ source: 'recommended', user_id: ALICE }, profiled)).toEqual([DION]);
    expect(ids({ source: 'recommended', user_id: CLEO }, profiled)).toEqual([]);
  });

  it('rejects bad parameters and refuses what needs a global index', () => {
    expect(() => ids({})).toThrow(InvalidQueryError);
    expect(() => ids({ source: 'everyone' })).toThrow(InvalidQueryError);
    expect(() => ids({ source: 'following' })).toThrow(InvalidQueryError);
    expect(() => ids({ source: 'most_followed', limit: 21 })).toThrow(InvalidQueryError);
    expect(() => ids({ source: 'influencers', timeframe: 'forever' })).toThrow(InvalidQueryError);
    expect(() => ids({ source: 'influencers', user_id: ALICE, reach: 'everyone' })).toThrow(InvalidQueryError);
    expect(() => ids({ source: 'starter_pack' })).toThrow(UnavailableQueryError);
    expect(() => ids({ source: 'post_replies' })).toThrow(UnavailableQueryError);
    expect(() => ids({ source: 'recommended', user_id: 'stranger' })).toThrow(UnavailableQueryError);
    expect(() => ids({ source: 'following', user_id: 'stranger' })).toThrow(UnavailableQueryError);
  });
});

describe('ingest', () => {
  it('says whether the user is in scope', () => {
    expect(ingest(view, { user_id: DION })).toEqual({ data: { in_scope: true }, coverage: { kind: 'exact' } });
    expect(ingest(view, { user_id: 'stranger' }).data).toEqual({ in_scope: false });
  });
});
