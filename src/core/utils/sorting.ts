import { PostDetailsModel } from '@/models/post/details/postDetails';
/**
 * Sort post IDs by their timestamp (indexed_at) in descending order (most recent first)
 *
 * When a post is missing its details in IndexedDB (cache miss), its timestamp is inferred
 * from surrounding posts to preserve relative ordering. This prevents posts from being
 * incorrectly repositioned when navigating away from and back to the feed.
 *
 * @param postIds - Array of post IDs to sort
 * @returns Sorted array of post IDs (most recent first)
 */
export async function sortPostIdsByTimestamp(postIds: string[]): Promise<string[]> {
  if (postIds.length === 0) return [];

  const posts = await PostDetailsModel.findByIdsPreserveOrder(postIds);

  // Build array with raw timestamps (null for missing posts)
  const timestampedPosts = postIds.map((postId, index) => ({
    postId,
    timestamp: posts[index]?.indexed_at ?? null,
    originalIndex: index,
  }));

  // Infer timestamps for posts with missing details
  // Use interpolation based on surrounding posts to maintain relative order
  for (let i = 0; i < timestampedPosts.length; i++) {
    if (timestampedPosts[i].timestamp !== null) continue;

    // Find nearest post with timestamp before this one
    let prevTimestamp: number | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (timestampedPosts[j].timestamp !== null) {
        prevTimestamp = timestampedPosts[j].timestamp;
        break;
      }
    }

    // Find nearest post with timestamp after this one
    let nextTimestamp: number | null = null;
    for (let j = i + 1; j < timestampedPosts.length; j++) {
      if (timestampedPosts[j].timestamp !== null) {
        nextTimestamp = timestampedPosts[j].timestamp;
        break;
      }
    }

    // Infer timestamp based on available surrounding timestamps
    // IMPORTANT: This algorithm assumes input is pre-sorted in descending order (newest first)
    // If input order doesn't match timestamp order, interpolation will be incorrect
    // - prevTimestamp should be >= the inferred timestamp
    // - nextTimestamp should be <= the inferred timestamp
    if (prevTimestamp !== null && nextTimestamp !== null) {
      // Between two known timestamps: use midpoint
      timestampedPosts[i].timestamp = Math.floor((prevTimestamp + nextTimestamp) / 2);
    } else if (prevTimestamp !== null) {
      // Only previous known: place slightly after (smaller timestamp since descending)
      timestampedPosts[i].timestamp = prevTimestamp - 1;
    } else if (nextTimestamp !== null) {
      // Only next known: place slightly before (larger timestamp since descending)
      timestampedPosts[i].timestamp = nextTimestamp + 1;
    } else {
      // No known timestamps nearby: preserve original position by using negative index
      // This ensures posts without any context sort in their original relative order
      timestampedPosts[i].timestamp = -timestampedPosts[i].originalIndex;
    }
  }

  return timestampedPosts.sort((a, b) => (b.timestamp as number) - (a.timestamp as number)).map((item) => item.postId);
}
