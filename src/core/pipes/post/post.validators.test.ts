import { buildPost } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { PostController } from '@/controllers/post/post';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { asOpaque } from '@/test-utils/type-assertions';
import { PostValidators } from './post.validators';

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getDetails: vi.fn(),
  },
}));

describe('PostValidators.validatePostId', () => {
  const AUTHOR = fakeOwner(1);
  const POST_ID = `${AUTHOR}:0035QZPT4QG00`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the v1 reference of a live parent, never the cached row uri (which Nexus may spell the 0.x way)', async () => {
    vi.mocked(PostController.getDetails).mockResolvedValue(
      asOpaque<EnrichedPostDetails>({
        id: POST_ID,
        content: 'Hello',
        uri: `pubky://${AUTHOR}/pub/pubky.app/posts/0035QZPT4QG00`,
        kind: 'short',
        indexed_at: 0,
        attachments: null,
      }),
    );

    const uri = await PostValidators.validatePostId({ postId: POST_ID, message: 'Parent post' });

    expect(uri).toBe(`pubky://${AUTHOR}/pub/social/v1/posts/0035QZPT4QG00`);
  });

  it('throws NOT_FOUND when the parent post is missing from the local DB', async () => {
    vi.mocked(PostController.getDetails).mockResolvedValue(null);

    await expect(PostValidators.validatePostId({ postId: POST_ID, message: 'Parent post' })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('throws NOT_FOUND when the parent post is tombstoned (content === [DELETED])', async () => {
    // Regression coverage for the tombstone refactor: pre-tombstone the
    // hard-delete branch removed the row entirely, so `!parentPost` caught
    // this. Now the row sticks around as a tombstone and we need an explicit
    // content check or reply / repost validation would silently pass against
    // a deleted parent.
    vi.mocked(PostController.getDetails).mockResolvedValue(
      asOpaque<EnrichedPostDetails>({
        id: POST_ID,
        content: '[DELETED]',
        uri: `pubky://${AUTHOR}/pub/social/v1/posts/0035QZPT4QG00`,
        kind: 'short',
        indexed_at: 0,
        attachments: null,
      }),
    );

    try {
      await PostValidators.validatePostId({ postId: POST_ID, message: 'Parent post' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ClientErrorCode.NOT_FOUND);
    }
  });

  it('throws NOT_FOUND when the parent post is a Nexus tombstone (empty content, flag set)', async () => {
    // The current Nexus shape: content cleared, `deleted: true`. A content-only
    // check would let replies / reposts validate against a deleted parent.
    vi.mocked(PostController.getDetails).mockResolvedValue(
      asOpaque<EnrichedPostDetails>({
        id: POST_ID,
        content: '',
        deleted: true,
        uri: `pubky://${AUTHOR}/pub/social/v1/posts/0035QZPT4QG00`,
        kind: 'short',
        indexed_at: 0,
        attachments: null,
      }),
    );

    await expect(PostValidators.validatePostId({ postId: POST_ID, message: 'Parent post' })).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe('PostValidators.validateExternalParentUri', () => {
  const ACCEPTED = [
    'https://stacker.news/items/123',
    'http://example.com/a?b=1',
    'https://user@example.com:8080/x',
    'https://[::1]/x',
    'isbn:9780131103627',
    'doi:10.1000/182',
    'osm:node/123',
    'geo:47.37,8.54',
    'urn:isbn:9780131103627',
    `https://example.com/${'a'.repeat(1024 - 'https://example.com/'.length)}`,
    'https://example.com/\u{1F600}',
  ];

  it.each(ACCEPTED)('returns %s as written, and the spec accepts it as a parent', (uri) => {
    expect(PostValidators.validateExternalParentUri(uri)).toBe(uri);
    expect(() =>
      buildPost(fakeOwner(1), { kind: 'note', content: 'hi', parent: uri, embed: null, attachments: [], lock: null }),
    ).not.toThrow();
  });

  it.each([
    ['', 'empty'],
    [' https://example.com', 'padded'],
    ['https://example.com/a b', 'a space inside'],
    ['https://example.com/a\u00a0b', 'a no-break space inside'],
    ['https://example.com/\u0007', 'a control character'],
    ['not a uri', 'not a URI'],
    ['javascript:alert(1)', 'a script'],
    ['data:text/plain,hi', 'a data URI'],
    ['pubky://abc/pub/social/v1/posts/0035QZPT4QG00', 'a Pubky object (posts are replied to by id)'],
    ['HTTPS://example.com', 'an upper-case web scheme (not canonical)'],
    ['http:example.com', 'a web link without //'],
    ['ISBN:9780131103627', 'an upper-case scheme (not canonical)'],
    ['https://', 'a web link without a host'],
    ['https://user@:80/x', 'a web link with an empty host'],
    ['isbn:', 'a scheme naming nothing'],
    [`https://example.com/${'a'.repeat(1025 - 'https://example.com/'.length)}`, 'longer than the spec allows'],
  ])('refuses %s (%s)', (uri) => {
    expect(() => PostValidators.validateExternalParentUri(uri)).toThrow(AppError);
  });
});
