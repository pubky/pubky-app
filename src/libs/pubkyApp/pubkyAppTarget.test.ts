import { describe, expect, it } from 'vitest';
import { getPubkyAppTarget, isPubkyAppAddress } from './pubkyAppTarget';

const KEY = 'apuij4kxbsj1wnh4douy7jptoscrttnkoz9zfo6k8dge1mfyadso';
const ROOT = `pubky://${KEY}`;

describe('getPubkyAppTarget', () => {
  it.each([
    [
      'a 0.x post',
      `${ROOT}/pub/pubky.app/posts/00360YV6W3NZG`,
      { kind: 'post', authorId: KEY, postId: '00360YV6W3NZG' },
    ],
    [
      'a v1 post',
      `${ROOT}/pub/social/v1/posts/00360YV6W3NZG`,
      { kind: 'post', authorId: KEY, postId: '00360YV6W3NZG' },
    ],
    [
      'a v1 post’s version',
      `${ROOT}/pub/social/v1/posts/00360YV6W3NZG/00360YV6W3NZG.json`,
      { kind: 'post', authorId: KEY, postId: '00360YV6W3NZG' },
    ],
    ['a 0.x profile', `${ROOT}/pub/pubky.app/profile.json`, { kind: 'user', userId: KEY }],
    ['a v1 profile', `${ROOT}/pub/social/v1/profile.json`, { kind: 'user', userId: KEY }],
    ['the bare key', ROOT, { kind: 'user', userId: KEY }],
    ['the bare key with a slash', `${ROOT}/`, { kind: 'user', userId: KEY }],
    [
      'a 0.x file',
      `${ROOT}/pub/pubky.app/files/00360YV6W3NZG`,
      { kind: 'file', ownerId: KEY, uri: `${ROOT}/pub/pubky.app/files/00360YV6W3NZG` },
    ],
    [
      'v1 media',
      `${ROOT}/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png`,
      { kind: 'file', ownerId: KEY, uri: `${ROOT}/pub/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png` },
    ],
  ])('reads %s', (_, uri, target) => {
    expect(getPubkyAppTarget(uri)).toEqual(target);
  });

  it('reads the scheme in any case and ignores a query, a fragment and surrounding spaces', () => {
    const post = { kind: 'post', authorId: KEY, postId: '00360YV6W3NZG' };
    expect(getPubkyAppTarget(`PUBKY://${KEY}/pub/pubky.app/posts/00360YV6W3NZG`)).toEqual(post);
    expect(getPubkyAppTarget(`  ${ROOT}/pub/pubky.app/posts/00360YV6W3NZG?x=1#reply  `)).toEqual(post);
  });

  it('gives a file’s URI as Nexus keys it, however it was spelled', () => {
    const file = `${ROOT}/pub/pubky.app/files/00360YV6W3NZG`;
    expect(getPubkyAppTarget(`PUBKY://${KEY}/pub/pubky.app/files/00360YV6W3NZG?v=1#x`)).toEqual({
      kind: 'file',
      ownerId: KEY,
      uri: file,
    });
  });

  it.each([
    ['another app’s object', `${ROOT}/pub/loopky/decks/english3000-ha/manifest.json`],
    ['a v1 tag', `${ROOT}/pub/social/v1/tags/ABC.json`],
    ['a private v1 file', `${ROOT}/priv/social/v1/files/AKSZ57W2RFKHV1EHK007FQQ8TW.png`],
    ['a v1 file without its extension', `${ROOT}/pub/social/v1/files/abc`],
    ['a 0.x blob', `${ROOT}/pub/pubky.app/blobs/79FSMSJ2FA6SAB2Y2V0QE9Z1P4`],
    ['a 0.x tag', `${ROOT}/pub/pubky.app/tags/ABC`],
    ['a post without an id', `${ROOT}/pub/pubky.app/posts/`],
    ['a post path with a further segment', `${ROOT}/pub/pubky.app/posts/00360YV6W3NZG/extra`],
    ['a post id with an escaped slash', `${ROOT}/pub/pubky.app/posts/a%2Fb`],
    ['a key that is no pubky', 'pubky://bad/pub/pubky.app/posts/00360YV6W3NZG'],
    ['no key', 'pubky:///pub/pubky.app/posts/00360YV6W3NZG'],
    ['a key with a port', `pubky://${KEY}:80/pub/pubky.app/posts/00360YV6W3NZG`],
    ['a web link with the same path', `https://pubky.app/pub/pubky.app/posts/00360YV6W3NZG`],
    ['an identifier', 'isbn:9780140328721'],
    ['nothing', ''],
  ])('reads nothing in %s', (_, uri) => {
    expect(getPubkyAppTarget(uri)).toBeNull();
  });

  describe('isPubkyAppAddress', () => {
    it.each([
      `${ROOT}/pub/pubky.app/files/00360YV6W3NZG`,
      `${ROOT}/pub/pubky.app/blobs/79FSMSJ2FA6SAB2Y2V0QE9Z1P4`,
      `${ROOT}/pub/pubky.app/tags/ABC`,
      `${ROOT}/pub/social/v1/files/abc`,
      ROOT,
    ])('knows %s as pubky.app’s own', (uri) => {
      expect(isPubkyAppAddress(uri)).toBe(true);
    });

    it.each([
      `${ROOT}/pub/loopky/decks/english3000-ha/manifest.json`,
      'pubky://bad/pub/pubky.app/files/00360YV6W3NZG',
      'https://pubky.app/post/x',
      'isbn:9780140328721',
    ])('does not know %s', (uri) => {
      expect(isPubkyAppAddress(uri)).toBe(false);
    });
  });
});
