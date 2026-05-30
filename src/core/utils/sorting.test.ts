import { beforeEach, describe, expect, it } from 'vitest';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { sortPostIdsByTimestamp } from './sorting';

describe('sortPostIdsByTimestamp', () => {
  const DEFAULT_AUTHOR = 'test-user';
  const BASE_TIMESTAMP = 1000000;

  const createPostDetails = (postId: string, timestamp: number): PostDetailsModelSchema => ({
    id: buildCompositeId({ pubky: DEFAULT_AUTHOR, id: postId }),
    content: `Content for ${postId}`,
    indexed_at: timestamp,
    kind: 'short',
    uri: `pubky://test/${postId}`,
    attachments: null,
  });

  const persistPostDetails = async (postId: string, timestamp: number) => {
    const details = createPostDetails(postId, timestamp);
    await PostDetailsModel.upsert(details);
    return details.id;
  };

  beforeEach(async () => {
    // Clear post details table before each test
    await PostDetailsModel.clear();
  });

  it('should return empty array for empty input', async () => {
    const result = await sortPostIdsByTimestamp([]);
    expect(result).toEqual([]);
  });

  it('should sort posts by timestamp in descending order (newest first)', async () => {
    // Create posts with different timestamps
    const post1Id = await persistPostDetails('post1', BASE_TIMESTAMP); // oldest
    const post2Id = await persistPostDetails('post2', BASE_TIMESTAMP + 2000); // newest
    const post3Id = await persistPostDetails('post3', BASE_TIMESTAMP + 1000); // middle

    const result = await sortPostIdsByTimestamp([post1Id, post2Id, post3Id]);

    // Should be sorted descending by timestamp
    expect(result).toEqual([post2Id, post3Id, post1Id]);
  });

  it('should maintain order when posts have same timestamp', async () => {
    const sameTimestamp = BASE_TIMESTAMP;
    const post1Id = await persistPostDetails('post1', sameTimestamp);
    const post2Id = await persistPostDetails('post2', sameTimestamp);
    const post3Id = await persistPostDetails('post3', sameTimestamp);

    const result = await sortPostIdsByTimestamp([post1Id, post2Id, post3Id]);

    // When timestamps are equal, JavaScript's sort is stable, so order is preserved
    expect(result).toEqual([post1Id, post2Id, post3Id]);
  });

  describe('GitHub Issue #1133 - Missing post details causes incorrect ordering', () => {
    /**
     * Bug: When navigating away from and back to the feed, older posts can appear
     * at the top because some posts are missing their details in IndexedDB.
     *
     * Root cause: Posts without cached details get timestamp 0, which causes them
     * to sort to the end. If a newer post is missing details, it will appear at
     * the bottom, making older posts appear at the top.
     *
     * The fix should preserve the input order for posts without details, or use
     * a fallback mechanism to maintain proper ordering.
     */
    it('should preserve relative order when a post is missing details', async () => {
      // Scenario:
      // - post1 is newest (timestamp 3000)
      // - post2 has no cached details (missing from IndexedDB)
      // - post3 is oldest (timestamp 1000)
      //
      // Input order represents the correct chronological order from API/cache
      const post1Id = await persistPostDetails('post1', BASE_TIMESTAMP + 2000); // newest
      const post2Id = buildCompositeId({ pubky: DEFAULT_AUTHOR, id: 'post2' }); // NOT persisted
      const post3Id = await persistPostDetails('post3', BASE_TIMESTAMP); // oldest

      // Input is already correctly sorted (newest first)
      const inputOrder = [post1Id, post2Id, post3Id];
      const result = await sortPostIdsByTimestamp(inputOrder);

      // Current behavior (BUG): post2 gets timestamp 0, sorts to end
      // Actual output: [post1Id, post3Id, post2Id]
      //
      // Expected behavior: post2 should maintain its position relative to others
      // Since input is already sorted, post2 should stay between post1 and post3
      expect(result).toEqual([post1Id, post2Id, post3Id]);
    });

    it('should preserve order when multiple posts are missing details', async () => {
      // More complex scenario where multiple posts are missing details
      const newestId = await persistPostDetails('newest', BASE_TIMESTAMP + 4000);
      const newerId = buildCompositeId({ pubky: DEFAULT_AUTHOR, id: 'newer' }); // missing
      const middleId = await persistPostDetails('middle', BASE_TIMESTAMP + 2000);
      const olderId = buildCompositeId({ pubky: DEFAULT_AUTHOR, id: 'older' }); // missing
      const oldestId = await persistPostDetails('oldest', BASE_TIMESTAMP);

      const inputOrder = [newestId, newerId, middleId, olderId, oldestId];
      const result = await sortPostIdsByTimestamp(inputOrder);

      // Missing posts should maintain their relative positions
      expect(result).toEqual([newestId, newerId, middleId, olderId, oldestId]);
    });

    it('should correctly sort posts when all have details', async () => {
      // When all posts have details, sorting should work correctly
      const aId = await persistPostDetails('a', BASE_TIMESTAMP + 2000);
      const bId = await persistPostDetails('b', BASE_TIMESTAMP + 4000); // newest
      const cId = await persistPostDetails('c', BASE_TIMESTAMP); // oldest
      const dId = await persistPostDetails('d', BASE_TIMESTAMP + 3000);
      const eId = await persistPostDetails('e', BASE_TIMESTAMP + 1000);

      const result = await sortPostIdsByTimestamp([aId, bId, cId, dId, eId]);

      // Should sort descending by timestamp
      expect(result).toEqual([bId, dId, aId, eId, cId]);
    });

    it('should demonstrate the bug: missing newest post moves to end', async () => {
      // This test demonstrates the current buggy behavior
      // where a missing post gets sorted to the end because it has timestamp 0
      const newest = buildCompositeId({ pubky: DEFAULT_AUTHOR, id: 'newest' }); // missing - should be first!
      const middle = await persistPostDetails('middle', BASE_TIMESTAMP + 1000);
      const oldest = await persistPostDetails('oldest', BASE_TIMESTAMP);

      // Input: correct order (newest first)
      const inputOrder = [newest, middle, oldest];
      const result = await sortPostIdsByTimestamp(inputOrder);

      // BUG: The missing "newest" post sorts to the end because its timestamp is 0
      // This makes it appear that "oldest" posts moved up in the feed
      //
      // CURRENT (BUGGY) BEHAVIOR: [middle, oldest, newest]
      // EXPECTED BEHAVIOR: [newest, middle, oldest]
      //
      // We test for the EXPECTED behavior - this test should FAIL until the bug is fixed
      expect(result).toEqual([newest, middle, oldest]);
    });
  });
});
