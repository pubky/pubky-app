// @vitest-environment node
import { buildUri, idMicros } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { encodeJson } from '../../fakeNetwork';
import type { Entry } from '../../indexer.types';
import {
  createSocialDomain,
  FOLLOWS_PREFIX,
  POSTS_PREFIX,
  PROFILE_PATH,
  socialV1Tree,
  TAGS_PREFIX,
} from '../social.domain';
import { ALICE, BRAN, CLEO } from '../social.fixtures';
import type { SocialData } from '../social.types';
import {
  legacyBlobUri,
  legacyFileRecord,
  legacyFileUriOf,
  legacyFollow,
  legacyId,
  legacyPath,
  legacyPost,
  legacyPostUri,
  legacyProfile,
  legacyTag,
  legacyUserUri,
} from './legacy.fixtures';
import { LEGACY_ROOT, legacySocialTree as tree, legacyTargetOf } from './legacyTree';

/** A value of the wrong type, as a hostile file would carry. */
const wrongType = <T>(value: unknown): T => value as T;

const p1 = legacyId(1);
const p2 = legacyId(2);
const reduce = (path: string, bytes: Uint8Array) => tree.reduce(ALICE, path, bytes);
const article = (envelope: unknown) => encodeJson({ content: JSON.stringify(envelope), kind: 'long' });

describe('legacySocialTree paths', () => {
  it('names the profile, follows, posts, tags and file records, and nothing else', () => {
    expect(tree.keyOf(ALICE, legacyPath.profile)).toEqual({ kind: 'profile' });
    expect(tree.keyOf(ALICE, legacyPath.follow(BRAN))).toEqual({ kind: 'follow', followee: BRAN });
    expect(tree.keyOf(ALICE, legacyPath.post(p1))).toEqual({ kind: 'post', postId: p1, editId: p1 });
    expect(tree.keyOf(ALICE, legacyPath.tag('TAGID'))).toEqual({ kind: 'tag' });
    expect(tree.keyOf(ALICE, legacyPath.file(p1))).toEqual({ kind: 'file', fileId: p1 });
    for (const path of [
      legacyPath.follow('not-a-key'),
      legacyPath.post('not-an-id'),
      `${legacyPath.post(p1)}/x`,
      legacyPath.tag(''),
      legacyPath.file('not-an-id'),
      legacyPath.blob('BLOB1'),
      `${LEGACY_ROOT}mutes/${BRAN}`,
      PROFILE_PATH,
      `${FOLLOWS_PREFIX}${BRAN}.json`,
    ]) {
      expect(tree.keyOf(ALICE, path), path).toBeNull();
    }
    expect(tree.followeeOf(legacyPath.follow(BRAN))).toBe(BRAN);
    expect(tree.followeeOf(`${FOLLOWS_PREFIX}${BRAN}.json`)).toBeNull();
  });

  it('owns its root alone, never a v1 path, and the other way round', () => {
    expect(tree.owns(legacyPath.post(p1))).toBe(true);
    expect(tree.owns(POSTS_PREFIX)).toBe(false);
    expect(socialV1Tree.owns(legacyPath.post(p1))).toBe(false);
    expect(socialV1Tree.keyOf(ALICE, legacyPath.post(p1))).toBeNull();
    expect(socialV1Tree.followeeOf(legacyPath.follow(BRAN))).toBeNull();
  });

  it('fetches profiles, posts, tags and file records, and dates a post or a file record by its id', () => {
    expect(tree.needsBody(legacyPath.profile)).toBe(true);
    expect(tree.needsBody(legacyPath.post(p1))).toBe(true);
    expect(tree.needsBody(legacyPath.tag('TAGID'))).toBe(true);
    expect(tree.needsBody(legacyPath.file(p1))).toBe(true);
    expect(tree.needsBody(legacyPath.follow(BRAN))).toBe(false);
    expect(tree.needsBody(legacyPath.blob('BLOB1'))).toBe(false);
    expect(tree.timeOfPath(legacyPath.post(p1))).toBe(BigInt(idMicros(p1)));
    expect(tree.timeOfPath(legacyPath.file(p2))).toBe(BigInt(idMicros(p2)));
    expect(tree.timeOfPath(legacyPath.tag('TAGID'))).toBeNull();
    expect(tree.postPath(p1)).toBe(legacyPath.post(p1));
  });
});

describe('legacyTargetOf', () => {
  it('reads the older spellings of a post and a user as the targets v1 gives them', () => {
    expect(legacyTargetOf(legacyPostUri(BRAN, p1))).toEqual({ kind: 'post', author: BRAN, postId: p1 });
    expect(legacyTargetOf(` ${legacyPostUri(BRAN, p1)}\n`)).toEqual({ kind: 'post', author: BRAN, postId: p1 });
    expect(legacyTargetOf(legacyUserUri(BRAN))).toEqual({ kind: 'user', author: BRAN });
    expect(legacyTargetOf(`pubky://${BRAN}`)).toEqual({ kind: 'user', author: BRAN });
    expect(legacyTargetOf(buildUri(BRAN, 'post', p1))).toEqual({ kind: 'post', author: BRAN, postId: p1 });
    expect(legacyTargetOf(buildUri(BRAN, 'user'))).toEqual({ kind: 'user', author: BRAN });
  });

  it('keeps anything else as written', () => {
    const file = legacyFileUriOf(BRAN, p1);

    expect(legacyTargetOf(file)).toEqual({ kind: 'other', uri: file });
    expect(legacyTargetOf('https://example.com/')).toEqual({ kind: 'other', uri: 'https://example.com/' });
    expect(legacyTargetOf(`pubky://nobody${legacyPath.post(p1)}`)).toMatchObject({ kind: 'other' });
  });
});

describe('legacySocialTree reduce', () => {
  it('reads a profile with its links', () => {
    const bytes = legacyProfile('Alice', {
      bio: 'Old bio',
      image: legacyFileUriOf(ALICE, p1),
      links: [{ title: 'Site', url: 'https://example.com/' }, { url: 'https://example.org/' }, { title: 'x' }],
    });

    expect(reduce(legacyPath.profile, bytes)).toEqual({
      type: 'user',
      name: 'Alice',
      bio: 'Old bio',
      image: legacyFileUriOf(ALICE, p1),
      links: [
        { title: 'Site', url: 'https://example.com/' },
        { title: '', url: 'https://example.org/' },
      ],
      status: null,
    });
    expect(reduce(legacyPath.profile, encodeJson({ bio: 'no name' }))).toBeNull();
  });

  it('reads a short post with a reply, an embed, mentions and attachments, as its only version', () => {
    const bytes = legacyPost({
      content: `Hi pk:${BRAN}`,
      parent: legacyPostUri(BRAN, p2),
      embed: buildUri(CLEO, 'post', p2),
      attachments: [legacyFileUriOf(ALICE, p2), wrongType<string>(7)],
    });

    expect(reduce(legacyPath.post(p1), bytes)).toEqual({
      type: 'post',
      postId: p1,
      editId: p1,
      kind: 'note',
      content: `Hi pk:${BRAN}`,
      parent: { kind: 'post', author: BRAN, postId: p2 },
      embed: { kind: 'post', author: CLEO, postId: p2 },
      mentions: [BRAN],
      attachments: [{ uri: legacyFileUriOf(ALICE, p2), name: null }],
      lock: null,
    });
  });

  it('maps each older kind and refuses an unknown one', () => {
    for (const [kind, expected] of [
      ['image', 'image'],
      ['video', 'video'],
      ['link', 'link'],
      ['file', 'file'],
    ]) {
      expect(reduce(legacyPath.post(p1), legacyPost({ content: 'x', kind }))).toMatchObject({ kind: expected });
    }
    expect(reduce(legacyPath.post(p1), legacyPost({ kind: 'poll' }))).toBeNull();
    expect(reduce(legacyPath.post(p1), encodeJson({ kind: 'short' }))).toBeNull();
  });

  it('reads an article from its envelope, or titled by its first line, or as a note without a title', () => {
    expect(reduce(legacyPath.post(p1), article({ title: ' On Pubky ', body: `Body pk:${CLEO}` }))).toMatchObject({
      kind: 'article',
      title: 'On Pubky',
      content: `Body pk:${CLEO}`,
      mentions: [CLEO],
      coverImage: null,
    });
    expect(reduce(legacyPath.post(p1), article({ title: '', body: '\n First line \nrest' }))).toMatchObject({
      kind: 'article',
      title: 'First line',
    });
    expect(reduce(legacyPath.post(p1), legacyPost({ kind: 'long', content: 'Plain\ntext' }))).toMatchObject({
      kind: 'article',
      title: 'Plain',
      content: 'Plain\ntext',
    });
    const untitled = reduce(legacyPath.post(p1), legacyPost({ kind: 'long', content: '  ' }));
    expect(untitled).toMatchObject({ kind: 'note', content: '  ' });
    expect(untitled).not.toHaveProperty('title');
  });

  it('reads a collection from its envelope, items in either spelling', () => {
    const content = JSON.stringify({
      name: 'Best of',
      description: 'Picks',
      items: [legacyPostUri(BRAN, p2), { uri: buildUri(CLEO, 'post', p2) }, 'https://example.com/', 3],
      cover_image: null,
      layout: 'grid',
    });

    expect(reduce(legacyPath.post(p1), encodeJson({ content, kind: 'collection' }))).toMatchObject({
      kind: 'collection',
      content: 'Picks',
      title: 'Best of',
      layout: 'grid',
      items: [
        { target: { kind: 'post', author: BRAN, postId: p2 }, note: null },
        { target: { kind: 'post', author: CLEO, postId: p2 }, note: null },
        { target: { kind: 'other', uri: 'https://example.com/' }, note: null },
      ],
    });
    expect(reduce(legacyPath.post(p1), encodeJson({ content: 'not json', kind: 'collection' }))).toBeNull();
  });

  it('reads a tag with its target in the canonical spelling and the label as the older writer stored it', () => {
    expect(reduce(legacyPath.tag('T1'), legacyTag(legacyPostUri(BRAN, p1), ' Rust '))).toEqual({
      type: 'tag',
      uri: buildUri(BRAN, 'post', p1),
      target: { kind: 'post', author: BRAN, postId: p1 },
      label: 'rust',
    });
    expect(reduce(legacyPath.tag('T2'), legacyTag(legacyUserUri(BRAN), 'friend'))).toMatchObject({
      uri: buildUri(BRAN, 'user'),
      target: { kind: 'user', author: BRAN },
    });
  });

  it('reads a file record, with the blob of its own author in the canonical spelling', () => {
    const blob = legacyBlobUri(ALICE, 'BLOB1');

    expect(reduce(legacyPath.file(p1), legacyFileRecord(` ${blob} `, { content_type: ' image/png ' }))).toEqual({
      type: 'file',
      name: 'cat.png',
      contentType: 'image/png',
      size: 3,
      src: blob,
      createdAt: 1_790_000_000_000_000,
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ['a blob of another author', { src: legacyBlobUri(BRAN, 'BLOB1') }],
    ['a source that is no blob', { src: 'https://example.com/cat.png' }],
    ['an unknown type', { content_type: 'image/x-cat' }],
    ['no name', { name: null }],
    ['a size that is no count', { size: -1 }],
    ['a creation time that is no integer', { created_at: '1' }],
  ])('reads no file record with %s', (_name, extra) => {
    expect(reduce(legacyPath.file(p1), legacyFileRecord(legacyBlobUri(ALICE, 'BLOB1'), extra))).toBeNull();
  });

  it('reads nothing from a follow, a path it does not name or bytes of no JSON object', () => {
    expect(reduce(legacyPath.follow(BRAN), legacyFollow())).toBeNull();
    expect(reduce(legacyPath.file(p1), legacyProfile('Alice'))).toBeNull();
    expect(reduce(legacyPath.profile, encodeJson(['Alice']))).toBeNull();
    expect(() => reduce(legacyPath.profile, new TextEncoder().encode('{'))).toThrow();
  });

  it('revives exactly what it reduced, and refuses a payload of another path', () => {
    const stored = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
    const cases: Array<[string, Uint8Array]> = [
      [legacyPath.profile, legacyProfile('Alice')],
      [legacyPath.post(p1), legacyPost({ content: 'x', parent: legacyPostUri(BRAN, p2) })],
      [legacyPath.post(p1), article({ title: 'T', body: 'B' })],
      [legacyPath.tag('T1'), legacyTag(legacyPostUri(BRAN, p1), 'rust')],
      [legacyPath.file(p1), legacyFileRecord(legacyBlobUri(ALICE, 'BLOB1'))],
    ];
    for (const [path, bytes] of cases) {
      const data = reduce(path, bytes);
      expect(data, path).not.toBeNull();
      expect(tree.reviveData(ALICE, path, stored(data)), path).toEqual(data);
    }
    expect(tree.reviveData(ALICE, legacyPath.post(p2), stored(reduce(legacyPath.post(p1), legacyPost())))).toBeNull();
    expect(tree.reviveData(ALICE, legacyPath.follow(BRAN), {})).toBeNull();
  });
});

describe('createSocialDomain with the older tree', () => {
  const domain = createSocialDomain(tree);
  const entries = (...paths: string[]) =>
    new Map(paths.map((path): [string, Entry<SocialData>] => [path, { kind: 'record', path, cursor: BigInt(1) }]));
  const tombstone = (path: string): ReadonlyMap<string, Entry<SocialData>> =>
    new Map([[path, { kind: 'tombstone', path, cursor: BigInt(2) }]]);

  it('reads both trees in the same two groups, under ids of their own', () => {
    expect(domain.groups).toEqual([
      {
        id: 'graph+legacy',
        paths: [FOLLOWS_PREFIX, PROFILE_PATH, legacyPath.follow(''), legacyPath.profile],
        history: 'full',
      },
      {
        id: 'activity+legacy',
        paths: [POSTS_PREFIX, TAGS_PREFIX, legacyPath.post(''), legacyPath.tag(''), legacyPath.file('')],
        history: 'window',
      },
    ]);
    expect(domain.scopeGroup).toBe('graph+legacy');
    expect(domain.profileLeaf(ALICE)).toEqual({
      author: ALICE,
      group: 'profile+legacy',
      paths: [PROFILE_PATH, legacyPath.profile],
    });
    expect(domain.postLeaf(ALICE, p1)).toEqual({
      author: ALICE,
      group: `post+legacy:${p1}`,
      paths: [`${POSTS_PREFIX}${p1}/`, legacyPath.post(p1)],
    });
    expect(domain.fileLeaf(ALICE, legacyPath.file(p1))).toEqual({
      author: ALICE,
      group: `file+legacy:${p1}`,
      paths: [legacyPath.file(p1)],
    });
  });

  it('has a file leaf only where a tree keeps a file record', () => {
    expect(domain.fileLeaf(ALICE, legacyPath.file('not-an-id'))).toBeNull();
    expect(domain.fileLeaf(ALICE, legacyPath.post(p1))).toBeNull();
    expect(domain.fileLeaf(ALICE, '/pub/social/v1/files/0000000000000000000000000A.png')).toBeNull();
    expect(createSocialDomain().fileLeaf(ALICE, legacyPath.file(p1))).toBeNull();
  });

  it('keeps the v1 ids and paths alone without it', () => {
    const v1 = createSocialDomain();

    expect(v1.groups.map(({ id }) => id)).toEqual(['graph', 'activity']);
    expect(v1.trees).toEqual([socialV1Tree]);
    expect(v1.profileLeaf(ALICE)).toEqual({ author: ALICE, group: 'profile', paths: [PROFILE_PATH] });
    expect(v1.postLeaf(ALICE, p1).group).toBe(`post:${p1}`);
    expect(v1.treeOf([entries(legacyPath.profile)])).toBe(socialV1Tree);
  });

  it('reads an author through v1 once any v1 profile event is there, else through the older tree when it has records', () => {
    expect(domain.treeOf([entries(legacyPath.profile, legacyPath.follow(BRAN))])).toBe(tree);
    expect(domain.treeOf([entries(legacyPath.profile, PROFILE_PATH)])).toBe(socialV1Tree);
    expect(domain.treeOf([entries(legacyPath.profile), tombstone(PROFILE_PATH)])).toBe(socialV1Tree);
    expect(domain.treeOf([new Map(), entries(legacyPath.post(p1))])).toBe(tree);
    // The move copies the older records before the profile: the copies wait for it.
    expect(domain.treeOf([entries(legacyPath.profile, `${FOLLOWS_PREFIX}${BRAN}.json`)])).toBe(tree);
    expect(domain.treeOf([entries(`${FOLLOWS_PREFIX}${BRAN}.json`)])).toBe(socialV1Tree);
    expect(domain.treeOf([])).toBe(socialV1Tree);
  });

  it('follows the links of the tree the author is read through', () => {
    const live = new Map(
      [legacyPath.profile, legacyPath.follow(BRAN), PROFILE_PATH, `${FOLLOWS_PREFIX}${CLEO}.json`].map(
        (path): [string, { kind: 'record'; path: string; cursor: bigint }] => [
          path,
          { kind: 'record', path, cursor: BigInt(1) },
        ],
      ),
    );
    const legacyOnly = new Map([...live].filter(([path]) => path.startsWith(LEGACY_ROOT)));

    expect(domain.linksOf(live, live)).toEqual([CLEO]);
    expect(domain.linksOf(legacyOnly, legacyOnly)).toEqual([BRAN]);
    expect(domain.linksOf(legacyOnly, new Map([...legacyOnly, ...tombstone(PROFILE_PATH)]))).toEqual([]);
  });

  it('hands each path to its own tree', () => {
    expect(domain.reduce(ALICE, legacyPath.profile, legacyProfile('Alice'))).toMatchObject({ name: 'Alice' });
    expect(domain.reduce(ALICE, legacyPath.profile, new TextEncoder().encode('{'))).toBeNull();
    expect(domain.needsBody(legacyPath.post(p1))).toBe(true);
    expect(domain.timeOfPath(legacyPath.post(p1))).toBe(BigInt(idMicros(p1)));
    expect(domain.reduce(ALICE, '/pub/other.app/profile.json', legacyProfile('Alice'))).toBeNull();
  });
});
