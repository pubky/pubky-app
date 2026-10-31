import { buildUri, decodeObject, parseUri } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkApplication } from '@/application/bookmark/bookmark';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { BookmarkController } from './bookmark';
import type { TBookmarkEventParams } from './bookmark.types';

// Test data
const testData = {
  userPubky: fakeOwner(1) as Pubky,
  authorPubky: fakeOwner(2) as Pubky,
  postId: '0035V9A20WSE4',
  get compositePostId() {
    return buildCompositeId({ pubky: this.authorPubky, id: this.postId });
  },
};

// Helper functions
const createBookmarkParams = (): TBookmarkEventParams => ({
  userId: testData.userPubky,
  postId: testData.compositePostId,
});

describe('BookmarkController', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(BookmarkApplication, 'persist').mockResolvedValue(undefined);
  });

  describe('getAll', () => {
    it('delegates to BookmarkApplication.getAll and returns its result', async () => {
      const sortedIds = ['authorA:p1', 'authorB:p2'];
      const getAllSpy = vi.spyOn(BookmarkApplication, 'getAll').mockResolvedValue(sortedIds);

      const result = await BookmarkController.getAll();

      expect(getAllSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(sortedIds);
    });

    it('propagates errors from the application layer', async () => {
      vi.spyOn(BookmarkApplication, 'getAll').mockRejectedValue(new Error('boom'));

      await expect(BookmarkController.getAll()).rejects.toThrow('boom');
    });
  });

  describe('getCount', () => {
    it('delegates to BookmarkApplication.getCount', async () => {
      vi.spyOn(BookmarkApplication, 'getCount').mockResolvedValue(7);

      await expect(BookmarkController.getCount()).resolves.toBe(7);
    });
  });

  describe('commitCreate', () => {
    it('PUTs the private v1 bookmark of the post', async () => {
      const persistSpy = vi.mocked(BookmarkApplication.persist);

      await BookmarkController.commitCreate(createBookmarkParams());

      const [method, input] = persistSpy.mock.calls[0];
      expect(method).toBe(HttpMethod.PUT);
      expect(input.postId).toBe(testData.compositePostId);
      expect(input.bookmarkUrl).toContain(`pubky://${testData.userPubky}/priv/social/v1/bookmarks/`);
      const parsed = parseUri(input.bookmarkUrl);
      expect(parsed.kind === 'bookmark' && parsed.target).toBe(buildUri(testData.authorPubky, 'post', testData.postId));
      expect(decodeObject(input.bookmarkUrl, input.bookmarkBody!, 'bookmark').target).toBeNull();
    });

    it('refuses a post id the data model cannot reference, before any write', async () => {
      const error = await BookmarkController.commitCreate({
        userId: testData.userPubky,
        postId: `${testData.authorPubky}:abc123xyz`,
      }).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ValidationErrorCode.INVALID_INPUT);
      expect(BookmarkApplication.persist).not.toHaveBeenCalled();
    });
  });

  describe('commitDelete', () => {
    it('deletes the file the create wrote', async () => {
      const persistSpy = vi.mocked(BookmarkApplication.persist);

      await BookmarkController.commitCreate(createBookmarkParams());
      await BookmarkController.commitDelete(createBookmarkParams());

      const created = persistSpy.mock.calls[0][1];
      expect(persistSpy).toHaveBeenLastCalledWith(HttpMethod.DELETE, {
        postId: testData.compositePostId,
        bookmarkUrl: created.bookmarkUrl,
      });
    });
  });
});
