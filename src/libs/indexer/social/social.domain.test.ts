// @vitest-environment node
import { buildFile, buildFollow, buildMute, buildUri, buildUser, idMicros } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import type { RecordEntry } from '../indexer.types';
import {
  createSocialDomain,
  FOLLOWS_PREFIX,
  POSTS_PREFIX,
  PROFILE_PATH,
  SOCIAL_ACTIVITY,
  SOCIAL_GRAPH,
  TAGS_PREFIX,
} from './social.domain';
import { ALICE, BRAN, CLEO, DION, socialNetwork } from './social.fixtures';
import type { SocialData } from './social.types';

const domain = createSocialDomain();
const { posts, writes } = socialNetwork();
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const record = (path: string): RecordEntry<SocialData> => ({ kind: 'record', path, cursor: BigInt(1) });
/** The bytes the network wrote at the author's path, none when it wrote nothing there. */
const bytesAt = (author: string, path: string) =>
  writes.find((write) => write.author === author && write.path === path)?.body ?? new Uint8Array();
const tagWrite = (author: string, index: number) =>
  writes.filter((write) => write.author === author && write.path.startsWith(TAGS_PREFIX))[index];

describe('createSocialDomain groups', () => {
  it('crawls follows and the profile in full, posts and tags in the window, scoped by follows', () => {
    expect(domain.groups).toEqual([
      { id: SOCIAL_GRAPH, paths: [FOLLOWS_PREFIX, PROFILE_PATH], history: 'full' },
      { id: SOCIAL_ACTIVITY, paths: [POSTS_PREFIX, TAGS_PREFIX], history: 'window' },
    ]);
    expect(domain.scopeGroup).toBe(SOCIAL_GRAPH);
    expect(domain.matchesHash).toBeUndefined();
  });

  it('matches the paths the builders write', () => {
    expect(buildUser(ALICE, { name: 'Alice' }).path).toBe(PROFILE_PATH);
    expect(buildFollow(ALICE, BRAN).path).toBe(`${FOLLOWS_PREFIX}${BRAN}.json`);
    expect(posts.a1.path.startsWith(POSTS_PREFIX)).toBe(true);
    expect(posts.articleEdit.path.startsWith(`${POSTS_PREFIX}${posts.article.id}/`)).toBe(true);
    expect(tagWrite(BRAN, 0).path.startsWith(TAGS_PREFIX)).toBe(true);
  });
});

describe('reduce', () => {
  it('reads a profile', () => {
    expect(domain.reduce(ALICE, PROFILE_PATH, bytesAt(ALICE, PROFILE_PATH))).toEqual({
      type: 'user',
      name: 'Alice',
      bio: 'Local-first',
      image: null,
      links: [],
      status: 'Around',
    });
    expect(domain.reduce(BRAN, PROFILE_PATH, bytesAt(BRAN, PROFILE_PATH))).toMatchObject({
      links: [{ title: 'Site', url: 'https://example.com/bran' }],
    });
    expect(domain.reduce(CLEO, PROFILE_PATH, bytesAt(CLEO, PROFILE_PATH))).toMatchObject({
      image: 'https://example.com/cleo.png',
    });
  });

  it('reads a note with its mentions, a reply, a repost and an image', () => {
    const { a1, b1, repost, image } = posts;

    expect(domain.reduce(ALICE, a1.path, a1.body)).toEqual({
      type: 'post',
      postId: a1.id,
      editId: a1.editId,
      kind: 'note',
      content: `Hello pk:${BRAN} and pubky${CLEO}`,
      parent: null,
      embed: null,
      mentions: [BRAN, CLEO],
      attachments: [],
      lock: null,
    });
    expect(domain.reduce(BRAN, b1.path, b1.body)).toMatchObject({
      parent: { kind: 'post', author: ALICE, postId: a1.id },
      mentions: [],
    });
    expect(domain.reduce(BRAN, repost.path, repost.body)).toMatchObject({
      content: '',
      embed: { kind: 'post', author: ALICE, postId: a1.id },
    });
    expect(domain.reduce(BRAN, image.path, image.body)).toMatchObject({
      kind: 'image',
      attachments: [{ uri: 'https://example.com/cat.png', name: 'cat.png' }],
    });
  });

  it('reads each version of an edited article with the post id of both', () => {
    const { article, articleEdit } = posts;

    expect(domain.reduce(ALICE, article.path, article.body)).toEqual({
      type: 'post',
      postId: article.id,
      editId: article.id,
      kind: 'article',
      content: 'Draft',
      title: 'On Pubky',
      coverImage: null,
      parent: null,
      embed: null,
      mentions: [],
      attachments: [],
      lock: null,
    });
    expect(domain.reduce(ALICE, articleEdit.path, articleEdit.body)).toMatchObject({
      postId: article.id,
      editId: articleEdit.editId,
      content: `Final, thanks pk:${DION}`,
      title: 'On Pubky, revised',
      mentions: [DION],
    });
    expect(articleEdit.editId > article.editId).toBe(true);
  });

  it('reads a collection with its items as targets', () => {
    const { a1, article, collection } = posts;

    expect(domain.reduce(DION, collection.path, collection.body)).toMatchObject({
      kind: 'collection',
      content: '',
      title: 'Best of',
      coverImage: null,
      layout: null,
      items: [
        { target: { kind: 'post', author: ALICE, postId: a1.id }, note: 'start here' },
        { target: { kind: 'post', author: ALICE, postId: article.id }, note: null },
        { target: { kind: 'other', uri: 'https://example.com/' }, note: null },
      ],
    });
  });

  it('reads tags on a post, on a user and on a web page, with the canonical target URI', () => {
    const onPost = tagWrite(BRAN, 0);
    const onUser = tagWrite(ALICE, 0);
    const onWeb = tagWrite(ALICE, 1);

    expect(domain.reduce(BRAN, onPost.path, onPost.body)).toEqual({
      type: 'tag',
      uri: buildUri(ALICE, 'post', posts.a1.id),
      target: { kind: 'post', author: ALICE, postId: posts.a1.id },
      label: 'rust',
    });
    expect(domain.reduce(ALICE, onUser.path, onUser.body)).toEqual({
      type: 'tag',
      uri: buildUri(BRAN, 'user'),
      target: { kind: 'user', author: BRAN },
      label: 'friend',
    });
    expect(domain.reduce(ALICE, onWeb.path, onWeb.body)).toEqual({
      type: 'tag',
      uri: 'https://example.com/',
      target: { kind: 'other', uri: 'https://example.com/' },
      label: 'web',
    });
  });

  it('refuses bytes that are no JSON, or JSON that breaks a rule', () => {
    const tooShortName = { name: 'A', bio: null, image: null, links: null, status: null };

    expect(domain.reduce(ALICE, PROFILE_PATH, new TextEncoder().encode('{'))).toBeNull();
    expect(domain.reduce(ALICE, PROFILE_PATH, encode(tooShortName))).toBeNull();
    expect(domain.reduce(ALICE, posts.a1.path, encode({ ...posts.a1.object, kind: 'poll' }))).toBeNull();
  });

  it('refuses bytes of another kind than the path names', () => {
    expect(domain.reduce(ALICE, PROFILE_PATH, buildFollow(ALICE, BRAN).body)).toBeNull();
    expect(domain.reduce(ALICE, posts.a1.path, bytesAt(ALICE, PROFILE_PATH))).toBeNull();
    expect(domain.reduce(BRAN, tagWrite(BRAN, 0).path, posts.b1.body)).toBeNull();
  });

  it('indexes no follow, media, private, foreign or malformed path, and no author that is no key', () => {
    const follow = buildFollow(ALICE, BRAN);
    const media = buildFile(ALICE, { bytes: new Uint8Array([1, 2, 3]), type: 'image/png' });
    const mute = buildMute(ALICE, BRAN);

    expect(domain.reduce(ALICE, follow.path, follow.body)).toBeNull();
    expect(domain.reduce(ALICE, media.path, new Uint8Array([1, 2, 3]))).toBeNull();
    expect(domain.reduce(ALICE, mute.path, mute.body)).toBeNull();
    expect(domain.reduce(ALICE, '/pub/other.app/profile.json', bytesAt(ALICE, PROFILE_PATH))).toBeNull();
    expect(domain.reduce(ALICE, `${POSTS_PREFIX}../profile.json`, bytesAt(ALICE, PROFILE_PATH))).toBeNull();
    expect(domain.reduce('alice', PROFILE_PATH, bytesAt(ALICE, PROFILE_PATH))).toBeNull();
    expect(domain.reduce(ALICE, PROFILE_PATH, new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull();
  });
});

describe('reviveData', () => {
  const reduced = (author: string, path: string) => domain.reduce(author, path, bytesAt(author, path));
  const revive = (author: string, path: string, value: unknown) => domain.reviveData?.(author, path, value) ?? null;
  /** What a saved index gives back for a payload: its JSON, parsed. */
  const stored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  it('keeps exactly what reduce made for a profile, every kind of post and a tag', () => {
    const cases: Array<[string, string]> = [
      [ALICE, PROFILE_PATH],
      [BRAN, PROFILE_PATH],
      [ALICE, posts.a1.path],
      [BRAN, posts.b1.path],
      [BRAN, posts.image.path],
      [ALICE, posts.articleEdit.path],
      [DION, posts.collection.path],
      [CLEO, tagWrite(CLEO, 0).path],
      [ALICE, tagWrite(ALICE, 1).path],
    ];
    for (const [author, path] of cases) {
      const data = reduced(author, path);
      expect(data, path).not.toBeNull();
      expect(revive(author, path, stored(data)), path).toEqual(data);
    }
  });

  it.each<[string, (value: Record<string, unknown>) => void]>([
    ['another post id', (value) => (value.postId = posts.b1.id)],
    ['an extra field', (value) => (value.extra = 1)],
    ['a missing field', (value) => delete value.lock],
    ['an unknown kind', (value) => (value.kind = 'poll')],
    ['mentions that are not the content’s', (value) => (value.mentions = [])],
    ['a parent that is no target', (value) => (value.parent = { kind: 'post', author: 'nobody', postId: 'x' })],
    ['content that is no string', (value) => (value.content = 7)],
  ])('refuses a post with %s', (_name, change) => {
    const value = stored(reduced(ALICE, posts.a1.path));
    if (typeof value !== 'object' || value === null) throw new Error('expected an object');
    const fields: Record<string, unknown> = { ...value };
    change(fields);

    expect(revive(ALICE, posts.a1.path, fields)).toBeNull();
  });

  it('refuses a payload of another kind than the path, a tag whose URI is not its target’s, and any follow', () => {
    const tag = tagWrite(CLEO, 0);
    const tagData = stored(reduced(CLEO, tag.path));
    if (typeof tagData !== 'object' || tagData === null) throw new Error('expected an object');

    expect(revive(ALICE, PROFILE_PATH, stored(reduced(ALICE, posts.a1.path)))).toBeNull();
    expect(revive(CLEO, tag.path, { ...tagData, uri: 'https://example.com/' })).toBeNull();
    expect(revive(ALICE, `${FOLLOWS_PREFIX}${BRAN}.json`, {})).toBeNull();
    expect(revive(ALICE, posts.a1.path, 'text')).toBeNull();
  });
});

describe('needsBody', () => {
  it('fetches profiles and post versions to render, tags later, and nothing else', () => {
    const media = buildFile(ALICE, { bytes: new Uint8Array([1]), type: 'image/png' });

    expect(domain.needsBody(PROFILE_PATH)).toBe('render');
    expect(domain.needsBody(posts.a1.path)).toBe('render');
    expect(domain.needsBody(posts.articleEdit.path)).toBe('render');
    expect(domain.needsBody(tagWrite(CLEO, 0).path)).toBe('later');
    expect(domain.needsBody(buildFollow(ALICE, BRAN).path)).toBeNull();
    expect(domain.needsBody(media.path)).toBeNull();
    expect(domain.needsBody(`${POSTS_PREFIX}${posts.a1.id}`)).toBeNull();
    expect(domain.needsBody(`${POSTS_PREFIX}not-an-id/x.json`)).toBeNull();
  });
});

describe('timeOfPath', () => {
  it('is the time each version was written in microseconds, its edit id, null elsewhere', () => {
    expect(domain.timeOfPath(posts.article.path)).toBe(BigInt(idMicros(posts.article.id)));
    expect(domain.timeOfPath(posts.articleEdit.path)).toBe(BigInt(idMicros(posts.articleEdit.editId)));
    expect(posts.articleEdit.editId).not.toBe(posts.articleEdit.id);
    expect(domain.timeOfPath(PROFILE_PATH)).toBeNull();
    expect(domain.timeOfPath(tagWrite(BRAN, 0).path)).toBeNull();
    expect(domain.timeOfPath(buildFollow(ALICE, BRAN).path)).toBeNull();
    expect(domain.timeOfPath(`${POSTS_PREFIX}not-an-id/x.json`)).toBeNull();
  });
});

describe('linksOf', () => {
  it('names the followee of every follow path', () => {
    const live = new Map(
      [
        PROFILE_PATH,
        buildFollow(ALICE, BRAN).path,
        buildFollow(ALICE, CLEO).path,
        `${FOLLOWS_PREFIX}not-a-key.json`,
        `${FOLLOWS_PREFIX}${DION}`,
      ].map((path): [string, RecordEntry<SocialData>] => [path, record(path)]),
    );

    expect(domain.linksOf(live)).toEqual([BRAN, CLEO]);
  });
});
