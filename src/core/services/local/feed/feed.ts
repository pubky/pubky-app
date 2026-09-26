import type { TFeedIdParam } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { FeedModel } from '@/models/feed/feed';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { TFeedRollbackParams } from './feed.types';

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
   * Undo a local write that failed to sync. Restores `priorFeed` (or deletes the row when the
   * write created it) only while the row still carries the write's own `updated_at`: a newer
   * write to the same id (another tab, a bootstrap fetch landing mid-sync) is left alone, so a
   * successful edit is never reverted. Returns whether the row was changed.
   */
  static async rollback({ feedId, expectedUpdatedAt, priorFeed }: TFeedRollbackParams): Promise<boolean> {
    return await db.transaction('rw', FEED_TABLES, async () => {
      const current = await FeedModel.findById(feedId);
      if (!current || current.updated_at !== expectedUpdatedAt) return false;
      if (priorFeed) {
        await FeedModel.upsert(priorFeed);
      } else {
        await FeedModel.deleteById(feedId);
      }
      return true;
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
