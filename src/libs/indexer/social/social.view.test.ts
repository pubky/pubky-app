// @vitest-environment node
import { buildFollow, buildPost, buildTag, buildUri, buildUser, type BuiltPost } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import type { RecordEntry } from '../indexer.types';
import { createSocialDomain } from './social.domain';
import {
  ALICE,
  at,
  BRAN,
  CLEO,
  DION,
  fullHistory,
  HOMESERVER,
  MINUTE_MS,
  recordsFrom,
  recordsOf,
  type SocialFile,
  socialNetwork,
  T0,
  withAuthor,
  withPartialActivity,
} from './social.fixtures';
import type { AuthorRecords, SocialData } from './social.types';
import { buildSocialView, type SocialPost } from './social.view';

const network = socialNetwork();
const { a1, b1, c1, gone, orphan, repost, quote, article, articleEdit, broken, image, collection } = network.posts;
const view = buildSocialView(recordsOf(network));
const minute = (n: number) => T0 + n * MINUTE_MS;
/** Posts as `author/postId`, so a failing comparison reads at a glance. */
const ids = (posts: readonly SocialPost[]) => posts.map(({ author, postId }) => `${author}/${postId}`);
const id = (author: string, post: BuiltPost) => `${author}/${post.id}`;
const domain = createSocialDomain();

/** The served record of a post version, with its data unless `withData` is false. */
function recordOf(author: string, post: BuiltPost, withData = true): [string, RecordEntry<SocialData>] {
  const record: RecordEntry<SocialData> = { kind: 'record', path: post.path, cursor: BigInt(1) };
  const data = withData ? domain.reduce(author, post.path, post.body) : null;
  if (data !== null) record.data = data;
  return [post.path, record];
}

/** An author with no graph records, the activity given and a whole history. */
function authorRecords(author: string, hop: number, activity: Map<string, RecordEntry<SocialData>>): AuthorRecords {
  return {
    author,
    homeserver: HOMESERVER,
    membership: 'member',
    hop,
    graph: new Map(),
    activity,
    history: fullHistory(),
  };
}

describe('buildSocialView users', () => {
  it('knows every author in scope with its hop and profile', () => {
    expect(view.authors).toEqual([ALICE, BRAN, CLEO, DION]);
    expect(view.hopOf(DION)).toBe(2);
    expect(view.hopOf('stranger')).toBeNull();
    expect(view.profile(ALICE)).toEqual({
      type: 'user',
      name: 'Alice',
      bio: 'Local-first',
      image: null,
      links: [],
      status: 'Around',
    });
    expect(view.profile(DION)).toBeNull();
  });

  it('resolves following, followers and friends, sorted', () => {
    expect(view.following(ALICE)).toEqual([CLEO, BRAN]);
    expect(view.following(BRAN)).toEqual([CLEO, ALICE]);
    expect(view.following(DION)).toEqual([]);
    expect(view.followers(CLEO)).toEqual([ALICE, BRAN]);
    expect(view.followers(DION)).toEqual([CLEO]);
    expect(view.friends(ALICE)).toEqual([BRAN]);
    expect(view.friends(BRAN)).toEqual([ALICE]);
    expect(view.friends(CLEO)).toEqual([]);
  });
});

describe('buildSocialView posts', () => {
  it('serves a post as its newest version, with its creation and edit times', () => {
    expect(view.post(ALICE, a1.id)).toMatchObject({
      author: ALICE,
      postId: a1.id,
      editId: a1.id,
      createdAtMs: minute(1),
      editedAtMs: null,
    });
    expect(view.post(ALICE, article.id)).toMatchObject({
      editId: articleEdit.editId,
      createdAtMs: minute(8),
      editedAtMs: minute(9),
      data: { title: 'On Pubky, revised', content: `Final, thanks pk:${DION}` },
    });
  });

  it('leaves out a deleted post and one whose file is no post, but keeps a reply to the deleted one', () => {
    expect(view.post(ALICE, gone.id)).toBeNull();
    expect(view.post(CLEO, broken.id)).toBeNull();
    expect(view.post(DION, orphan.id)?.data.parent).toEqual({ kind: 'post', author: ALICE, postId: gone.id });
    expect(view.repliesTo(ALICE, gone.id).map(({ postId }) => postId)).toEqual([orphan.id]);
  });

  it('lists each author newest first, split into root posts and replies', () => {
    expect(ids(view.postsBy(ALICE))).toEqual([id(ALICE, article), id(ALICE, a1)]);
    expect(ids(view.postsBy(BRAN))).toEqual([id(BRAN, image), id(BRAN, repost), id(BRAN, b1)]);
    expect(ids(view.postsBy(CLEO))).toEqual([id(CLEO, quote), id(CLEO, c1)]);
    expect(ids(view.rootPostsBy(BRAN))).toEqual([id(BRAN, image), id(BRAN, repost)]);
    expect(ids(view.repliesBy(BRAN))).toEqual([id(BRAN, b1)]);
    expect(ids(view.rootPostsBy(DION))).toEqual([id(DION, collection)]);
    expect(ids(view.repliesBy(DION))).toEqual([id(DION, orphan)]);
    expect(view.postsBy('stranger')).toEqual([]);
  });
});

describe('buildSocialView reverse edges', () => {
  it('resolves replies, reposts with quotes, mentions and collections', () => {
    expect(ids(view.repliesTo(ALICE, a1.id))).toEqual([id(BRAN, b1)]);
    expect(ids(view.repliesTo(BRAN, b1.id))).toEqual([id(CLEO, c1)]);
    expect(ids(view.repliesTo(CLEO, c1.id))).toEqual([]);
    expect(ids(view.repostsOf(ALICE, a1.id))).toEqual([id(CLEO, quote), id(BRAN, repost)]);
    expect(ids(view.mentionsOf(BRAN))).toEqual([id(ALICE, a1)]);
    expect(ids(view.mentionsOf(ALICE))).toEqual([id(CLEO, quote)]);
    expect(ids(view.mentionsOf(DION))).toEqual([id(ALICE, article)]);
    expect(ids(view.collectionsContaining(ALICE, a1.id))).toEqual([id(DION, collection)]);
    expect(ids(view.collectionsContaining(ALICE, article.id))).toEqual([id(DION, collection)]);
  });

  it('groups tags by label, most taggers first, with the taggers sorted', () => {
    expect(view.tagsOnPost(ALICE, a1.id)).toEqual([
      { label: 'rust', taggers: [CLEO, DION, BRAN] },
      { label: 'pubky', taggers: [CLEO] },
    ]);
    expect(view.tagsOnUser(BRAN)).toEqual([
      { label: 'friend', taggers: [CLEO, ALICE] },
      { label: 'dev', taggers: [DION] },
    ]);
    expect(view.tagsOnPost(ALICE, article.id)).toEqual([]);
    expect(view.tagsBy(ALICE).map(({ label, uri }) => [label, uri])).toEqual([
      ['friend', buildUri(BRAN, 'user')],
      ['web', 'https://example.com/'],
    ]);
    expect(view.tagsBy(CLEO).map(({ label }) => label)).toEqual(['friend', 'pubky', 'rust']);
  });
});

describe('buildSocialView counts', () => {
  it('counts per post', () => {
    expect(view.postCounts(ALICE, a1.id)).toEqual({ replies: 1, reposts: 2, tags: 4, uniqueTags: 2 });
    expect(view.postCounts(BRAN, b1.id)).toEqual({ replies: 1, reposts: 0, tags: 0, uniqueTags: 0 });
    expect(view.postCounts(ALICE, article.id)).toEqual({ replies: 0, reposts: 0, tags: 0, uniqueTags: 0 });
  });

  it('counts per user', () => {
    expect(view.userCounts(ALICE)).toEqual({
      posts: 2,
      replies: 0,
      following: 2,
      followers: 1,
      friends: 1,
      tagsGiven: 2,
      tagged: 0,
    });
    expect(view.userCounts(BRAN)).toEqual({
      posts: 3,
      replies: 1,
      following: 2,
      followers: 1,
      friends: 1,
      tagsGiven: 1,
      tagged: 3,
    });
    expect(view.userCounts(CLEO)).toEqual({
      posts: 2,
      replies: 1,
      following: 1,
      followers: 2,
      friends: 0,
      tagsGiven: 3,
      tagged: 0,
    });
    expect(view.userCounts(DION)).toEqual({
      posts: 2,
      replies: 1,
      following: 0,
      followers: 1,
      friends: 0,
      tagsGiven: 2,
      tagged: 0,
    });
  });
});

describe('buildSocialView timeline', () => {
  const everyone = [ALICE, BRAN, CLEO, DION];

  it('merges root posts newest first, replies on request, and filters by kind', () => {
    expect(ids(view.timeline(everyone))).toEqual([
      id(DION, collection),
      id(BRAN, image),
      id(ALICE, article),
      id(CLEO, quote),
      id(BRAN, repost),
      id(ALICE, a1),
    ]);
    expect(ids(view.timeline(everyone, { includeReplies: true }))).toEqual([
      id(DION, collection),
      id(BRAN, image),
      id(ALICE, article),
      id(CLEO, quote),
      id(BRAN, repost),
      id(DION, orphan),
      id(CLEO, c1),
      id(BRAN, b1),
      id(ALICE, a1),
    ]);
    expect(ids(view.timeline(everyone, { kinds: ['note'] }))).toEqual([
      id(CLEO, quote),
      id(BRAN, repost),
      id(ALICE, a1),
    ]);
  });

  it('builds the following timeline of a user', () => {
    expect(ids(view.timeline(view.following(ALICE)))).toEqual([id(BRAN, image), id(CLEO, quote), id(BRAN, repost)]);
  });

  it('breaks a tie on the millisecond by author, then by the newer post id', () => {
    const [first, second, theirs] = at(30, () => [
      buildPost(BRAN, { content: 'one' }),
      buildPost(BRAN, { content: 'two' }),
      buildPost(ALICE, { content: 'three' }),
    ]);
    const tied = buildSocialView([
      authorRecords(BRAN, 0, new Map([recordOf(BRAN, first), recordOf(BRAN, second)])),
      authorRecords(ALICE, 1, new Map([recordOf(ALICE, theirs)])),
    ]);

    expect(second.id > first.id).toBe(true);
    expect(ids(tied.timeline([BRAN, ALICE]))).toEqual([id(ALICE, theirs), id(BRAN, second), id(BRAN, first)]);
  });

  it('serves no post whose newest version has no data, even with an older version readable', () => {
    const activity = new Map([recordOf(ALICE, article), recordOf(ALICE, articleEdit, false)]);
    const unreadable = buildSocialView([authorRecords(ALICE, 0, activity)]);

    expect(unreadable.post(ALICE, article.id)).toBeNull();
    expect(unreadable.postsBy(ALICE)).toEqual([]);
  });
});

describe('buildSocialView time estimates', () => {
  it('interpolates between the post versions of the homeserver and clamps past either end', () => {
    // Cursors 9 to 20 are posts written at minutes 1 to 12; cursor 12 was the deleted post, between minutes 3 and 5.
    expect(view.timeOf(ALICE, BigInt(13))).toBe(minute(5));
    expect(view.timeOf(BRAN, BigInt(12))).toBe(minute(4));
    expect(view.timeOf(ALICE, BigInt(1))).toBe(minute(1));
    expect(view.timeOf(ALICE, BigInt(100))).toBe(minute(12));
    expect(view.timeOf('stranger', BigInt(13))).toBeNull();
  });

  it('dates follows, tags and profiles by their cursors', () => {
    expect(view.followedAtMs(CLEO, DION)).toBe(minute(1));
    expect(view.followedAtMs(DION, CLEO)).toBeNull();
    expect(view.profileAtMs(ALICE)).toBe(minute(1));
    expect(view.profileAtMs(DION)).toBeNull();
    expect(view.tagsBy(ALICE).map(({ atMs }) => atMs)).toEqual([minute(12), minute(12)]);
  });

  it('knows nothing of the time on a homeserver with no post, whatever the others hold', () => {
    const moved = recordsOf(network).map((entry) =>
      entry.author === DION
        ? { ...entry, homeserver: 'hs2', activity: new Map<string, RecordEntry<SocialData>>() }
        : entry,
    );
    const split = buildSocialView(moved);

    expect(split.timeOf(DION, BigInt(13))).toBeNull();
    expect(split.timeOf(ALICE, BigInt(13))).toBe(minute(5));
  });

  it('ignores a backdated and a future-dated post when estimating', () => {
    const files: SocialFile[] = [
      { author: ALICE, ...at(10, () => buildPost(ALICE, { content: 'ten' })) },
      { author: BRAN, ...at(20, () => buildPost(BRAN, { content: 'twenty' })) },
      { author: BRAN, ...at(1, () => buildPost(BRAN, { content: 'backdated' })) },
      { author: ALICE, ...at(30, () => buildPost(ALICE, { content: 'thirty' })) },
      { author: BRAN, ...at(10000000, () => buildPost(BRAN, { content: 'from the future' })) },
      { author: ALICE, ...at(40, () => buildPost(ALICE, { content: 'forty' })) },
      { author: ALICE, ...at(41, () => buildTag(ALICE, buildUri(BRAN, 'user'), 'friend')) },
    ];
    const timed = buildSocialView(
      recordsFrom(
        files,
        new Map([
          [ALICE, 0],
          [BRAN, 1],
        ]),
      ),
    );

    expect(timed.timeOf(ALICE, BigInt(3))).toBe(minute(25));
    expect(timed.timeOf(ALICE, BigInt(5))).toBe(minute(35));
    expect(timed.tagsBy(ALICE)[0].atMs).toBe(minute(40));
  });

  it('counts a profile write and a follow on the graph clock', () => {
    const files: SocialFile[] = [
      { author: ALICE, ...at(10, () => buildPost(ALICE, { content: 'ten' })) },
      { author: ALICE, ...at(0, () => buildUser(ALICE, { name: 'Alice' })) },
      { author: ALICE, ...at(0, () => buildFollow(ALICE, BRAN)) },
      { author: ALICE, ...at(40, () => buildPost(ALICE, { content: 'forty' })) },
    ];
    const timed = buildSocialView(recordsFrom(files, new Map([[ALICE, 0]])));

    expect(timed.profileAtMs(ALICE)).toBe(minute(20));
    expect(timed.followedAtMs(ALICE, BRAN)).toBe(minute(30));
  });
});

describe('buildSocialView membership', () => {
  it('serves a visited author their own records, while only members make edges and counts', () => {
    const visited = buildSocialView(withAuthor(recordsOf(network), DION, { membership: 'visited' }));

    expect(visited.authors).toEqual([ALICE, BRAN, CLEO]);
    expect(visited.membershipOf(DION)).toBe('visited');
    expect(visited.membershipOf(ALICE)).toBe('member');
    expect(visited.membershipOf('stranger')).toBeNull();
    expect(ids(visited.postsBy(DION))).toEqual([id(DION, collection), id(DION, orphan)]);
    expect(visited.tagsBy(DION).map(({ label }) => label)).toEqual(['dev', 'rust']);
    expect(visited.historyOf(DION)).toEqual({ complete: true, sinceMs: null });
    expect(visited.followers(DION)).toEqual([CLEO]);
    expect(visited.tagsOnPost(ALICE, a1.id)).toEqual([
      { label: 'rust', taggers: [CLEO, BRAN] },
      { label: 'pubky', taggers: [CLEO] },
    ]);
    expect(visited.collectionsContaining(ALICE, a1.id)).toEqual([]);
    expect(visited.repliesTo(ALICE, gone.id)).toEqual([]);
  });

  it('keeps of a referenced author only the profile and the posts loaded alone, which make no edge', () => {
    const records = recordsOf(network);
    const cleo = records.find(({ author }) => author === CLEO);
    const referenced = buildSocialView(
      withAuthor(records, CLEO, { membership: 'referenced', hop: null, loose: cleo?.activity }),
    );

    expect(referenced.authors).toEqual([ALICE, BRAN, DION]);
    expect(referenced.profile(CLEO)?.name).toBe('Cleo');
    expect(referenced.following(CLEO)).toEqual([]);
    expect(referenced.followers(DION)).toEqual([]);
    expect(referenced.post(CLEO, c1.id)?.data.content).toBe('Thanks both');
    expect(referenced.postsBy(CLEO)).toEqual([]);
    expect(referenced.timeline([CLEO], { includeReplies: true })).toEqual([]);
    expect(referenced.repliesTo(BRAN, b1.id)).toEqual([]);
    expect(referenced.tagsBy(CLEO)).toEqual([]);
    expect(referenced.historyOf(CLEO)).toEqual({ complete: false, sinceMs: null });
  });

  it('resolves a member post loaded alone by key without adding it to the stream', () => {
    const records = recordsOf(network);
    const alice = records.find(({ author }) => author === ALICE);
    const partial = withPartialActivity(records, ALICE, BigInt(11));
    const loaded = buildSocialView(withAuthor(partial, ALICE, { loose: alice?.activity }));

    expect(loaded.post(ALICE, a1.id)?.postId).toBe(a1.id);
    expect(ids(loaded.postsBy(ALICE))).toEqual([id(ALICE, article)]);
    expect(loaded.post(ALICE, article.id)?.editId).toBe(articleEdit.editId);
    expect(ids(loaded.repliesTo(ALICE, a1.id))).toEqual([id(BRAN, b1)]);
  });

  it('says which posts and profiles tombstones prove deleted', () => {
    const deleted = buildSocialView(
      withAuthor(recordsOf(network), ALICE, { deleted: { posts: new Set([gone.id]), profile: true } }),
    );

    expect(deleted.postDeleted(ALICE, gone.id)).toBe(true);
    expect(deleted.postDeleted(ALICE, a1.id)).toBe(false);
    expect(deleted.postDeleted(BRAN, gone.id)).toBe(false);
    expect(deleted.profileDeleted(ALICE)).toBe(true);
    expect(deleted.profileDeleted(BRAN)).toBe(false);
  });
});

describe('buildSocialView history', () => {
  it('reports a whole history as complete and a windowed one from the estimated time of its tail', () => {
    const partial = buildSocialView(withPartialActivity(recordsOf(network), CLEO, BigInt(14)));

    expect(view.historyOf(ALICE)).toEqual({ complete: true, sinceMs: null });
    expect(partial.historyOf(CLEO)).toEqual({ complete: false, sinceMs: minute(6) });
    expect(partial.historyOf(CLEO, 'graph')).toEqual({ complete: true, sinceMs: null });
    expect(ids(partial.postsBy(CLEO))).toEqual([id(CLEO, quote)]);
    expect(partial.historyOf('stranger')).toEqual({ complete: false, sinceMs: null });
  });
});
