import { baseUriBuilder, feedUriBuilder } from 'pubky-app-specs';
import * as Core from '@/core';
import type {
  FeedDeleteParams,
  FeedPutParams,
  PersistAndSyncParams,
  HomeserverFeedJson,
  RemoteFeedParams,
} from './feed.types';
import { Err, ErrorService, HttpMethod, Logger, ValidationErrorCode } from '@/libs';

export class FeedApplication {
  private constructor() {}
  private static readonly FETCH_FEEDS_BATCH_SIZE = 10;

  static async getList(): Promise<Core.FeedModelSchema[]> {
    return Core.LocalFeedService.readAll();
  }

  static async get(params: Core.TFeedIdParam): Promise<Core.FeedModelSchema> {
    return Core.LocalFeedService.read(params);
  }

  static async persist({ userId, params }: FeedPutParams): Promise<Core.FeedModelSchema> {
    const { feed: normalizedFeed, existingId } = params as Core.TFeedPersistCreateParams;
    const { feed, meta } = normalizedFeed;
    const newId = meta.id;
    const idChanged = existingId != null && existingId !== newId;

    const now = Date.now();
    const createdAt = existingId
      ? (await Core.LocalFeedService.read({ feedId: existingId }).catch(() => ({ created_at: now }))).created_at
      : now;

    const { tags, reach, sort, content, layout } = feed.feed;

    const feedSchema: Core.FeedModelSchema = {
      id: newId,
      name: feed.name,
      tags: tags ?? [],
      reach,
      sort,
      content: content ?? null,
      layout,
      created_at: createdAt,
      updated_at: now,
    };

    // When config fields (tags, reach, layout, sort, content) change, the HashId-derived
    // ID changes too. The old resource must be removed before creating the new one.
    if (idChanged) {
      let persistedNewFeed: Core.FeedModelSchema;

      try {
        persistedNewFeed = await this.commit({ userId, feedSchema, normalizedFeed });
      } catch (error) {
        // Compensation: best-effort rollback of the new local record if create/sync fails.
        await Core.LocalFeedService.delete({ feedId: newId }).catch((rollbackError) => {
          Logger.warn('Failed to rollback new feed after update migration failure', {
            oldFeedId: existingId,
            newFeedId: newId,
            rollbackError,
          });
        });
        throw error;
      }

      // Best-effort cleanup of old feed. Keep the new feed as source of truth if cleanup fails.
      await this.commitDelete({ userId, params: { feedId: existingId } }).catch((cleanupError) => {
        Logger.warn('Failed to cleanup old feed after successful migration to new feed ID', {
          oldFeedId: existingId,
          newFeedId: newId,
          cleanupError,
        });
      });

      return persistedNewFeed;
    }

    return this.commit({ userId, feedSchema, normalizedFeed });
  }

  static async commitDelete({ userId, params }: FeedDeleteParams): Promise<void> {
    const feedId = (params as Core.TFeedPersistDeleteParams).feedId;
    const feedUrl = feedUriBuilder(userId, feedId);

    const feed = await Core.LocalFeedService.read({ feedId }).catch(() => null);
    const streamId = feed ? Core.buildFeedStreamId(feed) : null;

    await Promise.all([
      Core.LocalFeedService.delete({ feedId }),
      Core.HomeserverService.request({ method: HttpMethod.DELETE, url: feedUrl }),
      ...(streamId
        ? [
            Core.LocalStreamPostsService.deleteById({ streamId }),
            Core.LocalStreamPostsService.clearUnreadStream({ streamId }),
          ]
        : []),
    ]);
  }

  /**
   * Merges partial update changes with the existing feed to produce a full TFeedCreateParams.
   * Fields present in `changes` override the existing values; omitted fields keep their current value.
   * The result is passed to FeedNormalizer which recomputes the HashId — if any config field
   * (tags, reach, sort, content, layout) changed, the feed will get a new ID.
   */
  static async prepareUpdateParams({ feedId, changes }: Core.TFeedUpdateParams): Promise<Core.TFeedCreateParams> {
    const existing = await Core.LocalFeedService.read({ feedId });

    return {
      name: existing.name,
      tags: changes.tags ?? existing.tags,
      reach: changes.reach ?? existing.reach,
      sort: changes.sort ?? existing.sort,
      content: changes.content !== undefined ? changes.content : existing.content,
      layout: changes.layout ?? existing.layout,
    };
  }

  /**
   * Fetch all feeds from the homeserver and persist them locally.
   * Used during bootstrap to hydrate the local feed cache.
   */
  static async fetchFeeds(userId: Core.Pubky): Promise<Core.FeedModelSchema[]> {
    const feedsDirectory = `${baseUriBuilder(userId)}feeds/`;
    const feedUris = await Core.HomeserverService.list({ baseDirectory: feedsDirectory });
    const validFeeds: Core.FeedModelSchema[] = [];

    for (let index = 0; index < feedUris.length; index += this.FETCH_FEEDS_BATCH_SIZE) {
      const batch = feedUris.slice(index, index + this.FETCH_FEEDS_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (feedUri) => {
          const remoteFeed = await Core.HomeserverService.request<HomeserverFeedJson>({
            method: HttpMethod.GET,
            url: feedUri,
          });

          return this.normalizeRemoteFeed({ userId, remoteFeed });
        }),
      );

      batchResults.forEach((result, batchIndex) => {
        const feedUri = batch[batchIndex];
        if (result.status === 'rejected') {
          Logger.warn('Skipping feed during bootstrap fetch due to request failure', {
            feedUri,
            error: result.reason,
          });
          return;
        }

        if (result.value) {
          validFeeds.push(result.value);
        }
      });
    }

    if (validFeeds.length === 0) return [];
    return Core.LocalFeedService.createOrUpdateMany(validFeeds);
  }

  /**
   * Validates and transforms a single remote feed into a FeedModelSchema.
   * Returns null if the feed is invalid, logging a warning instead of throwing.
   */
  private static normalizeRemoteFeed({ userId, remoteFeed }: RemoteFeedParams): Core.FeedModelSchema | null {
    try {
      const { feed, meta: feedMeta } = this.validateRemoteFeedWithSpecs({ userId, remoteFeed });
      const { tags, reach, sort, layout, content } = feed.feed;

      return {
        id: feedMeta.id,
        name: feed.name,
        tags: tags ?? [],
        reach,
        sort,
        content: content ?? null,
        layout,
        created_at: Number(feed.created_at),
        updated_at: Number(feed.created_at),
      };
    } catch (error) {
      Logger.warn('Skipping invalid feed during bootstrap fetch', error);
      return null;
    }
  }

  /**
   * Guards required fields on a remote feed payload and delegates to
   * PubkySpecsBuilder.createFeed to produce a validated FeedResult
   * with the correct HashId.
   */
  private static validateRemoteFeedWithSpecs({ userId, remoteFeed }: RemoteFeedParams) {
    if (!remoteFeed?.name || !remoteFeed?.feed) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Invalid remote feed payload', {
        service: ErrorService.Homeserver,
        operation: 'validateRemoteFeedWithSpecs',
        context: { userId, remoteFeed },
      });
    }

    const builder = Core.PubkySpecsSingleton.get(userId);

    const { tags, reach, layout, sort, content } = remoteFeed.feed;
    const normalizedTags = Array.isArray(tags) ? tags : [];
    return builder.createFeed(normalizedTags, reach, layout, sort, content, remoteFeed.name);
  }

  /**
   * Persist feed locally and sync to homeserver
   * Extracted to avoid duplication between handlePut and handleUpdate
   */
  private static async commit({
    userId,
    feedSchema,
    normalizedFeed,
  }: PersistAndSyncParams): Promise<Core.FeedModelSchema> {
    const persistedFeed = await Core.LocalFeedService.createOrUpdate(feedSchema);

    const feedUrl = feedUriBuilder(userId, persistedFeed.id);
    const feedJson: Record<string, unknown> = normalizedFeed.feed.toJson();

    await Core.HomeserverService.request({ method: HttpMethod.PUT, url: feedUrl, bodyJson: feedJson });

    return persistedFeed;
  }
}
