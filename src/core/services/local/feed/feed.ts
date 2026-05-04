import type { TFeedIdParam } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { FeedModel } from '@/models/feed/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
const FEED_TABLES = [FeedModel.table];

export class LocalFeedService {
  private constructor() {}

  /**
   * Persist a feed to local storage.
   * The ID is always a HashId-derived string provided upfront, so this is a plain upsert.
   */
  static async createOrUpdate(feed: FeedModelSchema): Promise<FeedModelSchema> {
    return await db.transaction('rw', FEED_TABLES, async () => {
      await FeedModel.upsert(feed);
      return FeedModel.findByIdOrThrow(feed.id);
    });
  }

  /**
   * Persist multiple feeds in a single transaction.
   * Uses bulkPut semantics: inserts new feeds and replaces existing ones by ID.
   */
  static async createOrUpdateMany(feeds: FeedModelSchema[]): Promise<FeedModelSchema[]> {
    return await db.transaction('rw', FEED_TABLES, async () => {
      await FeedModel.bulkSave(feeds);
      return feeds;
    });
  }

  static async delete({ feedId }: TFeedIdParam) {
    await db.transaction('rw', FEED_TABLES, async () => {
      await FeedModel.deleteById(feedId);
    });
  }

  /**
   * Read a feed by ID. Throws RECORD_NOT_FOUND if feed doesn't exist.
   */
  static async read({ feedId }: TFeedIdParam): Promise<FeedModelSchema> {
    return FeedModel.findByIdOrThrow(feedId);
  }

  static async readAll(): Promise<FeedModelSchema[]> {
    return FeedModel.findAllSorted();
  }
}
