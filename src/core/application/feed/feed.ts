import {
  buildUri,
  decodeObject,
  deletionPaths,
  encodeObject,
  type Feed,
  feedId,
  isOneOf,
  listPrefix,
  parseUri,
  postKinds,
  toUrl,
  tryDecodeObject,
} from 'pubky-social-specs';
import type { TFeedPersistCreateParams, TFeedPersistDeleteParams } from '@/application/feed/feed.types';
import { isProfileTagReachSupported } from '@/config/feed';
import type { TFeedCreateParams, TFeedIdParam, TFeedUpdateParams } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError, toAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { FeedModel } from '@/models/feed/feed';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { FeedValidators } from '@/pipes/feed/feed.validators';
import { toSpecsValidationError } from '@/pipes/specs.errors';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { retryHomeserverWriteAfterReread } from '@/services/homeserver/write-retry';
import { LocalFeedService } from '@/services/local/feed/feed';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import type {
  FeedDeleteParams,
  FeedPutParams,
  LocalFeedMigrationParams,
  LocalFeedReconcileParams,
  LocalFeedRowParams,
  PersistAndSyncParams,
  StoredFeedWriteParams,
} from './feed.types';

export class FeedApplication {
  private constructor() {}
  private static readonly FETCH_FEEDS_BATCH_SIZE = 10;
  /** Ids whose PUT is in flight in this tab: a listing taken meanwhile does not name them yet. */
  private static readonly syncingIds = new Set<string>();

  static async getList(): Promise<FeedModelSchema[]> {
    return LocalFeedService.readAll();
  }

  static async get(params: TFeedIdParam): Promise<FeedModelSchema | null> {
    return LocalFeedService.read(params);
  }

  static async persist({ userId, params }: FeedPutParams): Promise<FeedModelSchema> {
    const { feed: builtFeed, existingId } = params as TFeedPersistCreateParams;
    // The id is the filter's hash, computed by the builder from this client's input alone, so it
    // is known before any homeserver round trip and never changes once the stored copy is merged in.
    const newId = builtFeed.id;
    const idChanged = existingId != null && existingId !== newId;

    const now = Date.now();
    // Model errors are already logged; this ancillary lookup can fall back to a fresh timestamp.
    const createdAt = existingId
      ? ((await LocalFeedService.read({ feedId: existingId }).catch(() => null)) ?? { created_at: now }).created_at
      : now;

    const { content } = builtFeed.object.feed;
    const feedSchema = this.toLocalFeed({
      id: newId,
      feed: builtFeed.object,
      // Built from this client's input, so always a kind it knows; the type stays open for reads.
      content: isOneOf(postKinds, content) ? content : null,
      createdAt,
      updatedAt: now,
    });
    const feedUrl = buildUri(userId, 'feed', newId);
    // The copy the write starts from: the feed being edited, or, for a create, a feed with this
    // very filter another client may already have stored at the same id.
    const storedUrl = buildUri(userId, 'feed', existingId ?? newId);

    // When config fields (tags, domain_tags, reach, layout, sort, content) change, the id changes
    // too. Migration flow is:
    // 1) create new homeserver resource, 2) atomically swap local feed records,
    // 3) best-effort delete old homeserver resource.
    if (idChanged) {
      // Model errors are already logged; migration can proceed without the old stream cache.
      const oldFeed = await LocalFeedService.read({ feedId: existingId }).catch(() => null);

      await this.putStoredFeed({ id: newId, storedUrl, feedUrl, feed: builtFeed.object });

      const persistedNewFeed = await this.migrateLocalFeedAtomically({ userId, existingId, feedSchema, oldFeed });

      // Best-effort cleanup of old homeserver feed. Keep local new feed as source of truth if cleanup fails.
      await this.deleteStoredFeed(userId, existingId).catch((cleanupError) => {
        Logger.warn('Failed to cleanup old homeserver feed after successful migration to new feed ID', {
          oldFeedId: existingId,
          newFeedId: newId,
          cleanupError,
        });
      });

      return persistedNewFeed;
    }

    return this.commit({ feedSchema, id: newId, storedUrl, feedUrl, feed: builtFeed.object });
  }

  static async commitDelete({ userId, params }: FeedDeleteParams): Promise<void> {
    const feedId = (params as TFeedPersistDeleteParams).feedId;

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
      this.deleteStoredFeed(userId, feedId),
      ...(streamId
        ? [LocalStreamPostsService.deleteById({ streamId }), LocalStreamPostsService.clearUnreadStream({ streamId })]
        : []),
    ]);
  }

  /**
   * Merges partial update changes with the existing feed to produce a full TFeedCreateParams.
   * Fields present in `changes` override the existing values; omitted fields keep their current value.
   * The result is passed to FeedNormalizer which recomputes the id — if any config field
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
   * Feeds live under the private root only; the listing is the whole truth about which feeds
   * exist, so every local row it does not name (a feed deleted on another device, a row carrying
   * a 0.x id from before the account was migrated) is removed with its stream cache. The whole
   * directory is listed for that reason: a truncated listing would delete feeds that exist.
   */
  static async fetchFeeds(userId: Pubky): Promise<FeedModelSchema[]> {
    const feedsDirectory = `${listPrefix(userId, 'private')}feeds/`;
    // Taken before the listing: a row written from here on is a create whose PUT may still be in flight.
    const listedAt = Date.now();
    const feedUris = await HomeserverService.listAll({ baseDirectory: feedsDirectory });
    const listedIds = new Set(feedUris.flatMap((feedUri) => this.feedIdOfUri(feedUri) ?? []));

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

    const persisted = validFeeds.length > 0 ? await LocalFeedService.createOrUpdateMany(validFeeds) : [];
    await this.reconcileLocalFeeds({ userId, listedIds, listedAt });
    return persisted;
  }

  /** The feed id a listing entry names, or null for a file in the directory that is no feed. */
  private static feedIdOfUri(feedUri: string): string | null {
    try {
      const parsed = parseUri(feedUri);
      return parsed.kind === 'feed' ? parsed.id : null;
    } catch {
      return null;
    }
  }

  /**
   * Removes the local feeds the listing no longer names, with the stream caches keyed on them, so
   * their tabs and cached pages do not outlive the stored object. A feed whose PUT is in flight in
   * this tab, or a row written since the listing was taken (another tab's), is a create still
   * syncing and is left alone.
   */
  private static async reconcileLocalFeeds({ userId, listedIds, listedAt }: LocalFeedReconcileParams): Promise<void> {
    const keepIds = new Set([...listedIds, ...this.syncingIds]);
    const removed = await LocalFeedService.deleteMissing({ keepIds, listedAt });
    const streamIds = removed.flatMap((feed) => {
      try {
        return [buildFeedStreamId(feed, userId)];
      } catch {
        // Cache cleanup is ancillary; a malformed row leaves no cache to clear.
        return [];
      }
    });
    await Promise.all(
      streamIds.flatMap((streamId) => [
        LocalStreamPostsService.deleteById({ streamId }),
        LocalStreamPostsService.clearUnreadStream({ streamId }),
      ]),
    );
  }

  /**
   * Decodes one stored feed into a FeedModelSchema.
   * Returns null if the feed is invalid, logging a warning instead of throwing.
   */
  private static normalizeRemoteFeed(feedUri: string, bytes: Uint8Array): FeedModelSchema | null {
    try {
      const feed = decodeObject(feedUri, bytes, 'feed');
      const { domain_tags, reach, content } = feed.feed;

      // A content kind from a newer data model has no stream here.
      if (content !== null && !isOneOf(postKinds, content)) {
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
      return this.toLocalFeed({ id: feedId(feed), feed, content, createdAt, updatedAt: createdAt });
    } catch (error) {
      Logger.warn('Skipping invalid feed during bootstrap fetch', error);
      return null;
    }
  }

  /** The local row of a stored feed; `content` is the known kind the caller checked. */
  private static toLocalFeed({ id, feed, content, createdAt, updatedAt }: LocalFeedRowParams): FeedModelSchema {
    const { tags, domain_tags, reach, sort, layout } = feed.feed;
    return {
      id,
      name: feed.name,
      icon: FeedValidators.sanitizeIcon(feed.icon),
      tags: tags ?? [],
      domain_tags: domain_tags ?? [],
      reach,
      sort,
      content,
      layout,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  /**
   * PUTs `feed` at `feedUrl` on top of what the homeserver holds at `storedUrl`: the members this
   * client does not know (`$unknown`, on the object and on its filter) and the creation time are
   * carried over, so an edit never drops what another client wrote. The filter members are this
   * client's, so the id computed by the builder stands after the merge. One read-merge-write under
   * a fence: a PUT the homeserver refuses with a retried status (429, 500, 503 or the publish
   * conflict) runs again from the read, and no later pass outlives the session.
   */
  private static async putStoredFeed({ id, storedUrl, feedUrl, feed }: StoredFeedWriteParams): Promise<void> {
    const fence = HomeserverService.createWriteFence();
    this.syncingIds.add(id);
    try {
      await retryHomeserverWriteAfterReread(fence, async () => {
        const stored = await this.readStoredFeed(storedUrl);
        const merged = stored ? this.carryStoredMembers(feed, stored) : feed;
        await HomeserverService.putBlob({ url: feedUrl, blob: encodeObject(feedUrl, merged), fence });
      });
    } finally {
      this.syncingIds.delete(id);
    }
  }

  /** The feed stored at `url`, or null when there is none or its bytes do not decode (then the write starts fresh). */
  private static async readStoredFeed(url: string): Promise<Feed | null> {
    const stored = await HomeserverService.getBytesIfExists(url);
    if (!stored) return null;
    const read = tryDecodeObject(url, stored.bytes, 'feed');
    if (read.ok) return read.value;
    Logger.warn('Stored feed does not decode; writing the feed from local state', { url, error: read.error.message });
    return null;
  }

  private static carryStoredMembers(feed: Feed, stored: Feed): Feed {
    return {
      ...feed,
      ...(stored.$unknown === undefined ? {} : { $unknown: stored.$unknown }),
      feed: { ...feed.feed, ...(stored.feed.$unknown === undefined ? {} : { $unknown: stored.feed.$unknown }) },
      created_at: stored.created_at,
    };
  }

  /**
   * Deletes both addresses of the feed `id`: the published copy first (this client never writes
   * one, so a 404 is the usual answer and `deleteIdempotent` absorbs it), then the private object.
   */
  private static async deleteStoredFeed(userId: Pubky, id: string): Promise<void> {
    let paths: string[];
    try {
      paths = deletionPaths({ kind: 'feed', id });
    } catch (error) {
      throw toSpecsValidationError(error, 'deletionPaths', { feedId: id });
    }
    for (const path of paths) {
      await HomeserverService.deleteIdempotent(toUrl(userId, path));
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
  private static async commit({
    feedSchema,
    id,
    storedUrl,
    feedUrl,
    feed,
  }: PersistAndSyncParams): Promise<FeedModelSchema> {
    const { persisted: persistedFeed, prior: priorFeed } = await LocalFeedService.createOrUpdate(feedSchema);

    try {
      await this.putStoredFeed({ id, storedUrl, feedUrl, feed });
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
