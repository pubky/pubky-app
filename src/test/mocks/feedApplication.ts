import type { FeedApplication } from '@/application/feed/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { VRT_FEED_NAVIGATION } from '../fixtures/feed/feedNavigation';

type FeedApplicationShape = Pick<typeof FeedApplication, 'getList' | 'get' | 'fetchFeeds'>;

/**
 * Mock `FeedApplication` that returns the VRT feed-navigation fixtures.
 * Use with `vi.mock('@/application/feed/feed', () => ({ FeedApplication: mockFeedApplication }))`
 * — the controller layer reads `getList()` to populate the FeedNavigation tab strip.
 *
 * Mutating methods are deliberately omitted: the VRT renders without interaction so
 * commit/persist paths must never be reached. Reaching them in a future test means
 * the fixture surface is too narrow and should be expanded explicitly.
 */
export const mockFeedApplication: FeedApplicationShape = {
  getList: async (): Promise<FeedModelSchema[]> => [...VRT_FEED_NAVIGATION],
  get: async ({ feedId }: { feedId: string }): Promise<FeedModelSchema> => {
    const feed = VRT_FEED_NAVIGATION.find((entry) => entry.id === feedId);
    if (!feed) {
      throw new Error(`mockFeedApplication.get: no fixture feed with id "${feedId}"`);
    }
    return feed;
  },
  fetchFeeds: async (): Promise<FeedModelSchema[]> => [...VRT_FEED_NAVIGATION],
};
