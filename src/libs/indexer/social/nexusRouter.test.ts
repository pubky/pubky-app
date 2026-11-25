// @vitest-environment node
import type { BuiltPost } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { createNexusRouter, type NexusRequest } from './nexusRouter';
import { InvalidQueryError, UnavailableQueryError } from './queries/queries.errors';
import { createSocialQueries } from './queries/socialQueries';
import { ALICE, BRAN, CLEO, DION, MINUTE_MS, recordsOf, socialNetwork, T0 } from './social.fixtures';
import { buildSocialView } from './social.view';

const network = socialNetwork();
const { a1, b1, repost, quote, article, image, collection } = network.posts;
const router = createNexusRouter(
  createSocialQueries(buildSocialView(recordsOf(network)), { seed: ALICE, now: () => T0 }),
);
const NEXUS = 'https://nexus.staging.pubky.app/v1';
const key = (author: string, post: BuiltPost) => `${author}:${post.id}`;
const minute = (n: number) => T0 + n * MINUTE_MS;

const get = (path: string) => router.route({ url: `${NEXUS}/${path}`, method: 'GET' });
const post = (path: string, body: unknown) =>
  router.route({ url: `${NEXUS}/${path}`, method: 'POST', body: JSON.stringify(body) });

// Live responses of https://nexus.staging.pubky.app/v1, fetched on 2026-11-25 and trimmed to one element per list.
// Only keys, nesting and value types are compared, never values.
const USER = 'uzs18pfft9buoohq1heacrp7fmwzhn1xhj3qm5krz4y9u5zwk88o';
const LIVE = {
  // GET stream/posts/keys?source=all&limit=3
  postKeys: {
    post_keys: ['zqs9hwy6ia3rzsd4u3t64i1ofzdh9rnm9ri79uuwqpngsmfb19ay:003625JM5G7S6'],
    last_post_score: 1795602472601,
  },
  // POST stream/posts/by_ids, and GET post/{author}/003625HDS6QS6 without its tags
  postView: {
    details: {
      content: 'am I on V1?',
      id: '003625HDS6QS6',
      indexed_at: 1795597746927,
      author: USER,
      kind: 'note',
      uri: `pubky://${USER}/pub/social/v1/posts/003625HDS6QS6`,
      attachments: [],
      lock: null,
      deleted: false,
    },
    counts: { tags: 0, unique_tags: 0, replies: 0, reposts: 0, collections: 0 },
    tags: [],
    relationships: { replied: null, reposted: null, mentioned: [] },
  },
  // GET post/gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo/0033QP8EZJ2A0/tags?limit_tags=2&limit_taggers=2
  tagDetails: {
    label: 'this',
    taggers: ['xpxx1oen9hiab7o6s1b4umwpqk9g1fu1e65m3wu5jqdmtxhdw85o'],
    taggers_count: 58,
    tag_uri: null,
  },
  // GET user/gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo/taggers/synonym?limit=2
  taggers: { users: ['gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo'], tag_uri: null },
  // GET user/{USER}/details
  userDetails: {
    name: 'CoolUserName',
    bio: null,
    id: USER,
    links: [],
    status: null,
    image: null,
    indexed_at: 1795597708786,
    deleted: false,
    epoch: 'v1',
  },
  // GET user/{USER}/counts
  userCounts: {
    tagged: 1,
    tags: 0,
    unique_tags: 0,
    posts: 27,
    replies: 22,
    collections: 0,
    following: 1,
    followers: 0,
    friends: 0,
  },
  // POST stream/users/by_ids
  userView: {
    details: {
      name: 'CoolUserName',
      bio: null,
      id: USER,
      links: [],
      status: null,
      image: null,
      indexed_at: 1795597708786,
      deleted: false,
      epoch: 'v1',
    },
    counts: {
      tagged: 1,
      tags: 0,
      unique_tags: 0,
      posts: 27,
      replies: 22,
      collections: 0,
      following: 1,
      followers: 0,
      friends: 0,
    },
    tags: [],
    relationship: { following: false, followed_by: false },
    social_graph_status: 'new',
  },
  // GET stream/users/ids?source=influencers&limit=3, search/users/by_name/a, search/tags/by_prefix/bi
  ids: ['gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo'],
  // GET search/users/by_tags?tags=bitcoin&limit=3
  userTagSearch: [{ user_id: 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo', score: 16 }],
  // GET tags/hot?limit=2&taggers_limit=2
  hotTag: {
    label: 'pubky',
    taggers_id: ['14mho9mbz5st4dk3mjn771dp355qkayiy7wdm5mwgcykoy8bb7gy'],
    tagged_count: 1046,
    taggers_count: 175,
  },
  // GET user/{id}/notifications; reply, mention and tag_profile had no live example, so their bodies are the
  // handler's `NotificationBody` fields.
  notificationBodies: {
    follow: { type: 'follow', followed_by: 'tkkhhegfofguoiqhdxjuggru6mgf83xa5xxsskwf1qs1eywumzto' },
    repost: {
      type: 'repost',
      reposted_by: 'b5gzsebcjwaoq6f7jufqg7pgsek8dyx64qjgok8aouktqbahi4cy',
      embed_uri: `pubky://${USER}/pub/social/v1/posts/0034Z0D30C1FG`,
      repost_uri: 'pubky://b5gzsebcjwaoq6f7jufqg7pgsek8dyx64qjgok8aouktqbahi4cy/pub/social/v1/posts/0034ZR3PNHCFG',
      post_kind: 'unknown',
    },
    tag_post: {
      type: 'tag_post',
      tagged_by: 'tyhba4hn1sfwmw8ra15z4cd576toi3pqdzbiotshhge9p1nffq4o',
      tag_label: 'ssasxx',
      post_uri: `pubky://${USER}/pub/social/v1/posts/0034Z0D30C1FG`,
      post_kind: 'unknown',
    },
    reply: { type: 'reply', replied_by: USER, parent_post_uri: 'pubky://a', reply_uri: 'pubky://b', post_kind: 'note' },
    mention: { type: 'mention', mentioned_by: USER, post_uri: 'pubky://a', post_kind: 'note' },
    tag_profile: { type: 'tag_profile', tagged_by: USER, tag_label: 'friend' },
  } as Record<string, unknown>,
  notificationTimestamp: 1795602458048,
};

// GET bootstrap/oj5irox6fpf3qgjau8wkwx8irpyyapoy75dmd14obb7z8pmnxd9y, its lists cut to one live element each; the
// notifications are left empty here because each body type is compared on its own route.
const LIVE_BOOTSTRAP = {
  users: [LIVE.userView],
  posts: [LIVE.postView],
  ids: { stream: LIVE.postKeys.post_keys, influencers: LIVE.ids, recommended: LIVE.ids, hot_tags: [LIVE.hotTag] },
  indexed: true,
  notifications: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The same keys at every level and the same type at every leaf; a `null` on either side only says it is nullable. */
function expectSameShape(ours: unknown, live: unknown, at = '$'): void {
  if (ours === null || live === null) return;
  if (Array.isArray(live)) {
    expect(Array.isArray(ours), at).toBe(true);
    if (Array.isArray(ours) && ours.length > 0 && live.length > 0) expectSameShape(ours[0], live[0], `${at}[0]`);
    return;
  }
  if (isRecord(live)) {
    if (!isRecord(ours)) throw new Error(`${at}: expected an object`);
    expect(Object.keys(ours).sort(), at).toEqual(Object.keys(live).sort());
    for (const name of Object.keys(live)) expectSameShape(ours[name], live[name], `${at}.${name}`);
    return;
  }
  expect(typeof ours, at).toBe(typeof live);
}

async function rejection(request: Promise<unknown>): Promise<unknown> {
  try {
    await request;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('nexus router: post streams', () => {
  it('answers the following stream the app builds, page after page', async () => {
    const first = await get(
      `stream/posts/keys?source=following&viewer_id=${ALICE}&sorting=timeline&limit=2&observer_id=${ALICE}`,
    );

    expect(first).toEqual({
      status: 200,
      json: { post_keys: [key(BRAN, image), key(CLEO, quote)], last_post_score: minute(7) },
      coverage: { kind: 'exact' },
    });
    expectSameShape(first.json, LIVE.postKeys);
    const next = await get(
      `stream/posts/keys?source=following&viewer_id=${ALICE}&sorting=timeline&limit=2&start=${minute(7) - 1}&observer_id=${ALICE}`,
    );
    expect(next.json).toEqual({ post_keys: [key(BRAN, repost)], last_post_score: minute(6) });
  });

  it('answers engagement, author-with-kind, tag and collection streams', async () => {
    const engagement = await get(
      `stream/posts/keys?source=all&viewer_id=${ALICE}&sorting=total_engagement&limit=1&skip=0`,
    );
    expect(engagement.json).toEqual({ post_keys: [key(ALICE, a1)], last_post_score: 7 });
    expect(engagement.coverage.kind).toBe('scope');

    const articles = await get(
      `stream/posts/keys?source=author&viewer_id=${ALICE}&sorting=timeline&kind=article&limit=10&author_id=${ALICE}`,
    );
    expect(articles.json).toEqual({ post_keys: [key(ALICE, article)], last_post_score: minute(8) });

    const tagged = await get(
      `stream/posts/keys?source=all&viewer_id=${ALICE}&sorting=timeline&tags=rust%2Cpubky&limit=10`,
    );
    expect(tagged.json).toEqual({ post_keys: [key(ALICE, a1)], last_post_score: minute(1) });

    const curated = await get(
      `stream/posts/keys?source=collection&viewer_id=${ALICE}&limit=10&skip=0&author_id=${DION}&post_id=${collection.id}`,
    );
    expect(curated.json).toEqual({ post_keys: [key(ALICE, a1), key(ALICE, article)], last_post_score: null });

    const replies = await get(
      `stream/posts/keys?source=post_replies&viewer_id=${ALICE}&limit=10&author_id=${ALICE}&post_id=${a1.id}`,
    );
    expect(replies.json).toEqual({ post_keys: [key(BRAN, b1)], last_post_score: minute(2) });
  });

  it('serves posts by ids from a JSON body in the live shape', async () => {
    const posts = await post('stream/posts/by_ids', {
      post_ids: [key(ALICE, a1), key(BRAN, b1)].sort(),
      viewer_id: ALICE,
    });

    expect(Array.isArray(posts.json)).toBe(true);
    expectSameShape(posts.json, [LIVE.postView]);
    expect(posts.coverage.kind).toBe('scope');
    const fromObject = await router.route({
      url: `${NEXUS}/stream/posts/by_ids`,
      method: 'POST',
      body: { post_ids: [key(ALICE, a1)] },
    });
    expectSameShape(fromObject.json, [LIVE.postView]);
  });
});

describe('nexus router: posts', () => {
  it('serves a post view, its details, tags and taggers in the live shapes', async () => {
    const postView = await get(`post/${ALICE}/${a1.id}`);
    expectSameShape(postView.json, LIVE.postView);
    expectSameShape(postView.json, { ...LIVE.postView, tags: [LIVE.tagDetails] });

    const details = await get(`post/${ALICE}/${a1.id}/details`);
    expectSameShape(details.json, LIVE.postView.details);
    expect(details.coverage.kind).toBe('exact');

    const tags = await get(`post/${ALICE}/${a1.id}/tags?skip_tags=0&limit_tags=5&viewer_id=${CLEO}`);
    expectSameShape(tags.json, [LIVE.tagDetails]);

    const taggers = await get(`post/${ALICE}/${a1.id}/taggers/Rust%20?skip=0&limit=20&viewer_id=${CLEO}`);
    expectSameShape(taggers.json, LIVE.taggers);
    expect(taggers.json).toMatchObject({ users: [CLEO, DION, BRAN] });
  });
});

describe('nexus router: users', () => {
  it('serves details, counts, tags and taggers in the live shapes', async () => {
    const details = await get(`user/${ALICE}/details`);
    expectSameShape(details.json, LIVE.userDetails);
    expect(details.coverage.kind).toBe('exact');
    expectSameShape((await get(`user/${BRAN}/counts`)).json, LIVE.userCounts);
    expectSameShape((await get(`user/${BRAN}/tags?skip_tags=0&limit_tags=5&viewer_id=${ALICE}`)).json, [
      LIVE.tagDetails,
    ]);
    expectSameShape((await get(`user/${BRAN}/taggers/friend?skip=0&limit=20&viewer_id=${ALICE}`)).json, LIVE.taggers);
  });

  it('serves users by ids and user streams in the live shapes', async () => {
    const users = await post('stream/users/by_ids', { user_ids: [ALICE, BRAN].sort(), viewer_id: ALICE });
    expectSameShape(users.json, [LIVE.userView]);
    expectSameShape(users.json, [{ ...LIVE.userView, tags: [LIVE.tagDetails] }]);

    const influencers = await get(
      `stream/users/ids?source=influencers&skip=0&limit=3&viewer_id=${ALICE}&timeframe=today&reach=following&user_id=${ALICE}`,
    );
    expect(influencers.json).toEqual([CLEO, BRAN]);
    expectSameShape(influencers.json, LIVE.ids);
    expect((await get(`stream/users/ids?source=most_followed&skip=0&limit=10&viewer_id=${ALICE}`)).json).toEqual([
      CLEO,
      ALICE,
      BRAN,
    ]);
    expect(
      (await get(`stream/users/ids?source=recommended&skip=0&limit=5&viewer_id=${ALICE}&user_id=${ALICE}`)).json,
    ).toEqual([]);
    const following = await get(
      `stream/users/ids?source=following&skip=0&limit=10&viewer_id=${ALICE}&user_id=${ALICE}`,
    );
    expect(following).toEqual({ status: 200, json: [CLEO, BRAN], coverage: { kind: 'exact' } });
  });

  it('serves the seed’s notifications in the live shapes', async () => {
    const { json } = await get(`user/${ALICE}/notifications?skip=0&limit=30`);
    if (!Array.isArray(json)) throw new Error('expected a list');
    const listed: unknown[] = json;

    expect(listed).toHaveLength(9);
    for (const notification of listed) {
      if (!isRecord(notification) || !isRecord(notification.body)) throw new Error('expected a notification');
      const type = notification.body.type;
      expect(typeof type).toBe('string');
      expectSameShape(notification, {
        timestamp: LIVE.notificationTimestamp,
        body: LIVE.notificationBodies[String(type)],
      });
    }
  });
});

describe('nexus router: search, tags, bootstrap and ingest', () => {
  it('serves the searches in the live shapes', async () => {
    const byName = await get('search/users/by_name/Al?skip=0&limit=10');
    expect(byName.json).toEqual([ALICE]);
    expectSameShape(byName.json, LIVE.ids);
    expect((await get(`search/users/by_id/${ALICE.slice(0, 3)}?skip=0&limit=10`)).json).toEqual([ALICE]);
    const byTags = await get('search/users/by_tags?skip=0&limit=10&tags=friend%2Cdev');
    expect(byTags.json).toEqual([{ user_id: BRAN, score: 3 }]);
    expectSameShape(byTags.json, LIVE.userTagSearch);
    expect((await get('search/tags/by_prefix/ru?skip=0&limit=10')).json).toEqual(['rust']);
  });

  it('serves hot tags in the live shape', async () => {
    const hot = await get(`tags/hot?skip=0&limit=40&timeframe=this_month&user_id=${ALICE}&reach=following`);

    expectSameShape(hot.json, [LIVE.hotTag]);
    expect(hot.json).toEqual([
      { label: 'rust', taggers_id: [CLEO, BRAN], tagged_count: 1, taggers_count: 2 },
      { label: 'pubky', taggers_id: [CLEO], tagged_count: 1, taggers_count: 1 },
    ]);
  });

  it('serves the bootstrap in the live shape and ingests nothing', async () => {
    const page = await get(`bootstrap/${ALICE}`);
    expectSameShape(page.json, LIVE_BOOTSTRAP);
    expectSameShape(page.json, { ...LIVE_BOOTSTRAP, users: [{ ...LIVE.userView, tags: [LIVE.tagDetails] }] });

    const ingested = await router.route({ url: `${NEXUS}/ingest/${DION}`, method: 'PUT' });
    expect(ingested.json).toEqual({ in_scope: true });
  });

  it('accepts a path without the host', async () => {
    expect((await router.route({ url: `/v1/user/${ALICE}/details`, method: 'GET' })).json).toMatchObject({
      name: 'Alice',
    });
  });
});

describe('nexus router: refusals', () => {
  const unavailable: [string, NexusRequest][] = [
    ['full-text search', { url: `${NEXUS}/search/posts/by_content?q=hello&skip=0&limit=10`, method: 'GET' }],
    [
      'the domain web of trust',
      {
        url: `${NEXUS}/stream/posts/keys?source=wot_domain&viewer_id=${ALICE}&sorting=timeline&depth=2&domain_tags=dev&limit=10&observer_id=${ALICE}`,
        method: 'GET',
      },
    ],
    ['depth 3', { url: `${NEXUS}/stream/posts/keys?source=wot&depth=3&observer_id=${ALICE}`, method: 'GET' }],
    [
      'the starter pack',
      { url: `${NEXUS}/stream/users/ids?source=starter_pack&skip=0&limit=10&tags=bitcoin`, method: 'GET' },
    ],
    ['someone else’s notifications', { url: `${NEXUS}/user/${BRAN}/notifications?skip=0&limit=30`, method: 'GET' }],
    ['a post outside the scope', { url: `${NEXUS}/post/${ALICE}/0000000000000`, method: 'GET' }],
    ['an unknown route', { url: `${NEXUS}/user/${ALICE}/relationship/${BRAN}`, method: 'GET' }],
    ['a known route with another method', { url: `${NEXUS}/user/${ALICE}/details`, method: 'POST' }],
    ['another API version', { url: 'https://nexus.staging.pubky.app/v0/files/by_ids', method: 'POST', body: '{}' }],
    ['a URL with no version', { url: 'https://nexus.staging.pubky.app/user/x/details', method: 'GET' }],
  ];

  it.each(unavailable)('refuses %s as unavailable', async (_name, request) => {
    expect(await rejection(router.route(request))).toBeInstanceOf(UnavailableQueryError);
  });

  const invalid: [string, NexusRequest, string][] = [
    ['a repeated parameter', { url: `${NEXUS}/stream/posts/keys?limit=1&limit=2`, method: 'GET' }, 'limit'],
    ['a malformed number', { url: `${NEXUS}/stream/posts/keys?limit=ten`, method: 'GET' }, 'limit'],
    ['a malformed score', { url: `${NEXUS}/stream/posts/keys?start=soon`, method: 'GET' }, 'start'],
    ['a malformed flag', { url: `${NEXUS}/stream/posts/keys?locked=yes`, method: 'GET' }, 'locked'],
    ['a limit over the maximum', { url: `${NEXUS}/stream/posts/keys?limit=51`, method: 'GET' }, 'limit'],
    ['a body that is not JSON', { url: `${NEXUS}/stream/posts/by_ids`, method: 'POST', body: '{' }, 'body'],
    ['a body without its ids', { url: `${NEXUS}/stream/users/by_ids`, method: 'POST', body: '{}' }, 'user_ids'],
    [
      'ids that are not strings',
      { url: `${NEXUS}/stream/posts/by_ids`, method: 'POST', body: { post_ids: [1] } },
      'post_ids',
    ],
  ];

  it.each(invalid)('rejects %s naming the parameter', async (_name, request, parameter) => {
    const error = await rejection(router.route(request));

    expect(error).toBeInstanceOf(InvalidQueryError);
    if (error instanceof InvalidQueryError) expect(error.parameter).toBe(parameter);
  });
});
