import { describe, expect, it } from 'vitest';
import { buildCompositeId } from '@/models/models.utils';
import { POST_ID_STAGING_FIXTURE, PUBKY_52_STAGING_FIXTURE, PUBKY_INVALID_BAD_CHAR } from '@/test-utils/pubky';
import type { ContextualBannerCopyInput } from './useContextualBanner.types';
import {
  buildContextualBannerCopy,
  GENERIC_CONTEXTUAL_BANNER_COPY,
  getContextualBannerTarget,
} from './useContextualBanner.utils';

type CopyPost = NonNullable<ContextualBannerCopyInput['post']>;
type CopyUser = NonNullable<ContextualBannerCopyInput['user']>;

const AUTHOR = PUBKY_52_STAGING_FIXTURE;
const POST_ID = POST_ID_STAGING_FIXTURE;
const NAME = 'John Carvalho';

const GENERIC = {
  headline: 'Join the conversation',
  body: 'Join Pubky to discover conversations and follow people and topics you care about.',
};

const articleContent = (title: string) => JSON.stringify({ title, body: 'Lightning used to be fragile.' });
const collectionContent = (name: string) =>
  JSON.stringify({ name, description: 'Curated posts', items: [`pubky://${AUTHOR}/pub/pubky.app/posts/${POST_ID}`] });

const makePost = (overrides: Partial<CopyPost> = {}): CopyPost => ({
  kind: 'short',
  content: 'Bitcoin brings people together.',
  lock: null,
  deleted: false,
  is_blurred: false,
  ...overrides,
});

const makeUser = (overrides: Partial<CopyUser> = {}): CopyUser => ({ name: NAME, deleted: false, ...overrides });

// Rows cached from Nexus builds that predate the `deleted` flag: the `[DELETED]` marker and no flag at all.
const legacyDeletedUser: CopyUser = { name: '[DELETED]' };
const legacyDeletedPost: CopyPost = { kind: 'short', content: '[DELETED]', lock: null, is_blurred: false };

const articlePost = (title = 'How Lightning became more reliable') =>
  makePost({ kind: 'long', content: articleContent(title) });
const collectionPost = (name = 'AI & Robotics') => makePost({ kind: 'collection', content: collectionContent(name) });

const postCopy = (name: string) => ({
  headline: 'Join the conversation',
  body: `Join Pubky to reply to ${name}, tag this post, and share your perspective.`,
});
const articleCopy = (title: string, name: string) => ({
  headline: `Enjoying “${title}”?`,
  body: `Join Pubky to reply to ${name}, tag this article, and discover more great writing.`,
});
const videoCopy = (name: string) => ({
  headline: 'Enjoying this video?',
  body: `Join Pubky to reply to ${name}, tag this video, and discover more posts.`,
});
const lockCopy = (name: string) => ({
  headline: "Want to see what's inside?",
  body: `Join Pubky to unlock posts from ${name} and stay up to date.`,
});
const collectionCopy = (collectionName: string) => ({
  headline: `Interested in ${collectionName}?`,
  body: 'Join Pubky to follow this collection and discover more about this topic.',
});
const profileCopy = (name: string) => ({
  headline: `Get to know ${name}`,
  body: `Join Pubky to follow ${name} and take part in the conversation.`,
});

describe('getContextualBannerTarget', () => {
  it('resolves a post route to the post composite id and its author', () => {
    expect(getContextualBannerTarget(`/post/${AUTHOR}/${POST_ID}`)).toEqual({
      kind: 'post',
      compositeId: buildCompositeId({ pubky: AUTHOR, id: POST_ID }),
      authorId: AUTHOR,
    });
  });

  it('keeps a malformed post route as a post target (its reads are gated by the hook)', () => {
    expect(getContextualBannerTarget('/post/not-a-pubky/x')).toEqual({
      kind: 'post',
      compositeId: buildCompositeId({ pubky: 'not-a-pubky', id: 'x' }),
      authorId: 'not-a-pubky',
    });
  });

  it('resolves a single collection route to the collection composite id', () => {
    expect(getContextualBannerTarget(`/collections/${AUTHOR}/${POST_ID}`)).toEqual({
      kind: 'collection',
      compositeId: buildCompositeId({ pubky: AUTHOR, id: POST_ID }),
    });
  });

  it('resolves another user profile route to its raw pubky', () => {
    expect(getContextualBannerTarget(`/profile/${AUTHOR}`)).toEqual({ kind: 'profile', pubky: AUTHOR });
  });

  it.each([
    ['the bookmarks collection', `/collections/bookmarks/${POST_ID}`],
    ['the own profile', '/profile'],
    ['a profile sub-tab', `/profile/${AUTHOR}/followers`],
    ['a pk:-prefixed profile', `/profile/pk:${AUTHOR}`],
    ['a malformed profile id', `/profile/${PUBKY_INVALID_BAD_CHAR}`],
    ['a post route with extra segments', `/post/${AUTHOR}/${POST_ID}/extra`],
    ['home', '/home'],
    ['hot', '/hot'],
    ['search', '/search'],
    ['the collections index', '/collections'],
    ['the shop', '/shop'],
    ['a shop sub-route', '/shop/x'],
    ['an invite', '/invite/code'],
    ['the landing page', '/'],
  ])('returns null for %s (%s)', (_label, pathname) => {
    expect(getContextualBannerTarget(pathname)).toBeNull();
  });
});

describe('buildContextualBannerCopy', () => {
  it('exports the generic copy', () => {
    expect(GENERIC_CONTEXTUAL_BANNER_COPY).toEqual(GENERIC);
  });

  describe('profile', () => {
    it('greets the profile owner by name', () => {
      expect(buildContextualBannerCopy({ target: 'profile', post: null, user: makeUser() })).toEqual(profileCopy(NAME));
    });

    it.each([
      ['no user row', null],
      ['a deleted user (flag)', makeUser({ deleted: true })],
      ['a deleted user (legacy [DELETED] name)', legacyDeletedUser],
      ['an empty name', makeUser({ name: '' })],
      ['a whitespace-only name', makeUser({ name: '   ' })],
    ])('falls back to the generic copy for %s', (_label, user) => {
      expect(buildContextualBannerCopy({ target: 'profile', post: null, user })).toEqual(GENERIC);
    });
  });

  describe('collection', () => {
    it('names the parsed collection on a collection route', () => {
      expect(buildContextualBannerCopy({ target: 'collection', post: collectionPost(), user: null })).toEqual(
        collectionCopy('AI & Robotics'),
      );
    });

    it('uses the collection copy when a post route resolves to a collection row', () => {
      expect(buildContextualBannerCopy({ target: 'post', post: collectionPost(), user: makeUser() })).toEqual(
        collectionCopy('AI & Robotics'),
      );
    });

    const namelessCollections: [string, CopyPost][] = [
      ['a name-less envelope', makePost({ kind: 'collection', content: JSON.stringify({ items: [] }) })],
      ['an empty name', collectionPost('')],
      ['a whitespace-only name', collectionPost('   ')],
      ['content that is not JSON', makePost({ kind: 'collection', content: 'not json {' })],
    ];

    it.each(namelessCollections)('falls back to the generic copy for %s', (_label, post) => {
      expect(buildContextualBannerCopy({ target: 'collection', post, user: null })).toEqual(GENERIC);
    });

    it.each(namelessCollections)(
      'falls back to the generic copy, not the post copy, on a post route for %s',
      (_label, post) => {
        expect(buildContextualBannerCopy({ target: 'post', post, user: makeUser() })).toEqual(GENERIC);
      },
    );

    it('falls back to the generic copy when the collection route row is not a collection', () => {
      expect(buildContextualBannerCopy({ target: 'collection', post: makePost(), user: makeUser() })).toEqual(GENERIC);
      expect(buildContextualBannerCopy({ target: 'collection', post: articlePost(), user: makeUser() })).toEqual(
        GENERIC,
      );
    });

    it('falls back to the generic copy for a deleted or blurred collection', () => {
      expect(
        buildContextualBannerCopy({ target: 'collection', post: { ...collectionPost(), deleted: true }, user: null }),
      ).toEqual(GENERIC);
      expect(
        buildContextualBannerCopy({
          target: 'collection',
          post: { ...collectionPost(), is_blurred: true },
          user: null,
        }),
      ).toEqual(GENERIC);
    });
  });

  describe('post', () => {
    it('quotes the title of an article', () => {
      expect(buildContextualBannerCopy({ target: 'post', post: articlePost(), user: makeUser() })).toEqual(
        articleCopy('How Lightning became more reliable', NAME),
      );
    });

    it('uses the video copy for a video post', () => {
      expect(
        buildContextualBannerCopy({ target: 'post', post: makePost({ kind: 'video' }), user: makeUser() }),
      ).toEqual(videoCopy(NAME));
    });

    it.each([
      ['a short post', makePost({ kind: 'short' })],
      ['an article', articlePost()],
      ['a video', makePost({ kind: 'video' })],
    ])('uses the lock copy for a lock whose teaser is %s', (_label, teaser) => {
      const post = { ...teaser, lock: `https://lock.example/${POST_ID}/lock.json` };
      expect(buildContextualBannerCopy({ target: 'post', post, user: makeUser() })).toEqual(lockCopy(NAME));
    });

    it.each(['short', 'image', 'link', 'file'])('uses the conversation copy for a %s post', (kind) => {
      expect(buildContextualBannerCopy({ target: 'post', post: makePost({ kind }), user: makeUser() })).toEqual(
        postCopy(NAME),
      );
    });

    it.each([
      ['content that is not JSON', makePost({ kind: 'long', content: 'Just some text {' })],
      ['an empty title', articlePost('')],
      ['a whitespace-only title', articlePost('   ')],
      ['an envelope without a body', makePost({ kind: 'long', content: JSON.stringify({ title: 'Title' }) })],
    ])('uses the conversation copy for an article with %s', (_label, post) => {
      expect(buildContextualBannerCopy({ target: 'post', post, user: makeUser() })).toEqual(postCopy(NAME));
    });

    it('does not treat a non-long post with article-shaped content as an article', () => {
      expect(
        buildContextualBannerCopy({
          target: 'post',
          post: makePost({ kind: 'short', content: articleContent('Title') }),
          user: makeUser(),
        }),
      ).toEqual(postCopy(NAME));
    });

    describe('falls back to the generic copy', () => {
      it('when the post row is missing', () => {
        expect(buildContextualBannerCopy({ target: 'post', post: null, user: makeUser() })).toEqual(GENERIC);
      });

      it.each([
        ['a deleted post (flag)', makePost({ deleted: true })],
        ['a deleted post (legacy [DELETED] content)', legacyDeletedPost],
        ['a deleted article', { ...articlePost(), deleted: true }],
        ['a blurred post', makePost({ is_blurred: true })],
        ['a blurred article', { ...articlePost(), is_blurred: true }],
        ['a blurred lock', makePost({ lock: 'https://lock.example/lock.json', is_blurred: true })],
      ])('for %s', (_label, post) => {
        expect(buildContextualBannerCopy({ target: 'post', post, user: makeUser() })).toEqual(GENERIC);
      });

      const postKinds: [string, CopyPost][] = [
        ['short post', makePost()],
        ['article', articlePost()],
        ['video', makePost({ kind: 'video' })],
        ['lock', makePost({ lock: 'https://lock.example/lock.json' })],
      ];
      const missingAuthors: [string, CopyUser | null][] = [
        ['no author row', null],
        ['a deleted author (flag)', makeUser({ deleted: true })],
        ['a deleted author (legacy [DELETED] name)', legacyDeletedUser],
        ['an empty author name', makeUser({ name: '' })],
        ['a whitespace-only author name', makeUser({ name: ' \t ' })],
      ];

      const missingAuthorCases = postKinds.flatMap(([kind, post]) =>
        missingAuthors.map(([author, user]): [string, string, CopyPost, CopyUser | null] => [kind, author, post, user]),
      );

      it.each(missingAuthorCases)('for a %s with %s', (_kind, _author, post, user) => {
        expect(buildContextualBannerCopy({ target: 'post', post, user })).toEqual(GENERIC);
      });
    });
  });

  describe('truncation and trimming', () => {
    it('trims the name before interpolating it', () => {
      expect(
        buildContextualBannerCopy({ target: 'profile', post: null, user: makeUser({ name: '  Alice  ' }) }),
      ).toEqual(profileCopy('Alice'));
      expect(
        buildContextualBannerCopy({ target: 'post', post: makePost(), user: makeUser({ name: '\tAlice\n' }) }),
      ).toEqual(postCopy('Alice'));
    });

    it('trims article titles and collection names', () => {
      expect(buildContextualBannerCopy({ target: 'post', post: articlePost('  Title  '), user: makeUser() })).toEqual(
        articleCopy('Title', NAME),
      );
      expect(buildContextualBannerCopy({ target: 'collection', post: collectionPost('  AI  '), user: null })).toEqual(
        collectionCopy('AI'),
      );
    });

    it('cuts a 40-grapheme name to 32 graphemes without splitting an emoji', () => {
      // 31 letters + a 3-code-point ZWJ emoji is exactly 32 graphemes; a code-unit cut would split the emoji.
      const name = `${'a'.repeat(31)}👩‍💻${'b'.repeat(8)}`;
      const expected = `${'a'.repeat(31)}👩‍💻...`;

      expect(buildContextualBannerCopy({ target: 'profile', post: null, user: makeUser({ name }) })).toEqual(
        profileCopy(expected),
      );
      expect(buildContextualBannerCopy({ target: 'post', post: makePost(), user: makeUser({ name }) })).toEqual(
        postCopy(expected),
      );
    });

    it('cuts an all-emoji name by grapheme', () => {
      const name = '🇵🇹'.repeat(40);

      expect(buildContextualBannerCopy({ target: 'profile', post: null, user: makeUser({ name }) })).toEqual(
        profileCopy(`${'🇵🇹'.repeat(32)}...`),
      );
    });

    it('keeps a name of exactly 32 graphemes whole, after trimming', () => {
      const name = 'n'.repeat(32);

      expect(
        buildContextualBannerCopy({ target: 'profile', post: null, user: makeUser({ name: `   ${name}   ` }) }),
      ).toEqual(profileCopy(name));
    });

    it('cuts a 76-grapheme article title to 64 graphemes without splitting an emoji', () => {
      // A 5-code-point ZWJ family at grapheme 64: a code-unit or code-point cut would split it.
      const title = `${'t'.repeat(63)}👨‍👩‍👧${'u'.repeat(12)}`;

      expect(buildContextualBannerCopy({ target: 'post', post: articlePost(title), user: makeUser() })).toEqual(
        articleCopy(`${'t'.repeat(63)}👨‍👩‍👧...`, NAME),
      );
    });

    it('cuts a 76-grapheme collection name to 64 graphemes without splitting an emoji', () => {
      // A flag is two regional-indicator code points: a code-unit or code-point cut would split it.
      const collectionName = `${'c'.repeat(63)}🇵🇹${'d'.repeat(12)}`;

      expect(
        buildContextualBannerCopy({ target: 'collection', post: collectionPost(collectionName), user: null }),
      ).toEqual(collectionCopy(`${'c'.repeat(63)}🇵🇹...`));
    });

    it('keeps a title of exactly 64 graphemes whole, after trimming', () => {
      const title = 'w'.repeat(64);

      expect(
        buildContextualBannerCopy({ target: 'post', post: articlePost(`  ${title}  `), user: makeUser() }),
      ).toEqual(articleCopy(title, NAME));
    });
  });
});
