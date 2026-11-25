// @vitest-environment node
import { buildPost, buildUri, type BuiltPost } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import type { RecordEntry } from '../indexer.types';
import { createSocialDomain } from './social.domain';
import { ALICE, at, BRAN, CLEO, DION, MINUTE_MS, recordsOf, socialNetwork, T0 } from './social.fixtures';
import type { SocialData } from './social.types';
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
      { author: BRAN, hop: 0, graph: new Map(), activity: new Map([recordOf(BRAN, first), recordOf(BRAN, second)]) },
      { author: ALICE, hop: 1, graph: new Map(), activity: new Map([recordOf(ALICE, theirs)]) },
    ]);

    expect(second.id > first.id).toBe(true);
    expect(ids(tied.timeline([BRAN, ALICE]))).toEqual([id(ALICE, theirs), id(BRAN, second), id(BRAN, first)]);
  });

  it('serves no post whose newest version has no data, even with an older version readable', () => {
    const activity = new Map([recordOf(ALICE, article), recordOf(ALICE, articleEdit, false)]);
    const unreadable = buildSocialView([{ author: ALICE, hop: 0, graph: new Map(), activity }]);

    expect(unreadable.post(ALICE, article.id)).toBeNull();
    expect(unreadable.postsBy(ALICE)).toEqual([]);
  });
});
