import { describe, expect, it, vi } from 'vitest';
import { COMPOSITE_ID_DELIMITER } from '@/models/models.defaults';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeId, buildCompositeIdFromPubkyUri, parseCompositeId, parsePubkyUri } from '@/models/models.utils';

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
