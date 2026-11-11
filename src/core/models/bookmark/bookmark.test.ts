import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { asInvalid } from '@/test-utils/type-assertions';

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy';
const postId = (index: number) => `${AUTHOR}:p${String(index).padStart(2, '0')}`;
const details = (id: string, kind: string): PostDetailsModelSchema => ({
  id,
  content: kind === 'collection' ? JSON.stringify({ title: 'Collection', items: [] }) : 'a note',
  kind,
  indexed_at: 1,
  attachments: null,
  uri: `pubky://${AUTHOR}/pub/social/v1/posts/${id.split(':')[1]}`,
});

describe('BookmarkModel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    await db.initialize();
    await db.transaction('rw', [BookmarkModel.table, PostDetailsModel.table], async () => {
      await BookmarkModel.table.clear();
      await PostDetailsModel.table.clear();
    });
  });

  describe('findAllWithPostDetails', () => {
    it('returns every bookmark newest first with the cached details of its post, undefined while not cached', async () => {
      await BookmarkModel.table.bulkPut([
        { id: postId(1), created_at: 100 },
        { id: postId(2), created_at: 300 },
        { id: postId(3), created_at: 200 },
      ]);
      await PostDetailsModel.table.bulkPut([details(postId(1), 'short'), details(postId(2), 'collection')]);

      const bookmarked = await BookmarkModel.findAllWithPostDetails();

      expect(bookmarked.map(({ id, created_at }) => ({ id, created_at }))).toEqual([
        { id: postId(2), created_at: 300 },
        { id: postId(3), created_at: 200 },
        { id: postId(1), created_at: 100 },
      ]);
      expect(bookmarked.map(({ details: cached }) => cached?.kind)).toEqual(['collection', undefined, 'short']);
    });

    it('treats a row without a numeric created_at as the oldest, like findAllSorted', async () => {
      await BookmarkModel.table.bulkPut([
        { id: postId(1), created_at: 100 },
        { id: postId(2), created_at: asInvalid<number>(undefined) },
      ]);

      expect((await BookmarkModel.findAllWithPostDetails()).map(({ id }) => id)).toEqual([postId(1), postId(2)]);
      expect((await BookmarkModel.findAllSorted()).map(({ id }) => id)).toEqual([postId(1), postId(2)]);
    });

    it('is empty without bookmarks', async () => {
      await expect(BookmarkModel.findAllWithPostDetails()).resolves.toEqual([]);
    });

    it('wraps a failed read in a database error', async () => {
      vi.spyOn(db, 'transaction').mockRejectedValue(new Error('closed'));

      const failure = await BookmarkModel.findAllWithPostDetails().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AppError);
      expect((failure as AppError).code).toBe(DatabaseErrorCode.QUERY_FAILED);
    });
  });
});
