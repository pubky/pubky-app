import * as Core from '@/core';

const FEED_TABLES = [Core.FeedModel.table];

export class LocalFeedService {
  private constructor() {}

  /**
   * Persist a feed to local storage.
   * The ID is always a HashId-derived string provided upfront, so this is a plain upsert.
   */
  static async createOrUpdate(feed: Core.FeedModelSchema): Promise<Core.FeedModelSchema> {
    return await Core.db.transaction('rw', FEED_TABLES, async () => {
      await Core.FeedModel.upsert(feed);
      return Core.FeedModel.findByIdOrThrow(feed.id);
    });
  }

  /**
   * Persist multiple feeds in a single transaction.
   * Uses bulkPut semantics: inserts new feeds and replaces existing ones by ID.
   */
  static async createOrUpdateMany(feeds: Core.FeedModelSchema[]): Promise<Core.FeedModelSchema[]> {
    return await Core.db.transaction('rw', FEED_TABLES, async () => {
      await Core.FeedModel.bulkSave(feeds);
      return feeds;
    });
  }

  static async delete({ feedId }: Core.TFeedIdParam) {
    await Core.db.transaction('rw', FEED_TABLES, async () => {
      await Core.FeedModel.deleteById(feedId);
    });
  }

  /**
   * Read a feed by ID. Throws RECORD_NOT_FOUND if feed doesn't exist.
   */
  static async read({ feedId }: Core.TFeedIdParam): Promise<Core.FeedModelSchema> {
    return Core.FeedModel.findByIdOrThrow(feedId);
  }

  static async readAll(): Promise<Core.FeedModelSchema[]> {
    return Core.FeedModel.findAllSorted();
  }
}
