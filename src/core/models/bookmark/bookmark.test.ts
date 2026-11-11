import { buildUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId, parseCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { asInvalid } from '@/test-utils/type-assertions';

const author = fakeOwner(2) as Pubky;
/** Thirteen-character Crockford post ids, distinct per index. */
const postIdAt = (index: number) => `0035V9A20W${String(index).padStart(2, '0')}0`;
const postId = (index: number) => buildCompositeId({ pubky: author, id: postIdAt(index) });
const details = (id: string, kind: string): PostDetailsModelSchema => ({
  id,
  content: kind === 'collection' ? JSON.stringify({ title: 'Collection', items: [] }) : 'a note',
  kind,
  indexed_at: 1,
  attachments: null,
  uri: buildUri(author, 'post', parseCompositeId(id).id),
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

    it('wraps a failed transaction in a database error', async () => {
      const closed = new Error('closed');
      vi.spyOn(db, 'transaction').mockRejectedValue(closed);

      const failure = await BookmarkModel.findAllWithPostDetails().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AppError);
      expect(failure).toMatchObject({
        code: DatabaseErrorCode.QUERY_FAILED,
        operation: 'findAllWithPostDetails',
        cause: closed,
      });
    });

    it('rethrows the details read failure as reported, without wrapping it again', async () => {
      await BookmarkModel.table.put({ id: postId(1), created_at: 100 });
      const closed = new Error('closed');
      vi.spyOn(PostDetailsModel.table, 'bulkGet').mockRejectedValue(closed);

      const failure = await BookmarkModel.findAllWithPostDetails().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(AppError);
      // `findByIdsPreserveOrder`'s own report, its cause the raw failure: captured once, context kept.
      expect(failure).toMatchObject({
        code: DatabaseErrorCode.QUERY_FAILED,
        operation: 'findByIdsPreserveOrder',
        cause: closed,
      });
    });
  });
});
