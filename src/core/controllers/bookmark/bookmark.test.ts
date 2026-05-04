import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TBookmarkEventParams } from './bookmark.types';
import { HttpMethod } from '@/libs/http/http.types';
import { BookmarkApplication } from '@/application/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
// Mock pubky-app-specs
vi.mock('pubky-app-specs', () => ({
  PubkySpecsBuilder: class {
    constructor(public pubky: string) {}
    createBookmark(uri: string) {
      return {
        bookmark: { toJson: () => ({ uri }), free: () => {} },
        meta: { url: `pubky://${this.pubky}/pub/pubky.app/bookmarks/${Date.now()}` },
        free: () => {},
      };
    }
  },
  postUriBuilder: (authorId: string, postId: string) => `pubky://${authorId}/pub/pubky.app/posts/${postId}`,
}));

// Test data
const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
  postId: 'abc123xyz',
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
  let BookmarkController: typeof import('./bookmark').BookmarkController;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock BookmarkApplication
    vi.spyOn(BookmarkApplication, 'persist').mockResolvedValue(undefined);

    // Import BookmarkController
    const bookmarkModule = await import('./bookmark');
    BookmarkController = bookmarkModule.BookmarkController;
  });

  describe('commitCreate', () => {
    it('should call BookmarkApplication.persist with correct parameters', async () => {
      const persistSpy = vi.spyOn(BookmarkApplication, 'persist');

      await BookmarkController.commitCreate(createBookmarkParams());

      expect(persistSpy).toHaveBeenCalledWith(HttpMethod.PUT, {
        postId: testData.compositePostId,
        bookmarkUrl: expect.stringContaining('pubky://'),
        bookmarkJson: expect.objectContaining({ uri: expect.any(String) }),
      });
    });
  });

  describe('commitDelete', () => {
    it('should call BookmarkApplication.persist with correct parameters', async () => {
      const persistSpy = vi.spyOn(BookmarkApplication, 'persist');

      await BookmarkController.commitDelete(createBookmarkParams());

      expect(persistSpy).toHaveBeenCalledWith(HttpMethod.DELETE, {
        postId: testData.compositePostId,
        bookmarkUrl: expect.stringContaining('pubky://'),
      });
    });
  });
});
