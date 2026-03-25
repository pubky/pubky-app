import { describe, it, expect, beforeEach } from 'vitest';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import * as Core from '@/core';

describe('LocalFeedService', () => {
  const createFeedSchema = (overrides: Partial<Core.FeedModelSchema> = {}): Core.FeedModelSchema => ({
    id: 'feed-default',
    name: 'Bitcoin News',
    tags: ['bitcoin', 'lightning'],
    reach: PubkyAppFeedReach.All,
    sort: PubkyAppFeedSort.Recent,
    content: null,
    layout: PubkyAppFeedLayout.Columns,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  });

  beforeEach(async () => {
    await Core.db.initialize();
    await Core.FeedModel.table.clear();
  });

  describe('persist', () => {
    it('should create a new feed', async () => {
      const feed = createFeedSchema({ id: 'feed-new' });

      const persistedFeed = await Core.LocalFeedService.createOrUpdate(feed);

      expect(persistedFeed).toBeTruthy();
      expect(persistedFeed.id).toBe('feed-new');
      expect(persistedFeed.name).toBe(feed.name);

      const saved = await Core.FeedModel.table.get(persistedFeed.id);
      expect(saved).toBeTruthy();
      expect(saved!.id).toBe(persistedFeed.id);
    });

    it('should update an existing feed', async () => {
      const feed = createFeedSchema({ id: 'feed-update' });
      const createdFeed = await Core.LocalFeedService.createOrUpdate(feed);

      const updated = { ...createdFeed, name: 'Updated Name', tags: ['newTag'] };
      const updatedFeed = await Core.LocalFeedService.createOrUpdate(updated);

      expect(updatedFeed.id).toBe('feed-update');
      expect(updatedFeed.name).toBe('Updated Name');
      expect(updatedFeed.tags).toEqual(['newTag']);
    });

    it('should preserve created_at on update', async () => {
      const originalCreatedAt = Date.now() - 10000;
      const feed = createFeedSchema({ id: 'feed-timestamps', created_at: originalCreatedAt });
      const createdFeed = await Core.LocalFeedService.createOrUpdate(feed);

      const updated = { ...createdFeed, name: 'Updated', updated_at: Date.now() };
      const updatedFeed = await Core.LocalFeedService.createOrUpdate(updated);

      expect(updatedFeed.created_at).toBe(originalCreatedAt);
      expect(updatedFeed.updated_at).toBeGreaterThan(originalCreatedAt);
    });

    it('should handle multiple feeds with unique IDs', async () => {
      const feed1 = createFeedSchema({ id: 'feed-1', name: 'Feed 1' });
      const feed2 = createFeedSchema({ id: 'feed-2', name: 'Feed 2' });
      const feed3 = createFeedSchema({ id: 'feed-3', name: 'Feed 3' });

      const persisted1 = await Core.LocalFeedService.createOrUpdate(feed1);
      const persisted2 = await Core.LocalFeedService.createOrUpdate(feed2);
      const persisted3 = await Core.LocalFeedService.createOrUpdate(feed3);

      expect(persisted1.id).toBe('feed-1');
      expect(persisted2.id).toBe('feed-2');
      expect(persisted3.id).toBe('feed-3');
    });
  });

  describe('delete', () => {
    it('should delete a feed by ID', async () => {
      const feed = createFeedSchema({ id: 'feed-delete' });
      await Core.LocalFeedService.createOrUpdate(feed);

      await Core.LocalFeedService.delete({ feedId: 'feed-delete' });

      const saved = await Core.FeedModel.table.get('feed-delete');
      expect(saved).toBeUndefined();
    });

    it('should not throw when deleting non-existent feed', async () => {
      await expect(Core.LocalFeedService.delete({ feedId: 'nonexistent' })).resolves.not.toThrow();
    });
  });

  describe('read', () => {
    it('should find feed by ID', async () => {
      const feed = createFeedSchema({ id: 'feed-read' });
      await Core.LocalFeedService.createOrUpdate(feed);

      const found = await Core.LocalFeedService.read({ feedId: 'feed-read' });

      expect(found).toBeTruthy();
      expect(found!.id).toBe('feed-read');
      expect(found!.name).toBe(feed.name);
    });

    it('should throw RECORD_NOT_FOUND error when not found', async () => {
      await expect(Core.LocalFeedService.read({ feedId: 'nonexistent' })).rejects.toMatchObject({
        name: 'AppError',
        code: 'RECORD_NOT_FOUND',
        category: 'database',
      });
    });
  });

  describe('findAll', () => {
    it('should return all feeds sorted by created_at', async () => {
      const now = Date.now();
      const feed1 = createFeedSchema({ id: 'feed-oldest', name: 'Oldest', created_at: now - 2000 });
      const feed2 = createFeedSchema({ id: 'feed-middle', name: 'Middle', created_at: now - 1000 });
      const feed3 = createFeedSchema({ id: 'feed-newest', name: 'Newest', created_at: now });

      await Core.LocalFeedService.createOrUpdate(feed2);
      await Core.LocalFeedService.createOrUpdate(feed1);
      await Core.LocalFeedService.createOrUpdate(feed3);

      const feeds = await Core.LocalFeedService.readAll();

      expect(feeds).toHaveLength(3);
      expect(feeds[0].name).toBe('Newest');
      expect(feeds[1].name).toBe('Middle');
      expect(feeds[2].name).toBe('Oldest');
    });

    it('should return empty array when no feeds exist', async () => {
      const feeds = await Core.LocalFeedService.readAll();

      expect(feeds).toEqual([]);
    });
  });

  describe('createOrUpdateMany', () => {
    it('should persist multiple feeds in a single transaction', async () => {
      const feeds = [
        createFeedSchema({ id: 'feed-batch-1', name: 'Feed 1' }),
        createFeedSchema({ id: 'feed-batch-2', name: 'Feed 2' }),
        createFeedSchema({ id: 'feed-batch-3', name: 'Feed 3' }),
      ];

      const result = await Core.LocalFeedService.createOrUpdateMany(feeds);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('feed-batch-1');
      expect(result[1].id).toBe('feed-batch-2');
      expect(result[2].id).toBe('feed-batch-3');

      const saved = await Core.LocalFeedService.readAll();
      expect(saved).toHaveLength(3);
    });

    it('should upsert existing feeds by ID', async () => {
      await Core.LocalFeedService.createOrUpdate(createFeedSchema({ id: 'feed-upsert', name: 'Original' }));

      await Core.LocalFeedService.createOrUpdateMany([
        createFeedSchema({ id: 'feed-upsert', name: 'Updated' }),
        createFeedSchema({ id: 'feed-new', name: 'New' }),
      ]);

      const upserted = await Core.LocalFeedService.read({ feedId: 'feed-upsert' });
      expect(upserted.name).toBe('Updated');

      const all = await Core.LocalFeedService.readAll();
      expect(all).toHaveLength(2);
    });

    it('should return empty array when given empty input', async () => {
      const result = await Core.LocalFeedService.createOrUpdateMany([]);

      expect(result).toEqual([]);
    });
  });

  describe('transaction safety', () => {
    it('should handle multiple concurrent persists', async () => {
      const feeds = Array.from({ length: 5 }, (_, i) =>
        createFeedSchema({ id: `feed-concurrent-${i}`, name: `Feed ${i}` }),
      );

      const persistedFeeds = await Promise.all(feeds.map((feed) => Core.LocalFeedService.createOrUpdate(feed)));

      const ids = persistedFeeds.map((f) => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);

      const saved = await Core.LocalFeedService.readAll();
      expect(saved).toHaveLength(5);
    });
  });
});
