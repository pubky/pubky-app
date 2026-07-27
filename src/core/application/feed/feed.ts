import { baseUriBuilder, feedUriBuilder } from 'pubky-app-specs';
import type { TFeedPersistCreateParams, TFeedPersistDeleteParams } from '@/application/feed/feed.types';
import type { TFeedCreateParams, TFeedIdParam, TFeedUpdateParams } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { FeedModel } from '@/models/feed/feed';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { PubkySpecsSingleton } from '@/pipes/pipes.builder';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFeedService } from '@/services/local/feed/feed';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import type {
  FeedDeleteParams,
  FeedPutParams,
  HomeserverFeedJson,
  LocalFeedMigrationParams,
  PersistAndSyncParams,
  RemoteFeedParams,
} from './feed.types';

export class FeedApplication {
  private constructor() {}
  private static readonly FETCH_FEEDS_BATCH_SIZE = 10;

  static async getList(): Promise<FeedModelSchema[]> {
    return LocalFeedService.readAll();
  }

  static async get(params: TFeedIdParam): Promise<FeedModelSchema> {
    return LocalFeedService.read(params);
  }

  static async persist({ userId, params }: FeedPutParams): Promise<FeedModelSchema> {
    const { feed: normalizedFeed, existingId } = params as TFeedPersistCreateParams;
    const { feed, meta } = normalizedFeed;
    const newId = meta.id;
    const idChanged = existingId != null && existingId !== newId;

    const now = Date.now();
    const createdAt = existingId
      ? (await LocalFeedService.read({ feedId: existingId }).catch(() => ({ created_at: now }))).created_at
      : now;

    const { tags, reach, sort, content, layout } = feed.feed;

    const feedSchema: FeedModelSchema = {
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
    // ID changes too. Migration flow is:
    // 1) create new homeserver resource, 2) atomically swap local feed records,
    // 3) best-effort delete old homeserver resource.
    if (idChanged) {
      const oldFeed = await LocalFeedService.read({ feedId: existingId }).catch(() => null);
      const newFeedUrl = feedUriBuilder(userId, newId);
      const newFeedJson: Record<string, unknown> = normalizedFeed.feed.toJson();

      await HomeserverService.request({ method: HttpMethod.PUT, url: newFeedUrl, bodyJson: newFeedJson });

      const persistedNewFeed = await this.migrateLocalFeedAtomically({ existingId, feedSchema, oldFeed });

      // Best-effort cleanup of old homeserver feed. Keep local new feed as source of truth if cleanup fails.
      const oldFeedUrl = feedUriBuilder(userId, existingId);
      await HomeserverService.request({ method: HttpMethod.DELETE, url: oldFeedUrl }).catch((cleanupError) => {
        Logger.warn('Failed to cleanup old homeserver feed after successful migration to new feed ID', {
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
    const feedId = (params as TFeedPersistDeleteParams).feedId;
    const feedUrl = feedUriBuilder(userId, feedId);

    const feed = await LocalFeedService.read({ feedId }).catch(() => null);
    const streamId = feed ? buildFeedStreamId(feed) : null;

    await Promise.all([
      LocalFeedService.delete({ feedId }),
      HomeserverService.request({ method: HttpMethod.DELETE, url: feedUrl }),
      ...(streamId
        ? [LocalStreamPostsService.deleteById({ streamId }), LocalStreamPostsService.clearUnreadStream({ streamId })]
        : []),
    ]);
  }

  /**
   * Merges partial update changes with the existing feed to produce a full TFeedCreateParams.
   * Fields present in `changes` override the existing values; omitted fields keep their current value.
   * The result is passed to FeedNormalizer which recomputes the HashId — if any config field
   * (tags, reach, sort, content, layout) changed, the feed will get a new ID.
   */
  static async prepareUpdateParams({ feedId, changes }: TFeedUpdateParams): Promise<TFeedCreateParams> {
    const existing = await LocalFeedService.read({ feedId });

    return {
      name: changes.name ?? existing.name,
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
  static async fetchFeeds(userId: Pubky): Promise<FeedModelSchema[]> {
    const feedsDirectory = `${baseUriBuilder(userId)}feeds/`;
    const feedUris = await HomeserverService.list({ baseDirectory: feedsDirectory });

    const validFeeds: FeedModelSchema[] = [];

    for (let index = 0; index < feedUris.length; index += this.FETCH_FEEDS_BATCH_SIZE) {
      const batch = feedUris.slice(index, index + this.FETCH_FEEDS_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (feedUri) => {
          const remoteFeed = await HomeserverService.request<HomeserverFeedJson>({
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
    return LocalFeedService.createOrUpdateMany(validFeeds);
  }

  /**
   * Validates and transforms a single remote feed into a FeedModelSchema.
   * Returns null if the feed is invalid, logging a warning instead of throwing.
   */
  private static normalizeRemoteFeed({ userId, remoteFeed }: RemoteFeedParams): FeedModelSchema | null {
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
        created_at: Number(remoteFeed.created_at),
        updated_at: Number(remoteFeed.created_at),
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

    const builder = PubkySpecsSingleton.get(userId);

    const { tags, domain_tags, reach, layout, sort, content } = remoteFeed.feed;
    const normalizedTags = Array.isArray(tags) ? tags : [];
    const normalizedDomainTags = Array.isArray(domain_tags) ? domain_tags : undefined;
    return builder.createFeed(normalizedTags, reach, layout, sort, content, remoteFeed.name, normalizedDomainTags);
  }

  /**
   * Persist feed locally and sync to homeserver
   * Extracted to avoid duplication between handlePut and handleUpdate
   */
  private static async commit({ userId, feedSchema, normalizedFeed }: PersistAndSyncParams): Promise<FeedModelSchema> {
    const persistedFeed = await LocalFeedService.createOrUpdate(feedSchema);

    const feedUrl = feedUriBuilder(userId, persistedFeed.id);
    const feedJson: Record<string, unknown> = normalizedFeed.feed.toJson();

    await HomeserverService.request({ method: HttpMethod.PUT, url: feedUrl, bodyJson: feedJson });

    return persistedFeed;
  }

  /**
   * Atomically migrate local feed state from existingId -> new hash-derived ID.
   * This prevents transient duplicate/empty states in reactive local queries.
   */
  private static async migrateLocalFeedAtomically({
    existingId,
    feedSchema,
    oldFeed,
  }: LocalFeedMigrationParams): Promise<FeedModelSchema> {
    return db.transaction('rw', [FeedModel.table, PostStreamModel.table, UnreadPostStreamModel.table], async () => {
      await FeedModel.upsert(feedSchema);
      await FeedModel.deleteById(existingId);

      if (oldFeed) {
        const oldStreamId = buildFeedStreamId(oldFeed);
        await PostStreamModel.deleteById(oldStreamId);
        await UnreadPostStreamModel.deleteById(oldStreamId);
      }

      return FeedModel.findByIdOrThrow(feedSchema.id);
    });
  }
}
