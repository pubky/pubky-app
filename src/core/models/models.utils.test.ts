import { fakeOwner } from 'pubky-social-specs/testing';
import { describe, expect, it, vi } from 'vitest';
import { COMPOSITE_ID_DELIMITER } from '@/models/models.defaults';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import {
  buildCompositeId,
  buildCompositeIdFromPubkyUri,
  isV1MediaUri,
  mediaFilenameFromUri,
  parseCompositeId,
  parsePubkyUri,
} from '@/models/models.utils';

describe('models.utils (composite id)', () => {
  const author: Pubky = 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rd0';
  const postId = 'post-123';

  it('buildCompositeId', () => {
    const composite = buildCompositeId({ pubky: author, id: postId });
    expect(composite).toBe(`${author}${COMPOSITE_ID_DELIMITER}${postId}`);
  });

  it('parseCompositeId', () => {
    const composite = buildCompositeId({ pubky: author, id: postId });
    const parts = parseCompositeId(composite);
    expect(parts.pubky).toBe(author);
    expect(parts.id).toBe(postId);
  });

  it('buildCompositeIdFromPubkyUri for posts', () => {
    const uri = `pubky://${author}/pub/pubky.app/posts/${postId}`;
    const composite = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS });
    expect(composite).toBe(`${author}${COMPOSITE_ID_DELIMITER}${postId}`);
  });

  it('buildCompositeIdFromPubkyUri for files', () => {
    const fileId = 'file-456';
    const uri = `pubky://${author}/pub/pubky.app/files/${fileId}`;
    const composite = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES });
    expect(composite).toBe(`${author}${COMPOSITE_ID_DELIMITER}${fileId}`);
  });

  it('buildCompositeIdFromPubkyUri returns null for invalid uri', () => {
    const composite = buildCompositeIdFromPubkyUri({ uri: 'not-a-uri', domain: CompositeIdDomain.POSTS });
    expect(composite).toBeNull();
  });

  it('buildCompositeIdFromPubkyUri does not rely on URL hostname, which is empty on Chrome before 130', () => {
    const RealURL = globalThis.URL;
    vi.stubGlobal(
      'URL',
      class extends RealURL {
        get hostname() {
          return this.protocol === 'pubky:' ? '' : super.hostname;
        }
      },
    );
    try {
      const uri = `pubky://${author}/pub/pubky.app/files/file-789?v=1`;
      expect(buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES })).toBe(
        `${author}${COMPOSITE_ID_DELIMITER}file-789`,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('buildCompositeIdFromPubkyUri returns null when the uri has no authority', () => {
    const composite = buildCompositeIdFromPubkyUri({
      uri: 'pubky:///pub/pubky.app/files/file-789',
      domain: CompositeIdDomain.FILES,
    });
    expect(composite).toBeNull();
  });

  it('buildCompositeIdFromPubkyUri accepts a mixed-case scheme', () => {
    const uri = `PUBKY://${author}/pub/pubky.app/posts/${postId}`;
    expect(buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS })).toBe(
      `${author}${COMPOSITE_ID_DELIMITER}${postId}`,
    );
  });

  it.each([`${author}:abc`, `${author}:8080`, `user@${author}`])(
    'buildCompositeIdFromPubkyUri returns null for the malformed authority %s',
    (authority) => {
      const uri = `pubky://${authority}/pub/pubky.app/posts/${postId}`;
      expect(buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS })).toBeNull();
    },
  );

  it.each([undefined, null, 42])('parsePubkyUri returns null for the non-string value %s', (uri) => {
    expect(parsePubkyUri(uri)).toBeNull();
  });

  it('round-trip is stable', () => {
    const c1 = buildCompositeId({ pubky: author, id: postId });
    const parts = parseCompositeId(c1);
    const c2 = buildCompositeId(parts);
    expect(c2).toBe(c1);
  });
});

describe('buildCompositeIdFromPubkyUri across epochs', () => {
  const owner = fakeOwner(1);
  const postId = '0032PARTQP4G0';
  const hash = 'AKSZ57W2RFKHV1EHK007FQQ8TW';

  it.each([
    ['a 0.x post', `pubky://${owner}/pub/pubky.app/posts/${postId}`],
    ['a v1 post reference', `pubky://${owner}/pub/social/v1/posts/${postId}`],
    ['a v1 post version', `pubky://${owner}/pub/social/v1/posts/${postId}/0032PARTQP4G1.json`],
    ['a v1 post version with a slug', `pubky://${owner}/pub/social/v1/posts/${postId}/0032PARTQP4G1-hello.json`],
  ])('keys %s by the post id', (_, uri) => {
    expect(buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS })).toBe(
      `${owner}${COMPOSITE_ID_DELIMITER}${postId}`,
    );
  });

  it.each([
    ['a v1 media file', `pubky://${owner}/pub/social/v1/files/${hash}.png`, hash],
    ['a v1 media file with a longer extension', `pubky://${owner}/pub/social/v1/files/${hash}.webp`, hash],
    ['a v1 media file without an extension', `pubky://${owner}/pub/social/v1/files/${hash}`, hash],
    ['a 0.x file', `pubky://${owner}/pub/pubky.app/files/0035S78QPP4S0`, '0035S78QPP4S0'],
  ])('keys %s by its id without the extension', (_, uri, id) => {
    expect(buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.FILES })).toBe(
      `${owner}${COMPOSITE_ID_DELIMITER}${id}`,
    );
  });

  it('is null for a file URI whose filename is only an extension', () => {
    expect(
      buildCompositeIdFromPubkyUri({
        uri: `pubky://${owner}/pub/social/v1/files/.png`,
        domain: CompositeIdDomain.FILES,
      }),
    ).toBeNull();
  });
});

describe('isV1MediaUri and mediaFilenameFromUri', () => {
  const owner = fakeOwner(1);
  const filename = 'AKSZ57W2RFKHV1EHK007FQQ8TW.png';

  it('recognizes a v1 public media file and reads its filename', () => {
    const uri = `pubky://${owner}/pub/social/v1/files/${filename}`;
    expect(isV1MediaUri(uri)).toBe(true);
    expect(mediaFilenameFromUri(uri)).toBe(filename);
  });

  it.each([
    ['a 0.x file', `pubky://${owner}/pub/pubky.app/files/0035S78QPP4S0`],
    ['a 0.x blob', `pubky://${owner}/pub/pubky.app/blobs/0035S78QPP4S0`],
    ['a private v1 file', `pubky://${owner}/priv/social/v1/files/${filename}`],
    ['a v1 post', `pubky://${owner}/pub/social/v1/posts/0032PARTQP4G0`],
    ['a v1 file path without a filename', `pubky://${owner}/pub/social/v1/files/`],
    ['a URI with a key the data model refuses', `pubky://${'a'.repeat(52)}/pub/social/v1/files/${filename}`],
    ['an http URL', `https://example.com/pub/social/v1/files/${filename}`],
    ['garbage', 'not a uri'],
  ])('is false and null for %s', (_, uri) => {
    expect(isV1MediaUri(uri)).toBe(false);
    expect(mediaFilenameFromUri(uri)).toBeNull();
  });

  it.each([undefined, null, 42])('is false and null for the non-string value %s', (uri) => {
    expect(isV1MediaUri(uri)).toBe(false);
    expect(mediaFilenameFromUri(uri)).toBeNull();
  });
});
