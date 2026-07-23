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
  const POST_ID = 'author:post-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the post uri when the parent exists with live content', async () => {
    vi.mocked(PostController.getDetails).mockResolvedValue(
      asOpaque<EnrichedPostDetails>({
        id: POST_ID,
        content: 'Hello',
        uri: 'pubky://author/pub/pubky.app/posts/post-123',
        kind: 'short',
        indexed_at: 0,
        attachments: null,
      }),
    );

    const uri = await PostValidators.validatePostId({ postId: POST_ID, message: 'Parent post' });

    expect(uri).toBe('pubky://author/pub/pubky.app/posts/post-123');
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
        uri: 'pubky://author/pub/pubky.app/posts/post-123',
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
});
