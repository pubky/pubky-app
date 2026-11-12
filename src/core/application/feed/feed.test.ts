import { buildUri, decodeObject, type Feed, feedId, feedPaths, listPrefix } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMESERVER_SYNC_READ_TIMEOUT_MS } from '@/config/network';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import {
  ClientErrorCode,
  DatabaseErrorCode,
  ServerErrorCode,
  TimeoutErrorCode,
  ValidationErrorCode,
} from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { HttpStatusCode } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { FeedModel } from '@/models/feed/feed';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import type { Pubky } from '@/models/models.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { FeedNormalizer } from '@/pipes/feed/feed.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { installHomeserverWriteRetryDependenciesForTests } from '@/services/homeserver/write-retry';
import { LocalFeedService } from '@/services/local/feed/feed';
import { stubMemoryHomeserver } from '@/test-utils/homeserver';
import { freezeSpecClock, restoreSpecClock } from '@/test-utils/spec-clock';
import { VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { createTestWebLocks } from '@/test-utils/web-locks';
import { FeedApplication } from './feed';

const owner = fakeOwner(1) as Pubky;
const FEEDS_DIRECTORY = `${listPrefix(owner, 'private')}feeds/`;

const feedParams = (overrides: Partial<TFeedCreateParams> = {}): TFeedCreateParams => ({
  name: 'Bitcoin News',
  icon: 'activity',
  tags: ['bitcoin', 'lightning'],
  domain_tags: [],
  reach: 'all',
  sort: 'recent',
  content: null,
  layout: 'columns',
  ...overrides,
});
const built = (overrides: Partial<TFeedCreateParams> = {}) =>
  FeedNormalizer.to({ params: feedParams(overrides), userId: owner });
const bodyJson = (feed: ReturnType<typeof built>): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(feed.body));

/** A write the homeserver refuses with a status the retry policy retries. */
const retriedFailure = () =>
  new AppError({
    category: ErrorCategory.Server,
    code: ServerErrorCode.INTERNAL_ERROR,
    message: 'Failed to PUT to homeserver: 500',
    service: ErrorService.Homeserver,
    operation: 'putBlob',
    context: { statusCode: HttpStatusCode.INTERNAL_SERVER_ERROR },
  });

/** A local delete the database refuses. */
const localDeleteFailure = () =>
  new AppError({
    category: ErrorCategory.Database,
    code: DatabaseErrorCode.DELETE_FAILED,
    message: 'Failed to delete feed',
    service: ErrorService.Local,
    operation: 'delete',
  });

/** A write the homeserver refuses for good. */
const refusedWrite = () =>
  new AppError({
    category: ErrorCategory.Client,
    code: ClientErrorCode.BAD_REQUEST,
    message: 'Failed to PUT to homeserver: 400',
    service: ErrorService.Homeserver,
    operation: 'putBlob',
    context: { statusCode: HttpStatusCode.BAD_REQUEST },
  });

describe('FeedApplication', () => {
  let homeserver: ReturnType<typeof stubMemoryHomeserver>;
  let warn: ReturnType<typeof vi.spyOn>;

  const storedBytes = (path: string) => homeserver.session.storage.getBytes(path);
  const storedFeed = async (id: string): Promise<Feed> =>
    decodeObject(buildUri(owner, 'feed', id), await storedBytes(feedPaths(id).private), 'feed');
  const storedExists = (path: string) => homeserver.session.storage.exists(path);
  /** Stores `json` at the feed's private path as another client would spell it, extra members included. */
  const storeRaw = (id: string, json: Record<string, unknown>) =>
    homeserver.session.storage.putBytes(feedPaths(id).private, new TextEncoder().encode(JSON.stringify(json)));
  const seedStreamCaches = async (feed: FeedModelSchema) => {
    const streamId = buildFeedStreamId(feed, owner);
    await PostStreamModel.upsert(streamId, [`${owner}:0032PARTQP4G0`]);
    await UnreadPostStreamModel.upsert(streamId, [`${owner}:0032PARTQP4G1`]);
    return streamId;
  };

  beforeEach(async () => {
    await db.initialize();
    await Promise.all([FeedModel.table.clear(), PostStreamModel.table.clear(), UnreadPostStreamModel.table.clear()]);
    homeserver = stubMemoryHomeserver(owner);
    warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    installHomeserverWriteRetryDependenciesForTests({ sleep: async () => {}, random: () => 0, now: () => 0 });
  });

  /** Web Locks as the browser provides them, shared by every tab; removed again in `afterEach`. */
  const installWebLocks = () => {
    const locks = createTestWebLocks();
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    return locks;
  };
  /** Holds the listing once it is taken, until `release`; `taken` resolves meanwhile. */
  const holdListing = () => {
    const taken = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    const list = homeserver.spies.listAll.getMockImplementation()!;
    homeserver.spies.listAll.mockImplementationOnce(async (params) => {
      const urls = await list(params);
      taken.resolve();
      await released.promise;
      return urls;
    });
    return { taken: taken.promise, release: () => released.resolve() };
  };
  /** Holds the next PUT until `landed` resolves, as a retry backing off would. */
  const holdPut = (landed: Promise<void>) => {
    const putBlob = homeserver.spies.putBlob.getMockImplementation()!;
    homeserver.spies.putBlob.mockImplementationOnce(async (params) => {
      await landed;
      return putBlob(params);
    });
  };
  /** Holds the next DELETE until `landed` resolves, as a retry backing off would. */
  const holdDelete = (landed: Promise<void>) => {
    const remove = homeserver.spies.deleteIdempotent.getMockImplementation()!;
    homeserver.spies.deleteIdempotent.mockImplementationOnce(async (url) => {
      await landed;
      return remove(url);
    });
  };

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
    installHomeserverWriteRetryDependenciesForTests(null);
    restoreSpecClock();
    vi.restoreAllMocks();
  });

  describe('get', () => {
    it('returns null when the feed is not found locally', async () => {
      await expect(FeedApplication.get({ feedId: built().id })).resolves.toBeNull();
    });
  });

  describe('persist (create)', () => {
    it('saves the row first, then PUTs the feed bytes at its private path under the fence', async () => {
      const feed = built();
      const fence = vi.spyOn(HomeserverService, 'createWriteFence');

      const result = await FeedApplication.persist({ userId: owner, params: { feed } });

      expect(result).toMatchObject({
        id: feed.id,
        name: 'Bitcoin News',
        icon: 'activity',
        tags: ['bitcoin', 'lightning'],
        domain_tags: [],
        reach: 'all',
        sort: 'recent',
        content: null,
        layout: 'columns',
      });
      expect(await FeedModel.table.get(feed.id)).toEqual(result);
      expect(await storedFeed(feed.id)).toEqual(feed.object);
      expect(await storedExists(feedPaths(feed.id).public)).toBe(false);
      expect(fence).toHaveBeenCalledTimes(1);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);
      const [put] = homeserver.spies.putBlob.mock.calls[0];
      expect(put.url).toBe(feed.url);
      expect(decodeObject(put.url, put.blob, 'feed')).toEqual(feed.object);
      expect(put.fence).toBe(fence.mock.results[0].value);
      // Read before write: the copy at the new id, in case another client stored this very filter.
      expect(homeserver.spies.getBytesIfExists).toHaveBeenCalledExactlyOnceWith(feed.url);
    });

    it('writes nothing when the account changed while the create waited for the sync lock', async () => {
      installWebLocks();
      const listing = holdListing();
      let current = true;

      const fetching = FeedApplication.fetchFeeds(owner);
      await listing.taken;
      const creating = FeedApplication.persist({ userId: owner, params: { feed: built() }, isCurrent: () => current });
      // Signed out (or into another account) while the write waits: logout cleared the shared database.
      current = false;
      listing.release();
      await fetching;

      await expect(creating).resolves.toBeNull();
      expect(await FeedModel.table.count()).toBe(0);
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
    });

    it('stops before the PUT when the account changes during the local write', async () => {
      let current = true;
      const createOrUpdate = LocalFeedService.createOrUpdate.bind(LocalFeedService);
      vi.spyOn(LocalFeedService, 'createOrUpdate').mockImplementationOnce(async (schema) => {
        const written = await createOrUpdate(schema);
        current = false;
        return written;
      });

      const result = await FeedApplication.persist({
        userId: owner,
        params: { feed: built() },
        isCurrent: () => current,
      });

      // The row is left as it is (logout clears it); nothing reaches the homeserver.
      expect(result).toBeNull();
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
    });

    it('persists profile tags and the v1 content kind, keeping the Nexus stream id in the 0.x vocabulary', async () => {
      const tagged = built({ tags: [], domain_tags: ['bitcoiner', '🔥'], reach: 'wot', layout: 'cards' });
      const notes = built({ content: 'note', sort: 'popularity' });

      const taggedRow = await FeedApplication.persist({ userId: owner, params: { feed: tagged } });
      const notesRow = await FeedApplication.persist({ userId: owner, params: { feed: notes } });

      expect(taggedRow).toMatchObject({ tags: [], domain_tags: ['bitcoiner', '🔥'], reach: 'wot', layout: 'cards' });
      expect((await storedFeed(tagged.id)).feed).toMatchObject({ tags: null, domain_tags: ['bitcoiner', '🔥'] });
      expect(buildFeedStreamId(taggedRow!, owner)).toBe('timeline:wot_domain:2:all:bitcoiner,🔥');
      expect(notesRow?.content).toBe('note');
      expect((await storedFeed(notes.id)).feed.content).toBe('note');
      expect(buildFeedStreamId(notesRow!, owner)).toBe('total_engagement:all:short:bitcoin,lightning');
    });

    it('keeps the members and creation time of a feed with the same filter another client stored', async () => {
      const feed = built();
      const json = bodyJson(feed);
      await storeRaw(feed.id, {
        ...json,
        name: 'Their name',
        created_at: 1_700_000_000_000_000,
        color: 'orange',
        feed: { ...(json.feed as Record<string, unknown>), weight: 2 },
      });

      await FeedApplication.persist({ userId: owner, params: { feed } });

      const stored = await storedFeed(feed.id);
      expect(stored.name).toBe('Bitcoin News');
      expect(stored.created_at).toBe(1_700_000_000_000_000);
      expect(JSON.parse(stored.$unknown!)).toEqual({ color: 'orange' });
      expect(JSON.parse(stored.feed.$unknown!)).toEqual({ weight: 2 });
      expect(feedId(stored)).toBe(feed.id);
    });

    it('re-reads the stored copy on every retried pass and keeps the row once a pass lands', async () => {
      const feed = built();
      const putBlob = homeserver.spies.putBlob.getMockImplementation()!;
      homeserver.spies.putBlob
        .mockRejectedValueOnce(retriedFailure())
        .mockRejectedValueOnce(retriedFailure())
        .mockImplementationOnce(putBlob);

      await expect(FeedApplication.persist({ userId: owner, params: { feed } })).resolves.toMatchObject({
        id: feed.id,
      });

      expect(homeserver.spies.getBytesIfExists).toHaveBeenCalledTimes(3);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(3);
      expect(await storedFeed(feed.id)).toEqual(feed.object);
      expect(await FeedModel.table.get(feed.id)).toMatchObject({ id: feed.id });
    });

    it('rolls back the local create and rethrows when every pass of the PUT fails', async () => {
      const feed = built();
      homeserver.spies.putBlob.mockRejectedValue(retriedFailure());
      const error = vi.spyOn(Logger, 'error').mockImplementation(() => {});

      await expect(FeedApplication.persist({ userId: owner, params: { feed } })).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );

      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(3);
      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
      expect(await storedExists(feed.path)).toBe(false);
      expect(error).not.toHaveBeenCalled();
    });

    it('restores the prior row when a same-id update fails', async () => {
      const feed = built();
      const created = await FeedApplication.persist({ userId: owner, params: { feed } });
      homeserver.spies.putBlob.mockRejectedValue(refusedWrite());

      await expect(
        FeedApplication.persist({ userId: owner, params: { feed: built({ name: 'Renamed' }), existingId: feed.id } }),
      ).rejects.toThrow('Failed to PUT to homeserver: 400');

      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(2);
      expect(await FeedModel.table.get(feed.id)).toEqual(created);
      expect((await storedFeed(feed.id)).name).toBe('Bitcoin News');
    });

    it('normalizes a non-AppError homeserver failure after rolling back', async () => {
      const feed = built();
      homeserver.spies.putBlob.mockRejectedValue(new Error('socket hang up'));

      const thrown = await FeedApplication.persist({ userId: owner, params: { feed } }).catch((e: unknown) => e);

      expect(thrown).toBeInstanceOf(AppError);
      expect(thrown).toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.UNKNOWN_ERROR,
        message: 'socket hang up',
        service: ErrorService.Homeserver,
        operation: 'commit',
      });
      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
    });

    it('logs a failed rollback and still rethrows the homeserver error', async () => {
      const feed = built();
      homeserver.spies.putBlob.mockRejectedValue(refusedWrite());
      const rollbackError = new Error('IndexedDB unavailable');
      vi.spyOn(LocalFeedService, 'rollback').mockRejectedValue(rollbackError);
      const error = vi.spyOn(Logger, 'error').mockImplementation(() => {});

      await expect(FeedApplication.persist({ userId: owner, params: { feed } })).rejects.toThrow(
        'Failed to PUT to homeserver: 400',
      );

      expect(error).toHaveBeenCalledWith('Failed to rollback local feed write', { feedId: feed.id, rollbackError });
    });
  });

  describe('persist (update)', () => {
    it('keeps the id on a rename, carrying the stored unknown members and creation time', async () => {
      freezeSpecClock(VRT_FROZEN_NOW_MS);
      const feed = built();
      const created = await FeedApplication.persist({ userId: owner, params: { feed } });
      const stored = await storedFeed(feed.id);
      // Another client adds members this one does not know, at both levels.
      const json = bodyJson(feed);
      await storeRaw(feed.id, {
        ...json,
        color: 'orange',
        feed: { ...(json.feed as Record<string, unknown>), weight: 2 },
      });
      restoreSpecClock();

      const renamed = built({ name: 'Renamed', icon: 'rss' });
      expect(renamed.id).toBe(feed.id);
      const result = await FeedApplication.persist({ userId: owner, params: { feed: renamed, existingId: feed.id } });

      expect(result).toMatchObject({ id: feed.id, name: 'Renamed', icon: 'rss', created_at: created!.created_at });
      expect(result?.updated_at).toBeGreaterThanOrEqual(created!.updated_at);
      expect(await FeedModel.table.count()).toBe(1);
      const edited = await storedFeed(feed.id);
      expect(edited).toMatchObject({ name: 'Renamed', icon: 'rss', created_at: stored.created_at });
      expect(JSON.parse(edited.$unknown!)).toEqual({ color: 'orange' });
      expect(JSON.parse(edited.feed.$unknown!)).toEqual({ weight: 2 });
      expect(edited.feed).toMatchObject(feed.object.feed);
    });

    it('moves the feed to its new id when the filter changes, deleting both old paths', async () => {
      const feed = built();
      const created = await FeedApplication.persist({ userId: owner, params: { feed } });
      const createdStored = await storedFeed(feed.id);
      // A published copy, as another client may leave one.
      await homeserver.session.storage.putBytes(feedPaths(feed.id).public, feed.body);
      const oldStreamId = await seedStreamCaches(created!);
      const moved = built({ sort: 'popularity' });
      expect(moved.id).not.toBe(feed.id);

      const result = await FeedApplication.persist({ userId: owner, params: { feed: moved, existingId: feed.id } });

      expect(result).toMatchObject({ id: moved.id, sort: 'popularity', created_at: created!.created_at });
      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
      expect(await FeedModel.table.get(moved.id)).toEqual(result);
      expect(await PostStreamModel.findById(oldStreamId)).toBeNull();
      expect(await UnreadPostStreamModel.findById(oldStreamId)).toBeNull();
      expect((await storedFeed(moved.id)).created_at).toBe(createdStored.created_at);
      expect(await storedExists(feedPaths(feed.id).private)).toBe(false);
      expect(await storedExists(feedPaths(feed.id).public)).toBe(false);
      expect(homeserver.spies.deleteIdempotent.mock.calls).toEqual([
        [`pubky://${owner}${feedPaths(feed.id).public}`],
        [`pubky://${owner}${feedPaths(feed.id).private}`],
      ]);
      // The old object is read first: what another client added to it moves with the feed.
      expect(homeserver.spies.getBytesIfExists).toHaveBeenLastCalledWith(feed.url);
    });

    it('keeps the row on its old id when the account changes once the new-id PUT has landed', async () => {
      const feed = built();
      await FeedApplication.persist({ userId: owner, params: { feed } });
      const moved = built({ sort: 'popularity' });
      let current = true;
      const put = homeserver.spies.putBlob.getMockImplementation()!;
      homeserver.spies.putBlob.mockImplementationOnce(async (params) => {
        await put(params);
        current = false;
      });

      const result = await FeedApplication.persist({
        userId: owner,
        params: { feed: moved, existingId: feed.id },
        isCurrent: () => current,
      });

      // The new copy is stored, the local migration and the old-copy cleanup are skipped: both copies stay.
      expect(result).toBeNull();
      expect(await FeedModel.table.get(feed.id)).toBeDefined();
      expect(await FeedModel.table.get(moved.id)).toBeUndefined();
      expect(await storedExists(feedPaths(moved.id).private)).toBe(true);
      expect(await storedExists(feedPaths(feed.id).private)).toBe(true);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });

    it('does not touch local state when the migration PUT fails', async () => {
      const feed = built();
      const created = await FeedApplication.persist({ userId: owner, params: { feed } });
      homeserver.spies.putBlob.mockRejectedValue(refusedWrite());
      const moved = built({ sort: 'popularity' });

      await expect(
        FeedApplication.persist({ userId: owner, params: { feed: moved, existingId: feed.id } }),
      ).rejects.toThrow('Failed to PUT to homeserver: 400');

      expect(await FeedModel.table.get(feed.id)).toEqual(created);
      expect(await FeedModel.table.get(moved.id)).toBeUndefined();
      expect(await storedExists(feedPaths(moved.id).private)).toBe(false);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });

    it('keeps the local migration when the old homeserver delete fails', async () => {
      const feed = built();
      await FeedApplication.persist({ userId: owner, params: { feed } });
      const cleanupError = new Error('Failed to DELETE old feed: 500');
      homeserver.spies.deleteIdempotent.mockRejectedValue(cleanupError);
      const moved = built({ sort: 'popularity' });

      const result = await FeedApplication.persist({ userId: owner, params: { feed: moved, existingId: feed.id } });

      expect(result?.id).toBe(moved.id);
      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
      expect(await FeedModel.table.get(moved.id)).toEqual(result);
      expect(warn).toHaveBeenCalledWith(
        'Failed to cleanup old homeserver feed after successful migration to new feed ID',
        {
          oldFeedId: feed.id,
          newFeedId: moved.id,
          cleanupError,
        },
      );
    });

    it('writes the edit from local state when the stored bytes do not decode', async () => {
      const feed = built();
      await FeedApplication.persist({ userId: owner, params: { feed } });
      await homeserver.session.storage.putBytes(feed.path, new TextEncoder().encode('{'));
      const renamed = built({ name: 'Renamed' });

      await FeedApplication.persist({ userId: owner, params: { feed: renamed, existingId: feed.id } });

      expect(await storedFeed(feed.id)).toEqual(renamed.object);
      expect(warn).toHaveBeenCalledWith(
        'Stored feed does not decode; writing the feed from local state',
        expect.objectContaining({ url: feed.url }),
      );
    });

    it('falls back to a fresh created_at without logging the database read failure again', async () => {
      const feed = built();
      vi.spyOn(LocalFeedService, 'read').mockRejectedValue(
        new AppError({
          category: ErrorCategory.Database,
          code: DatabaseErrorCode.QUERY_FAILED,
          message: 'IndexedDB unavailable',
          service: ErrorService.Local,
          operation: 'findById',
        }),
      );
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(5_000_000);

      const result = await FeedApplication.persist({ userId: owner, params: { feed, existingId: feed.id } });

      nowSpy.mockRestore();
      expect(result?.created_at).toBe(5_000_000);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('prepareUpdateParams', () => {
    it('merges changes over the stored row and sanitizes the icon', async () => {
      const feed = built();
      await FeedApplication.persist({ userId: owner, params: { feed } });

      await expect(
        FeedApplication.prepareUpdateParams({ feedId: feed.id, changes: { name: 'Renamed', icon: 'Not Valid!' } }),
      ).resolves.toEqual({ ...feedParams(), name: 'Renamed', icon: 'activity' });
      await expect(
        FeedApplication.prepareUpdateParams({ feedId: feed.id, changes: { content: 'article', reach: 'me' } }),
      ).resolves.toEqual(feedParams({ content: 'article', reach: 'me' }));
    });

    it('throws RECORD_NOT_FOUND when the feed no longer exists locally', async () => {
      await expect(FeedApplication.prepareUpdateParams({ feedId: built().id, changes: {} })).rejects.toMatchObject({
        code: DatabaseErrorCode.RECORD_NOT_FOUND,
      });
    });
  });

  describe('commitDelete', () => {
    it('deletes the row, both stored paths and the stream caches', async () => {
      const feed = built();
      const created = await FeedApplication.persist({ userId: owner, params: { feed } });
      await homeserver.session.storage.putBytes(feedPaths(feed.id).public, feed.body);
      const streamId = await seedStreamCaches(created!);

      await FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } });

      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
      expect(await storedExists(feedPaths(feed.id).private)).toBe(false);
      expect(await storedExists(feedPaths(feed.id).public)).toBe(false);
      expect(await PostStreamModel.findById(streamId)).toBeNull();
      expect(await UnreadPostStreamModel.findById(streamId)).toBeNull();
      expect(homeserver.spies.deleteIdempotent.mock.calls).toEqual([
        [`pubky://${owner}${feedPaths(feed.id).public}`],
        [`pubky://${owner}${feedPaths(feed.id).private}`],
      ]);
    });

    it('removes nothing when the account changed while the delete waited for the sync lock', async () => {
      const feed = built();
      await FeedApplication.persist({ userId: owner, params: { feed } });
      installWebLocks();
      const listing = holdListing();
      let current = true;

      const fetching = FeedApplication.fetchFeeds(owner);
      await listing.taken;
      const deleting = FeedApplication.commitDelete({
        userId: owner,
        params: { feedId: feed.id },
        isCurrent: () => current,
      });
      current = false;
      listing.release();
      await fetching;

      // The delete reports that it did not run, so no caller announces it.
      await expect(deleting).resolves.toBe(false);
      expect(await FeedModel.table.get(feed.id)).toBeDefined();
      expect(await storedExists(feedPaths(feed.id).private)).toBe(true);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });

    it('deletes a row whose stored copy is already gone', async () => {
      const feed = built();
      await FeedModel.upsert({ ...feedParams(), id: feed.id, created_at: 1, updated_at: 1 });

      await expect(FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } })).resolves.toBe(true);

      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
      expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledTimes(2);
    });

    it('throws when the homeserver delete fails', async () => {
      const feed = built();
      await FeedApplication.persist({ userId: owner, params: { feed } });
      homeserver.spies.deleteIdempotent.mockRejectedValue(retriedFailure());

      await expect(FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } })).rejects.toThrow(
        'Failed to PUT to homeserver: 500',
      );
    });

    it('holds the lock until the homeserver DELETE has settled when the local delete fails, then rethrows it', async () => {
      installWebLocks();
      const feed = built();
      await FeedApplication.persist({ userId: owner, params: { feed } });
      homeserver.spies.putBlob.mockClear();
      const failure = localDeleteFailure();
      vi.spyOn(LocalFeedService, 'delete').mockRejectedValueOnce(failure);
      // The homeserver DELETE is in flight (a retry backing off) while the local delete has already failed.
      const released = Promise.withResolvers<void>();
      holdDelete(released.promise);
      const settled: string[] = [];

      const deleting = FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } }).finally(() =>
        settled.push('delete'),
      );
      const creating = FeedApplication.persist({ userId: owner, params: { feed } }).then(() => settled.push('create'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      // The create of the same feed waits: the lock stays held until every started delete has settled.
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
      expect(settled).toEqual([]);

      released.resolve();
      await expect(deleting).rejects.toBe(failure);
      await creating;

      expect(settled).toEqual(['delete', 'create']);
      expect(await FeedModel.table.get(feed.id)).toBeDefined();
      expect(await storedExists(feed.path)).toBe(true);
    });

    it('rethrows the first failure in order when both the local and the homeserver delete fail', async () => {
      const feed = built();
      await FeedApplication.persist({ userId: owner, params: { feed } });
      const failure = localDeleteFailure();
      vi.spyOn(LocalFeedService, 'delete').mockRejectedValueOnce(failure);
      homeserver.spies.deleteIdempotent.mockRejectedValue(refusedWrite());

      await expect(FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } })).rejects.toBe(failure);

      expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledOnce();
    });

    it('refuses an id the data model cannot spell as a validation error', async () => {
      const thrown = await FeedApplication.commitDelete({ userId: owner, params: { feedId: 'feed123' } }).catch(
        (e: unknown) => e,
      );

      expect(thrown).toBeInstanceOf(AppError);
      expect(thrown).toMatchObject({
        code: ValidationErrorCode.INVALID_INPUT,
        service: ErrorService.SocialSpecs,
        operation: 'deletionPaths',
        context: { feedId: 'feed123', code: 'format' },
      });
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
    });
  });

  describe('fetchFeeds', () => {
    it('lists the private feeds, decodes each, converts created_at to milliseconds and persists them', async () => {
      freezeSpecClock(VRT_FROZEN_NOW_MS);
      const first = built();
      const second = built({ tags: [], domain_tags: ['bitcoiner'], reach: 'me', layout: 'cards', content: 'article' });
      await homeserver.session.storage.putBytes(first.path, first.body);
      await homeserver.session.storage.putBytes(second.path, second.body);
      restoreSpecClock();

      const result = await FeedApplication.fetchFeeds(owner);

      expect(homeserver.spies.listAll).toHaveBeenCalledExactlyOnceWith({ baseDirectory: FEEDS_DIRECTORY });
      expect(result).toHaveLength(2);
      expect(await FeedModel.table.get(first.id)).toEqual({
        id: first.id,
        name: 'Bitcoin News',
        icon: 'activity',
        tags: ['bitcoin', 'lightning'],
        domain_tags: [],
        reach: 'all',
        sort: 'recent',
        content: null,
        layout: 'columns',
        created_at: VRT_FROZEN_NOW_MS,
        updated_at: VRT_FROZEN_NOW_MS,
      });
      const secondRow = await FeedModel.table.get(second.id);
      expect(secondRow).toMatchObject({
        tags: [],
        domain_tags: ['bitcoiner'],
        reach: 'me',
        layout: 'cards',
        content: 'article',
        created_at: VRT_FROZEN_NOW_MS,
      });
      expect(buildFeedStreamId(secondRow!, owner)).toBe('timeline:wot_domain:0:long:bitcoiner');
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();
    });

    it('skips a feed with an unknown content kind, one that does not decode and one whose read fails, keeping the rest', async () => {
      const kept = built();
      await homeserver.session.storage.putBytes(kept.path, kept.body);
      // A newer writer's kind, stored under the id its filter hashes to.
      const newer: Feed = { ...kept.object, feed: { ...kept.object.feed, content: 'poll' } };
      await storeRaw(feedId(newer), { ...bodyJson(kept), feed: { ...newer.feed } });
      const garbled = built({ tags: ['garbled'] });
      await homeserver.session.storage.putBytes(garbled.path, new TextEncoder().encode('{'));
      const unreadable = built({ tags: ['unreadable'] });
      await homeserver.session.storage.putBytes(unreadable.path, unreadable.body);
      // The unreadable feed is already known locally: it stays, since the listing still names it.
      await FeedModel.upsert({
        ...feedParams({ tags: ['unreadable'] }),
        id: unreadable.id,
        created_at: 1,
        updated_at: 1,
      });
      const getBytes = homeserver.spies.getBytes.getMockImplementation()!;
      homeserver.spies.getBytes.mockImplementation(async (url) => {
        if (url === unreadable.url) throw retriedFailure();
        return getBytes(url);
      });

      const result = await FeedApplication.fetchFeeds(owner);

      expect(result.map((feed) => feed.id)).toEqual([kept.id]);
      expect((await FeedModel.table.toArray()).map((feed) => feed.id).sort()).toEqual([kept.id, unreadable.id].sort());
      expect(warn).toHaveBeenCalledWith('Skipping feed with an unknown content kind during bootstrap fetch', {
        content: 'poll',
      });
      expect(warn).toHaveBeenCalledWith('Skipping invalid feed during bootstrap fetch', expect.any(Error));
      expect(warn).toHaveBeenCalledWith('Skipping feed during bootstrap fetch due to request failure', {
        feedUri: unreadable.url,
        error: expect.any(AppError),
      });
    });

    it('skips a profile-tag feed whose reach this client does not stream', async () => {
      const unsupported = built({ tags: [], domain_tags: ['bitcoiner'], reach: 'followers' });
      await homeserver.session.storage.putBytes(unsupported.path, unsupported.body);

      await expect(FeedApplication.fetchFeeds(owner)).resolves.toEqual([]);

      expect(await FeedModel.table.count()).toBe(0);
      expect(warn).toHaveBeenCalledWith('Skipping unsupported profile-tag feed during bootstrap fetch', {
        reach: 'followers',
        domainTags: ['bitcoiner'],
      });
    });

    it('reconciles away the rows the listing no longer names, with their stream caches', async () => {
      const listed = built();
      await homeserver.session.storage.putBytes(listed.path, listed.body);
      const deletedElsewhere: FeedModelSchema = {
        ...feedParams({ tags: ['gone'] }),
        id: built({ tags: ['gone'] }).id,
        created_at: 1,
        updated_at: 1,
      };
      const legacyId: FeedModelSchema = {
        ...feedParams({ tags: ['legacy'] }),
        id: 'feed123',
        created_at: 1,
        updated_at: 1,
      };
      await FeedModel.upsert(deletedElsewhere);
      await FeedModel.upsert(legacyId);
      const goneStreamId = await seedStreamCaches(deletedElsewhere);
      const legacyStreamId = await seedStreamCaches(legacyId);

      const result = await FeedApplication.fetchFeeds(owner);

      expect(result.map((feed) => feed.id)).toEqual([listed.id]);
      expect((await FeedModel.table.toArray()).map((feed) => feed.id)).toEqual([listed.id]);
      expect(await PostStreamModel.findById(goneStreamId)).toBeNull();
      expect(await UnreadPostStreamModel.findById(goneStreamId)).toBeNull();
      expect(await PostStreamModel.findById(legacyStreamId)).toBeNull();
      expect(await UnreadPostStreamModel.findById(legacyStreamId)).toBeNull();
    });

    it('waits for a feed whose create is still syncing instead of removing it', async () => {
      const inFlight = built({ tags: ['syncing'] });
      const landed = Promise.withResolvers<void>();
      holdPut(landed.promise);
      const creating = FeedApplication.persist({ userId: owner, params: { feed: inFlight } });
      await vi.waitFor(async () => expect(await FeedModel.table.get(inFlight.id)).toBeDefined());

      // The fetch holds the sync lock exclusively: it lists only once the create has landed.
      let fetched: FeedModelSchema[] | null = null;
      const fetching = FeedApplication.fetchFeeds(owner).then((feeds) => (fetched = feeds));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fetched).toBeNull();
      expect(homeserver.spies.listAll).not.toHaveBeenCalled();

      landed.resolve();
      await creating;
      await fetching;

      expect(fetched!.map((feed) => feed.id)).toEqual([inFlight.id]);
      expect((await FeedModel.table.toArray()).map((feed) => feed.id)).toEqual([inFlight.id]);
      expect(await storedExists(inFlight.path)).toBe(true);
    });

    it('holds the per-user Web Lock exclusive for the writes and for the fetch', async () => {
      const locks = createTestWebLocks();
      const request = vi.spyOn(locks, 'request');
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
      try {
        const feed = built();
        await FeedApplication.persist({ userId: owner, params: { feed } });
        await FeedApplication.fetchFeeds(owner);
        await FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } });
      } finally {
        Reflect.deleteProperty(navigator, 'locks');
      }

      expect(request.mock.calls.map(([name, options]) => [name, (options as LockOptions).mode])).toEqual([
        [`pubky-feeds-sync:${owner}`, 'exclusive'],
        [`pubky-feeds-sync:${owner}`, 'exclusive'],
        [`pubky-feeds-sync:${owner}`, 'exclusive'],
      ]);
    });

    it('runs a delete of a feed only once its create has landed, so the file goes with the row', async () => {
      installWebLocks();
      const feed = built();
      const landed = Promise.withResolvers<void>();
      holdPut(landed.promise);
      const settled: string[] = [];

      // The row is written and the create's PUT is in flight (a retry backing off): the delete waits.
      const creating = FeedApplication.persist({ userId: owner, params: { feed } }).then(() => settled.push('create'));
      await vi.waitFor(async () => expect(await FeedModel.table.get(feed.id)).toBeDefined());
      const deleting = FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } }).then(() =>
        settled.push('delete'),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await FeedModel.table.get(feed.id)).toBeDefined();
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();

      landed.resolve();
      await Promise.all([creating, deleting]);

      expect(settled).toEqual(['create', 'delete']);
      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
      expect(await storedExists(feed.path)).toBe(false);
    });

    it('touches no local row once the account is no longer current', async () => {
      const previousAccount = built();
      await homeserver.session.storage.putBytes(previousAccount.path, previousAccount.body);
      const nextAccount: FeedModelSchema = {
        ...feedParams({ tags: ['next'] }),
        id: built({ tags: ['next'] }).id,
        created_at: 1,
        updated_at: 1,
      };
      await FeedModel.upsert(nextAccount);
      const streamId = await seedStreamCaches(nextAccount);

      await expect(FeedApplication.fetchFeeds(owner, { isCurrent: () => false })).resolves.toEqual([]);

      expect(await FeedModel.table.toArray()).toEqual([nextAccount]);
      expect(await PostStreamModel.findById(streamId)).not.toBeNull();
      expect(await UnreadPostStreamModel.findById(streamId)).not.toBeNull();
    });

    it('returns no feeds and clears every row for an empty directory', async () => {
      await FeedModel.upsert({ ...feedParams(), id: built().id, created_at: 1, updated_at: 1 });

      await expect(FeedApplication.fetchFeeds(owner)).resolves.toEqual([]);

      expect(await FeedModel.table.count()).toBe(0);
    });

    it('ignores a file in the directory that is no feed', async () => {
      const feed = built();
      await homeserver.session.storage.putBytes(feed.path, feed.body);
      await homeserver.session.storage.putBytes('/priv/social/v1/feeds/notes.txt', new TextEncoder().encode('hi'));

      const result = await FeedApplication.fetchFeeds(owner);

      expect(result.map((item) => item.id)).toEqual([feed.id]);
      expect(await FeedModel.table.count()).toBe(1);
    });

    it('propagates a listing failure without touching the local rows', async () => {
      await FeedModel.upsert({ ...feedParams(), id: built().id, created_at: 1, updated_at: 1 });
      homeserver.spies.listAll.mockRejectedValue(retriedFailure());

      await expect(FeedApplication.fetchFeeds(owner)).rejects.toBeInstanceOf(AppError);

      expect(await FeedModel.table.count()).toBe(1);
    });
  });

  describe('a read that never answers', () => {
    // Only the timers are faked: IndexedDB schedules its work with `setImmediate`.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Holds the next LIST page as an SDK read that never answers; `taken` resolves once it is out. */
    const hangListing = () => {
      const taken = Promise.withResolvers<void>();
      const answer = Promise.withResolvers<string[]>();
      homeserver.spies.list.mockImplementationOnce(() => {
        taken.resolve();
        return answer.promise;
      });
      return { taken: taken.promise, answer: (urls: string[]) => answer.resolve(urls) };
    };
    /** Holds the GET of `url` as an SDK read that never answers; every other GET answers as before. */
    const hangRead = (url: string) => {
      const taken = Promise.withResolvers<void>();
      const answer = Promise.withResolvers<Uint8Array>();
      const getBytes = homeserver.spies.getBytes.getMockImplementation()!;
      homeserver.spies.getBytes.mockImplementation((read) => {
        if (read !== url) return getBytes(read);
        taken.resolve();
        return answer.promise;
      });
      return { taken: taken.promise, answer: (bytes: Uint8Array) => answer.resolve(bytes) };
    };
    /** Holds the fenced re-read of the stored copy at `url` (`getBytesIfExists`) as an SDK read that never answers. */
    const hangStoredRead = (url: string) => {
      const taken = Promise.withResolvers<void>();
      const answer = Promise.withResolvers<null>();
      const read = homeserver.spies.getBytesIfExists.getMockImplementation()!;
      homeserver.spies.getBytesIfExists.mockImplementation((readUrl, session) => {
        if (readUrl !== url) return read(readUrl, session);
        taken.resolve();
        return answer.promise;
      });
      return { taken: taken.promise, answer: () => answer.resolve(null) };
    };
    /** Lets the pending microtasks and IndexedDB work run; the faked timers stay where they are. */
    const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

    it('lets a create queued behind the LIST run once the wait is bounded, and applies nothing the LIST answers late', async () => {
      installWebLocks();
      const feed = built();
      const listing = hangListing();

      const fetching = FeedApplication.fetchFeeds(owner).then(
        () => null,
        (error: unknown) => error,
      );
      await listing.taken;
      const creating = FeedApplication.persist({ userId: owner, params: { feed } });
      await settle();
      // The create waits for the lock the listing holds: nothing written, locally or on the homeserver.
      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

      expect(await fetching).toMatchObject({
        category: ErrorCategory.Timeout,
        code: TimeoutErrorCode.REQUEST_TIMEOUT,
        service: ErrorService.Homeserver,
        operation: 'fetchFeeds',
      });
      await expect(creating).resolves.toMatchObject({ id: feed.id });
      expect(await FeedModel.table.get(feed.id)).toBeDefined();
      expect(await storedExists(feed.path)).toBe(true);

      // The abandoned LIST answers now, from before the create: its reconcile would have removed the row, but
      // the fetch stopped at the read, so nothing applies it.
      listing.answer([]);
      await settle();
      expect(await FeedModel.table.get(feed.id)).toBeDefined();
    });

    it('skips a feed whose GET never answers once the wait is bounded, keeping its row and the rest, and applies nothing late', async () => {
      const kept = built();
      const hung = built({ tags: ['hung'] });
      await homeserver.session.storage.putBytes(kept.path, kept.body);
      await homeserver.session.storage.putBytes(hung.path, hung.body);
      const hungRow: FeedModelSchema = {
        ...feedParams({ tags: ['hung'] }),
        id: hung.id,
        created_at: 1,
        updated_at: 1,
      };
      await FeedModel.upsert(hungRow);
      const hungUri = buildUri(owner, 'feed', hung.id);
      const reading = hangRead(hungUri);

      const fetching = FeedApplication.fetchFeeds(owner);
      await reading.taken;
      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

      expect((await fetching).map((feed) => feed.id)).toEqual([kept.id]);
      expect(warn).toHaveBeenCalledWith('Skipping feed during bootstrap fetch due to request failure', {
        feedUri: hungUri,
        error: expect.objectContaining({ code: TimeoutErrorCode.REQUEST_TIMEOUT }),
      });
      // Listed, so kept as it was; the stored copy is read again on the next fetch.
      expect(await FeedModel.table.get(hung.id)).toEqual(hungRow);
      expect(await FeedModel.table.get(kept.id)).toMatchObject({ id: kept.id, name: 'Bitcoin News' });

      // The abandoned GET answers now: nothing applies it.
      reading.answer(hung.body);
      await settle();
      expect(await FeedModel.table.get(hung.id)).toEqual(hungRow);
    });

    it('rolls a create back once the bounded wait for its fenced re-read ends, runs the queued write, and applies nothing late', async () => {
      installWebLocks();
      const hung = built();
      const next = built({ tags: ['next'] });
      const reading = hangStoredRead(buildUri(owner, 'feed', hung.id));

      const creating = FeedApplication.persist({ userId: owner, params: { feed: hung } }).then(
        () => null,
        (error: unknown) => error,
      );
      await reading.taken;
      // The row is written and the write's re-read is out: the next write waits for the lock.
      expect(await FeedModel.table.get(hung.id)).toBeDefined();
      const queued = FeedApplication.persist({ userId: owner, params: { feed: next } }).then(
        (row) => row,
        (error: unknown) => error,
      );
      await settle();
      expect(await FeedModel.table.get(next.id)).toBeUndefined();
      expect(homeserver.spies.putBlob).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(HOMESERVER_SYNC_READ_TIMEOUT_MS);

      expect(await creating).toMatchObject({
        category: ErrorCategory.Timeout,
        code: TimeoutErrorCode.REQUEST_TIMEOUT,
        service: ErrorService.Homeserver,
        operation: 'readStoredFeed',
      });
      // Rolled back as after any failed pass of the PUT: no row, no file.
      expect(await FeedModel.table.get(hung.id)).toBeUndefined();
      expect(await storedExists(hung.path)).toBe(false);
      expect(await queued).toMatchObject({ id: next.id });
      expect(await storedExists(next.path)).toBe(true);
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);

      // The abandoned re-read answers now: the write stopped at the read, so no PUT follows it.
      reading.answer();
      await settle();
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);
      expect(await storedExists(hung.path)).toBe(false);
    });
  });

  describe('feeds of external resources (target)', () => {
    const resources = (overrides: Partial<TFeedCreateParams> = {}) => built({ target: 'resources', ...overrides });

    it('keeps the id and the bytes a post feed always had, and gives a resources feed its own', async () => {
      // The id 1.0.0-rc.1, which had no target, gave this filter
      const post = built();
      expect(post.id).toBe('E82XC9WBRFDCEAPPAKBC8ZE1EM');
      expect(built({ target: 'posts' }).id).toBe(post.id);
      expect(bodyJson(post).feed).not.toHaveProperty('target');

      const feed = resources();
      expect(feed.id).not.toBe(post.id);
      expect(bodyJson(feed).feed).toMatchObject({ target: 'resources', content: null });
      expect(feed.path).toBe(feedPaths(feed.id).private);
    });

    it('refuses profile tags on a resources feed, as the data model does', () => {
      expect(() => resources({ domain_tags: ['dev'], reach: 'wot' })).toThrow(AppError);
    });

    it('creates, reloads, edits and reopens a resources feed with its target, tags, sort and layout', async () => {
      const feed = resources({ tags: ['music'], layout: 'cards' });
      const created = await FeedApplication.persist({ userId: owner, params: { feed } });
      expect(created).toMatchObject({ id: feed.id, target: 'resources', content: null, tags: ['music'] });

      // Reload from the homeserver into a fresh table: the row comes back as it was
      await FeedModel.table.clear();
      const [reloaded] = await FeedApplication.fetchFeeds(owner);
      expect(reloaded).toMatchObject({
        id: feed.id,
        target: 'resources',
        content: null,
        tags: ['music'],
        domain_tags: [],
        reach: 'all',
        sort: 'recent',
        layout: 'cards',
      });
      expect(buildFeedStreamId(reloaded, owner)).toBeNull();

      // A rename keeps the target, so the id
      const params = await FeedApplication.prepareUpdateParams({ feedId: feed.id, changes: { name: 'Songs' } });
      expect(params).toMatchObject({ target: 'resources', content: null, tags: ['music'], layout: 'cards' });
      const renamed = FeedNormalizer.to({ params, userId: owner });
      expect(renamed.id).toBe(feed.id);
      const updated = await FeedApplication.persist({ userId: owner, params: { feed: renamed, existingId: feed.id } });
      expect(updated).toMatchObject({ id: feed.id, name: 'Songs', target: 'resources' });
      expect((await storedFeed(feed.id)).feed.target).toBe('resources');
    });

    it('keeps a post feed and the resources feed of the same filter apart: rows, paths and stream caches', async () => {
      const post = built();
      const feed = resources();
      const postRow = (await FeedApplication.persist({ userId: owner, params: { feed: post } }))!;
      const resourceRow = (await FeedApplication.persist({ userId: owner, params: { feed } }))!;
      const postStreamId = await seedStreamCaches(postRow);

      expect(postRow).not.toHaveProperty('target');
      expect(resourceRow.target).toBe('resources');
      expect(buildFeedStreamId(resourceRow, owner)).toBeNull();
      expect((await storedFeed(post.id)).feed.target).toBeNull();

      await FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } });

      expect(await FeedModel.table.get(post.id)).toEqual(postRow);
      expect(await storedExists(feedPaths(post.id).private)).toBe(true);
      expect(await PostStreamModel.findById(postStreamId)).not.toBeNull();
      expect(await UnreadPostStreamModel.findById(postStreamId)).not.toBeNull();
    });

    it('moves a post feed to its resources id and back through the edit migration', async () => {
      const post = built();
      const created = (await FeedApplication.persist({ userId: owner, params: { feed: post } }))!;
      const oldStreamId = await seedStreamCaches(created);

      const toResources = FeedNormalizer.to({
        params: await FeedApplication.prepareUpdateParams({ feedId: post.id, changes: { target: 'resources' } }),
        userId: owner,
      });
      const moved = (await FeedApplication.persist({
        userId: owner,
        params: { feed: toResources, existingId: post.id },
      }))!;

      expect(moved).toMatchObject({ id: toResources.id, target: 'resources', created_at: created.created_at });
      expect(toResources.id).not.toBe(post.id);
      expect(await FeedModel.table.get(post.id)).toBeUndefined();
      expect(await storedExists(feedPaths(post.id).private)).toBe(false);
      expect(await PostStreamModel.findById(oldStreamId!)).toBeNull();
      expect(await UnreadPostStreamModel.findById(oldStreamId!)).toBeNull();

      const toPosts = FeedNormalizer.to({
        params: await FeedApplication.prepareUpdateParams({ feedId: moved.id, changes: { target: 'posts' } }),
        userId: owner,
      });
      const back = (await FeedApplication.persist({ userId: owner, params: { feed: toPosts, existingId: moved.id } }))!;

      expect(back.id).toBe(post.id);
      expect(back).not.toHaveProperty('target');
      expect(await storedExists(feedPaths(moved.id).private)).toBe(false);
      expect(bodyJson(toPosts).feed).not.toHaveProperty('target');
    });

    it('keeps a feed of some schema.org types through create, reload, edit and reopen, under its own id', async () => {
      const every = resources({ tags: ['music'] });
      const feed = resources({ tags: ['music'], resource_types: ['MusicRecording', 'MusicAlbum'] });
      // The types take the content segment, stored sorted: three feeds with three ids
      expect(new Set([feed.id, every.id, built({ tags: ['music'] }).id]).size).toBe(3);
      expect(bodyJson(feed).feed).toMatchObject({ target: 'resources', content: 'MusicAlbum,MusicRecording' });
      expect(resources({ tags: ['music'], resource_types: ['MusicAlbum', 'MusicRecording'] }).id).toBe(feed.id);

      const created = await FeedApplication.persist({ userId: owner, params: { feed } });
      const types = ['MusicAlbum', 'MusicRecording'];
      expect(created).toMatchObject({ id: feed.id, target: 'resources', resource_types: types, content: null });

      await FeedModel.table.clear();
      const [reloaded] = await FeedApplication.fetchFeeds(owner);
      expect(reloaded).toMatchObject({ id: feed.id, target: 'resources', resource_types: types, content: null });

      const renamed = FeedNormalizer.to({
        params: await FeedApplication.prepareUpdateParams({ feedId: feed.id, changes: { name: 'Songs' } }),
        userId: owner,
      });
      expect(renamed.id).toBe(feed.id);

      // Every type again moves it to the id of every resource
      const widened = FeedNormalizer.to({
        params: await FeedApplication.prepareUpdateParams({ feedId: feed.id, changes: { resource_types: null } }),
        userId: owner,
      });
      expect(widened.id).toBe(every.id);
      const moved = await FeedApplication.persist({ userId: owner, params: { feed: widened, existingId: feed.id } });
      expect(moved).not.toHaveProperty('resource_types');
      expect(await storedExists(feedPaths(feed.id).private)).toBe(false);
    });

    it('keeps a resources feed’s saved filters through create, reload and edit, under their own id', async () => {
      const plain = resources({ tags: ['concert'], resource_types: ['Event'] });
      const filters = { when: 'week', near: '47.37,8.54', radius: '50', place: 'Zürich' };
      const feed = resources({ tags: ['concert'], resource_types: ['Event'], resource_filters: filters });
      expect(feed.id).not.toBe(plain.id);
      expect(bodyJson(feed).feed).toMatchObject({ target: 'resources', content: 'Event', filters });
      // The point's name is no filter: renaming the place keeps the id
      expect(
        resources({ tags: ['concert'], resource_types: ['Event'], resource_filters: { ...filters, place: 'Zurich' } })
          .id,
      ).toBe(feed.id);

      const created = await FeedApplication.persist({ userId: owner, params: { feed } });
      expect(created).toMatchObject({ id: feed.id, resource_types: ['Event'], resource_filters: filters });
      await FeedModel.table.clear();
      const [reloaded] = await FeedApplication.fetchFeeds(owner);
      expect(reloaded).toEqual({ ...created, created_at: reloaded.created_at, updated_at: reloaded.updated_at });

      // Clearing them moves it to the id it has without
      const cleared = FeedNormalizer.to({
        params: await FeedApplication.prepareUpdateParams({ feedId: feed.id, changes: { resource_filters: null } }),
        userId: owner,
      });
      expect(cleared.id).toBe(plain.id);
      const moved = await FeedApplication.persist({ userId: owner, params: { feed: cleared, existingId: feed.id } });
      expect(moved).not.toHaveProperty('resource_filters');
      expect(bodyJson(cleared).feed).not.toHaveProperty('filters');
      // The feed under the old id is gone: its row and its stored object
      expect(await FeedModel.table.get(feed.id)).toBeUndefined();
      expect(await FeedModel.table.get(plain.id)).toEqual(moved);
      expect(await storedExists(feedPaths(feed.id).private)).toBe(false);
      expect(homeserver.spies.deleteIdempotent).toHaveBeenCalledWith(`pubky://${owner}${feedPaths(feed.id).private}`);
    });

    it('edits only the place’s name in place: same feed, no delete, the new name written', async () => {
      const filters = { when: 'week', near: '47.37,8.54', place: 'Zürich' };
      const feed = resources({ tags: ['concert'], resource_types: ['Event'], resource_filters: filters });
      await FeedApplication.persist({ userId: owner, params: { feed } });
      homeserver.spies.putBlob.mockClear();

      const renamed = FeedNormalizer.to({
        params: await FeedApplication.prepareUpdateParams({
          feedId: feed.id,
          changes: { resource_filters: { ...filters, place: 'Zürich Altstadt' } },
        }),
        userId: owner,
      });
      expect(renamed.id).toBe(feed.id);
      const edited = await FeedApplication.persist({ userId: owner, params: { feed: renamed, existingId: feed.id } });

      expect(edited).toMatchObject({ id: feed.id, resource_filters: { ...filters, place: 'Zürich Altstadt' } });
      expect(await FeedModel.table.get(feed.id)).toEqual(edited);
      expect(await FeedModel.table.count()).toBe(1);
      expect(homeserver.spies.deleteIdempotent).not.toHaveBeenCalled();
      expect(homeserver.spies.putBlob).toHaveBeenCalledTimes(1);
      expect((await storedFeed(feed.id)).feed.filters).toMatchObject({ place: 'Zürich Altstadt', near: '47.37,8.54' });
    });

    it('stores no filters on a post feed', () => {
      expect(bodyJson(built({ tags: ['music'], resource_filters: { when: 'week' } })).feed).not.toHaveProperty(
        'filters',
      );
    });

    it('round-trips a feed of one schema.org type with no local content filter', async () => {
      const feed = resources({ tags: ['film'], resource_types: ['VideoObject'] });

      const created = await FeedApplication.persist({ userId: owner, params: { feed } });

      expect(created).toMatchObject({ target: 'resources', resource_types: ['VideoObject'], content: null });
      await FeedModel.table.clear();
      const [reloaded] = await FeedApplication.fetchFeeds(owner);
      // The same row, but for the times (the reload reads the stored microseconds)
      expect(reloaded).toEqual({ ...created, created_at: reloaded.created_at, updated_at: reloaded.updated_at });
    });

    it('skips a resources feed whose content is no type list (an older draft saved a family)', async () => {
      const kept = built();
      await homeserver.session.storage.putBytes(kept.path, kept.body);
      const every = resources({ tags: ['music'] });
      await storeRaw(every.id, { ...bodyJson(every), feed: { ...every.object.feed, content: 'music' } });

      const result = await FeedApplication.fetchFeeds(owner);

      expect(result.map((feed) => feed.id)).toEqual([kept.id]);
      expect(warn).toHaveBeenCalledWith('Skipping invalid feed during bootstrap fetch', expect.any(Error));
    });

    it('skips a feed whose target this data model does not know, keeping the rest', async () => {
      const kept = built();
      await homeserver.session.storage.putBytes(kept.path, kept.body);
      const unknown = built({ tags: ['events'] });
      await storeRaw(unknown.id, { ...bodyJson(unknown), feed: { ...unknown.object.feed, target: 'events' } });

      const result = await FeedApplication.fetchFeeds(owner);

      expect(result.map((feed) => feed.id)).toEqual([kept.id]);
      expect(warn).toHaveBeenCalledWith('Skipping invalid feed during bootstrap fetch', expect.any(Error));
    });
  });
});
