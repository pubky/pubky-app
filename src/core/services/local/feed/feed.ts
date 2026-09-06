import type { TFeedIdParam } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { FeedModel } from '@/models/feed/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';

const FEED_TABLES = [FeedModel.table];

export class LocalFeedService {
  private constructor() {}

  private static normalize(feed: FeedModelSchema): FeedModelSchema {
    return { ...feed, domain_tags: feed.domain_tags ?? [] };
  }

  /**
   * Persist a feed to local storage.
   * The ID is always a HashId-derived string provided upfront, so this is a plain upsert.
   */
  static async createOrUpdate(feed: FeedModelSchema): Promise<FeedModelSchema> {
    return await db.transaction('rw', FEED_TABLES, async () => {
      await FeedModel.upsert(feed);
      return this.normalize(await FeedModel.findByIdOrThrow(feed.id));
    });
  }

  /**
   * Persist multiple feeds in a single transaction.
   * Uses bulkPut semantics: inserts new feeds and replaces existing ones by ID.
   */
  static async createOrUpdateMany(feeds: FeedModelSchema[]): Promise<FeedModelSchema[]> {
    return await db.transaction('rw', FEED_TABLES, async () => {
      await FeedModel.bulkSave(feeds);
      return feeds.map((feed) => this.normalize(feed));
    });
  }

  static async delete({ feedId }: TFeedIdParam) {
    await db.transaction('rw', FEED_TABLES, async () => {
      await FeedModel.deleteById(feedId);
    });
  }

  /**
   * Read a feed by ID. Returns `null` when the feed does not exist locally.
   *
   * History: this used to throw RECORD_NOT_FOUND ("Feed not found",
   * Sentry PUBKY-APP-7A). The two production callers (`useCustomFeed`,
   * stream coordinator resolution) both handle a missing feed as a normal
   * state — a stale `activeFeedId` pointing at a deleted feed — so a throw
   * produced pure Sentry noise and a caught-error path that returned
   * `undefined` anyway. `find()`/`get()` semantics are the correct contract.
   */
  static async read({ feedId }: TFeedIdParam): Promise<FeedModelSchema | null> {
    const record = await FeedModel.findById(feedId);
    return record ? this.normalize(record) : null;
  }

  static async readAll(): Promise<FeedModelSchema[]> {
    return (await FeedModel.findAllSorted()).map((feed) => this.normalize(feed));
  }
}
