import {
  buildUri,
  decodeObject,
  encodeObject,
  type Feed,
  feedId,
  listPrefix,
  parsePubkyUrl,
  tryDecodeObject,
} from 'pubky-social-specs';
import type { TFeedPersistCreateParams, TFeedPersistDeleteParams } from '@/application/feed/feed.types';
import { DEFAULT_CUSTOM_FEED_ICON, isProfileTagReachSupported } from '@/config/feed';
import type { TFeedCreateParams, TFeedIdParam, TFeedUpdateParams } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { FeedModel } from '@/models/feed/feed';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { FeedValidators } from '@/pipes/feed/feed.validators';
import { isKnownPostKind } from '@/pipes/post/post.kind';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFeedService } from '@/services/local/feed/feed';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import type { FeedDeleteParams, FeedPutParams, LocalFeedMigrationParams, PersistAndSyncParams } from './feed.types';

export class FeedApplication {
  private constructor() {}
  private static readonly FETCH_FEEDS_BATCH_SIZE = 10;

  static async getList(): Promise<FeedModelSchema[]> {
    return LocalFeedService.readAll();
  }

  static async get(params: TFeedIdParam): Promise<FeedModelSchema | null> {
    return LocalFeedService.read(params);
  }

  static async persist({ userId, params }: FeedPutParams): Promise<FeedModelSchema> {
    const { feed: builtFeed, existingId } = params as TFeedPersistCreateParams;
    // An edit starts from the stored feed so the members another client added survive it.
    const stored = existingId ? await this.readRemoteFeed(userId, existingId) : null;
    const feed: Feed = stored
      ? {
          ...stored,
          name: builtFeed.object.name,
          icon: builtFeed.object.icon,
          feed: { ...stored.feed, ...builtFeed.object.feed },
        }
      : builtFeed.object;
    const newId = feedId(feed);
    const idChanged = existingId != null && existingId !== newId;

    const now = Date.now();
    // Model errors are already logged; this ancillary lookup can fall back to a fresh timestamp.
    const createdAt = existingId
      ? ((await LocalFeedService.read({ feedId: existingId }).catch(() => null)) ?? { created_at: now }).created_at
      : now;

    const { tags, domain_tags, reach, sort, content, layout } = builtFeed.object.feed;

    const feedSchema: FeedModelSchema = {
      id: newId,
      name: feed.name,
      icon: feed.icon ?? DEFAULT_CUSTOM_FEED_ICON,
      tags: tags ?? [],
      domain_tags: domain_tags ?? [],
      reach,
      sort,
      // Built from this client's input, so always a kind it knows; the type stays open for reads.
      content: content !== null && isKnownPostKind(content) ? content : null,
      layout,
      created_at: createdAt,
      updated_at: now,
    };
    const newFeedUrl = buildUri(userId, 'feed', newId);
    const body = encodeObject(newFeedUrl, feed);

    // When config fields (tags, domain_tags, reach, layout, sort, content) change, the feed id changes
    // too. Migration flow is:
    // 1) create new homeserver resource, 2) atomically swap local feed records,
    // 3) best-effort delete old homeserver resource.
    if (idChanged) {
      // Model errors are already logged; migration can proceed without the old stream cache.
      const oldFeed = await LocalFeedService.read({ feedId: existingId }).catch(() => null);

      await HomeserverService.putBlob({ url: newFeedUrl, blob: body });

      const persistedNewFeed = await this.migrateLocalFeedAtomically({ userId, existingId, feedSchema, oldFeed });

      // Best-effort cleanup of old homeserver feed. Keep local new feed as source of truth if cleanup fails.
      const oldFeedUrl = buildUri(userId, 'feed', existingId);
      await HomeserverService.request({ method: HttpMethod.DELETE, url: oldFeedUrl }).catch((cleanupError) => {
        Logger.warn('Failed to cleanup old homeserver feed after successful migration to new feed ID', {
          oldFeedId: existingId,
          newFeedId: newId,
          cleanupError,
        });
      });

      return persistedNewFeed;
    }

    return this.commit({ feedSchema, feedUrl: newFeedUrl, body });
  }

  /** The stored feed at `feedId`, or null when it is absent or unreadable (then the edit starts fresh). */
  private static async readRemoteFeed(userId: Pubky, id: string): Promise<Feed | null> {
    const url = buildUri(userId, 'feed', id);
    const stored = await HomeserverService.getBytesIfExists(url);
    if (!stored) return null;
    const read = tryDecodeObject(url, stored.bytes, 'feed');
    if (read.ok) return read.value;
    Logger.warn('Stored feed does not decode; editing from local state', { feedId: id, error: read.error.message });
    return null;
  }

  static async commitDelete({ userId, params }: FeedDeleteParams): Promise<void> {
    const feedId = (params as TFeedPersistDeleteParams).feedId;
    const feedUrl = buildUri(userId, 'feed', feedId);

    // Model errors are already logged; cache cleanup must not block the delete itself.
    const feed = await LocalFeedService.read({ feedId }).catch(() => null);
    let streamId: ReturnType<typeof buildFeedStreamId> | null = null;
    if (feed) {
      try {
        streamId = buildFeedStreamId(feed, userId);
      } catch {
        // Cache cleanup is ancillary; malformed legacy rows must remain deletable.
      }
    }

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
   * (tags, domain_tags, reach, sort, content, layout) changed, the feed will get a new ID.
   * Presentation fields (`name` and `icon`) do not affect the ID.
   */
  static async prepareUpdateParams({ feedId, changes }: TFeedUpdateParams): Promise<TFeedCreateParams> {
    // Update only runs on feeds the user is editing (they came from a list
    // read), so a missing row means the feed was deleted mid-edit. Preserve
    // the previous throw-after-read behavior in that case; the null return
    // from read() is for the stale-id lookups elsewhere.
    const existing = await LocalFeedService.read({ feedId });
    if (!existing) {
      throw Err.database(DatabaseErrorCode.RECORD_NOT_FOUND, 'Feed not found', {
        service: ErrorService.Local,
        operation: 'prepareUpdateParams',
        context: { table: 'feeds', id: feedId },
      });
    }

    return {
      name: changes.name ?? existing.name,
      icon: FeedValidators.sanitizeIcon(changes.icon ?? existing.icon),
      tags: changes.tags ?? existing.tags,
      domain_tags: changes.domain_tags ?? existing.domain_tags,
      reach: changes.reach ?? existing.reach,
      sort: changes.sort ?? existing.sort,
      content: changes.content !== undefined ? changes.content : existing.content,
      layout: changes.layout ?? existing.layout,
    };
  }

  /**
   * Fetch all feeds from the homeserver and persist them locally.
   * Used during bootstrap to hydrate the local feed cache.
   *
   * Feeds a 0.x client wrote under `/pub/pubky.app/feeds/` are not read: the package has no 0.x
   * reader, so they appear once the account is migrated.
   */
  static async fetchFeeds(userId: Pubky): Promise<FeedModelSchema[]> {
    const feedsDirectory = `${listPrefix(userId, 'private')}feeds/`;
    const feedUris = await HomeserverService.list({ baseDirectory: feedsDirectory });

    const validFeeds: FeedModelSchema[] = [];

    for (let index = 0; index < feedUris.length; index += this.FETCH_FEEDS_BATCH_SIZE) {
      const batch = feedUris.slice(index, index + this.FETCH_FEEDS_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (feedUri) => {
          const bytes = await HomeserverService.getBytes(feedUri);
          return this.normalizeRemoteFeed(feedUri, bytes);
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
   * Decodes one stored feed into a FeedModelSchema.
   * Returns null if the feed is invalid, logging a warning instead of throwing.
   */
  private static normalizeRemoteFeed(feedUri: string, bytes: Uint8Array): FeedModelSchema | null {
    try {
      const feed = decodeObject(parsePubkyUrl(feedUri), bytes, 'feed');
      const { tags, domain_tags, reach, sort, layout, content } = feed.feed;

      // A content kind from a newer data model has no stream here.
      if (content !== null && !isKnownPostKind(content)) {
        Logger.warn('Skipping feed with an unknown content kind during bootstrap fetch', { content });
        return null;
      }

      if (domain_tags && domain_tags.length > 0 && !isProfileTagReachSupported(reach)) {
        Logger.warn('Skipping unsupported profile-tag feed during bootstrap fetch', {
          reach,
          domainTags: domain_tags,
        });
        return null;
      }

      // `created_at` is microseconds; the local row keeps milliseconds.
      const createdAt = Math.floor(feed.created_at / 1000);
      return {
        id: feedId(feed),
        name: feed.name,
        icon: FeedValidators.sanitizeIcon(feed.icon),
        tags: tags ?? [],
        domain_tags: domain_tags ?? [],
        reach,
        sort,
        content: content ?? null,
        layout,
        created_at: createdAt,
        updated_at: createdAt,
      };
    } catch (error) {
      Logger.warn('Skipping invalid feed during bootstrap fetch', error);
      return null;
    }
  }

  /**
   * Persist feed locally and sync to homeserver
   * Extracted to avoid duplication between handlePut and handleUpdate
   *
   * Local-first with compensation: the row is written before the PUT, and a failed PUT
   * rolls it back so a feed that never reached the homeserver leaves no tab behind. A
   * create (no prior row for this ID) deletes the row; a same-ID update (name or icon
   * only) restores the prior row so the local values match what the homeserver still has.
   * The prior-row snapshot is taken inside the write transaction, and the rollback only
   * undoes this commit's own write (matched by `updated_at`), never a newer one that landed
   * while the PUT was in flight.
   */
  private static async commit({ feedSchema, feedUrl, body }: PersistAndSyncParams): Promise<FeedModelSchema> {
    const { persisted: persistedFeed, prior: priorFeed } = await LocalFeedService.createOrUpdate(feedSchema);

    try {
      await HomeserverService.putBlob({ url: feedUrl, blob: body });
    } catch (error) {
      try {
        await LocalFeedService.rollback({
          feedId: persistedFeed.id,
          expectedUpdatedAt: feedSchema.updated_at,
          priorFeed,
        });
      } catch (rollbackError) {
        if (!isAppError(rollbackError))
          Logger.error('Failed to rollback local feed write', { feedId: persistedFeed.id, rollbackError });
      }
      throw toAppError(error, ErrorService.Homeserver, 'commit');
    }

    return persistedFeed;
  }

  /**
   * Atomically migrate local feed state from existingId -> new hash-derived ID.
   * This prevents transient duplicate/empty states in reactive local queries.
   */
  private static async migrateLocalFeedAtomically({
    userId,
    existingId,
    feedSchema,
    oldFeed,
  }: LocalFeedMigrationParams): Promise<FeedModelSchema> {
    return db.transaction('rw', [FeedModel.table, PostStreamModel.table, UnreadPostStreamModel.table], async () => {
      await FeedModel.upsert(feedSchema);
      await FeedModel.deleteById(existingId);

      if (oldFeed) {
        let oldStreamId: ReturnType<typeof buildFeedStreamId> | null = null;
        try {
          oldStreamId = buildFeedStreamId(oldFeed, userId);
        } catch {
          // Cache cleanup is ancillary; the edit can canonicalize a malformed legacy row.
        }
        if (oldStreamId) {
          await PostStreamModel.deleteById(oldStreamId);
          await UnreadPostStreamModel.deleteById(oldStreamId);
        }
      }

      return FeedModel.findByIdOrThrow(feedSchema.id);
    });
  }
}
