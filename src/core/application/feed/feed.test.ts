import { buildUri, decodeObject, type Feed, feedId, feedPaths, listPrefix } from 'pubky-social-specs';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { db } from '@/database/franky/franky';
import { AppError } from '@/libs/error/error';
import { ClientErrorCode, DatabaseErrorCode, ServerErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
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

  afterEach(() => {
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

    it('persists profile tags and the v1 content kind, keeping the Nexus stream id in the 0.x vocabulary', async () => {
      const tagged = built({ tags: [], domain_tags: ['bitcoiner', '🔥'], reach: 'wot', layout: 'cards' });
      const notes = built({ content: 'note', sort: 'popularity' });

      const taggedRow = await FeedApplication.persist({ userId: owner, params: { feed: tagged } });
      const notesRow = await FeedApplication.persist({ userId: owner, params: { feed: notes } });

      expect(taggedRow).toMatchObject({ tags: [], domain_tags: ['bitcoiner', '🔥'], reach: 'wot', layout: 'cards' });
      expect((await storedFeed(tagged.id)).feed).toMatchObject({ tags: null, domain_tags: ['bitcoiner', '🔥'] });
      expect(buildFeedStreamId(taggedRow, owner)).toBe('timeline:wot_domain:2:all:bitcoiner,🔥');
      expect(notesRow.content).toBe('note');
      expect((await storedFeed(notes.id)).feed.content).toBe('note');
      expect(buildFeedStreamId(notesRow, owner)).toBe('total_engagement:all:short:bitcoin,lightning');
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

      expect(result).toMatchObject({ id: feed.id, name: 'Renamed', icon: 'rss', created_at: created.created_at });
      expect(result.updated_at).toBeGreaterThanOrEqual(created.updated_at);
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
      const oldStreamId = await seedStreamCaches(created);
      const moved = built({ sort: 'popularity' });
      expect(moved.id).not.toBe(feed.id);

      const result = await FeedApplication.persist({ userId: owner, params: { feed: moved, existingId: feed.id } });

      expect(result).toMatchObject({ id: moved.id, sort: 'popularity', created_at: created.created_at });
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

      expect(result.id).toBe(moved.id);
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
      expect(result.created_at).toBe(5_000_000);
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
      const streamId = await seedStreamCaches(created);

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

    it('deletes a row whose stored copy is already gone', async () => {
      const feed = built();
      await FeedModel.upsert({ ...feedParams(), id: feed.id, created_at: 1, updated_at: 1 });

      await expect(
        FeedApplication.commitDelete({ userId: owner, params: { feedId: feed.id } }),
      ).resolves.toBeUndefined();

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

    it('leaves a feed whose create is still syncing alone', async () => {
      const inFlight = built({ tags: ['syncing'] });
      const putBlob = homeserver.spies.putBlob.getMockImplementation()!;
      const landed = Promise.withResolvers<void>();
      homeserver.spies.putBlob.mockImplementationOnce(async (params) => {
        await landed.promise;
        return putBlob(params);
      });
      const creating = FeedApplication.persist({ userId: owner, params: { feed: inFlight } });
      await vi.waitFor(async () => expect(await FeedModel.table.get(inFlight.id)).toBeDefined());

      await expect(FeedApplication.fetchFeeds(owner)).resolves.toEqual([]);
      landed.resolve();
      await creating;

      expect((await FeedModel.table.toArray()).map((feed) => feed.id)).toEqual([inFlight.id]);
      expect(await storedExists(inFlight.path)).toBe(true);
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
});
