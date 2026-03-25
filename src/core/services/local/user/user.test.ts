import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Core from '@/core';
import { LocalUserService } from './user';

describe('LocalUserService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Core.UserDetailsModel.table.clear();
    await Core.UserRelationshipsModel.table.clear();
    await Core.UserCountsModel.table.clear();
    await Core.UserTtlModel.table.clear();
  });

  describe('readDetails', () => {
    const userId = 'test-user-id' as Core.Pubky;

    it('should return user details from local database when found', async () => {
      const mockUserDetails: Core.NexusUserDetails = {
        id: userId,
        name: 'Test User',
        bio: 'Test bio',
        image: 'https://example.com/avatar.jpg',
        status: 'active',
        links: [{ title: 'Website', url: 'https://example.com' }],
        indexed_at: Date.now(),
      };

      await Core.UserDetailsModel.create(mockUserDetails);

      const result = await LocalUserService.readDetails({ userId });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(userId);
      expect(result!.name).toBe('Test User');
      expect(result!.bio).toBe('Test bio');
      expect(result!.image).toBe('https://example.com/avatar.jpg');
      expect(result!.status).toBe('active');
      expect(result!.links).toEqual([{ title: 'Website', url: 'https://example.com' }]);
    });

    it('should return null when user not found in local database', async () => {
      const result = await LocalUserService.readDetails({ userId });

      expect(result).toBeNull();
    });

    it('should handle user with minimal fields', async () => {
      const minimalUserDetails: Core.NexusUserDetails = {
        id: userId,
        name: 'Minimal User',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };

      await Core.UserDetailsModel.create(minimalUserDetails);

      const result = await LocalUserService.readDetails({ userId });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(userId);
      expect(result!.name).toBe('Minimal User');
      expect(result!.bio).toBe('');
      expect(result!.image).toBeNull();
      expect(result!.status).toBeNull();
      expect(result!.links).toBeNull();
    });
  });

  describe('readRelationships', () => {
    const userId = 'test-user-id' as Core.Pubky;

    it('should return user relationships from local database when found', async () => {
      const mockRelationships: Core.UserRelationshipsModelSchema = {
        id: userId,
        following: true,
        followed_by: true,
      };

      await Core.UserRelationshipsModel.create(mockRelationships);

      const result = await LocalUserService.readRelationships({ userId });

      expect(result).not.toBeNull();
      expect(result!.following).toBe(true);
      expect(result!.followed_by).toBe(true);
    });

    it('should return null when user relationships not found in local database', async () => {
      const result = await LocalUserService.readRelationships({ userId });

      expect(result).toBeNull();
    });

    it('should handle user with all false relationships', async () => {
      const emptyRelationships: Core.UserRelationshipsModelSchema = {
        id: userId,
        following: false,
        followed_by: false,
      };

      await Core.UserRelationshipsModel.create(emptyRelationships);

      const result = await LocalUserService.readRelationships({ userId });

      expect(result).not.toBeNull();
      expect(result!.following).toBe(false);
      expect(result!.followed_by).toBe(false);
    });
  });

  describe('updateCounts', () => {
    const userId = 'test-user-id' as Core.Pubky;

    it('should update user counts by applying count changes', async () => {
      const initialCounts: Core.UserCountsModelSchema = {
        id: userId,
        tagged: 0,
        tags: 0,
        unique_tags: 0,
        posts: 5,
        replies: 2,
        following: 10,
        followers: 20,
        friends: 5,
        bookmarks: 3,
      };

      await Core.UserCountsModel.create(initialCounts);

      await LocalUserService.updateCounts({
        userId,
        countChanges: { posts: 1, replies: 1 },
      });

      const result = await Core.UserCountsModel.findById(userId);

      expect(result).not.toBeNull();
      expect(result!.posts).toBe(6);
      expect(result!.replies).toBe(3);
      expect(result!.following).toBe(10);
    });

    it('should not go below zero when decrementing counts', async () => {
      const initialCounts: Core.UserCountsModelSchema = {
        id: userId,
        tagged: 0,
        tags: 0,
        unique_tags: 0,
        posts: 1,
        replies: 0,
        following: 0,
        followers: 0,
        friends: 0,
        bookmarks: 0,
      };

      await Core.UserCountsModel.create(initialCounts);

      await LocalUserService.updateCounts({
        userId,
        countChanges: { posts: -5 },
      });

      const result = await Core.UserCountsModel.findById(userId);

      expect(result).not.toBeNull();
      expect(result!.posts).toBe(0);
    });

    it('should do nothing if user does not exist', async () => {
      await LocalUserService.updateCounts({
        userId,
        countChanges: { posts: 1 },
      });

      const result = await Core.UserCountsModel.findById(userId);
      expect(result).toBeNull();
    });
  });

  describe('upsertTtlWithDelay', () => {
    const userId = 'test-user-id' as Core.Pubky;

    it('should create TTL record with calculated timestamp for 1 minute delay', async () => {
      const retryDelayMs = 60_000; // 1 minute
      const beforeTimestamp = Date.now();

      await LocalUserService.upsertTtlWithDelay(userId, retryDelayMs);

      const afterTimestamp = Date.now();
      const result = await Core.UserTtlModel.findById(userId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(userId);

      // Verify timestamp is calculated correctly: now - (userTtlMs - retryDelayMs)
      const userTtlMs = 600_000; // Default 10 minutes
      const expectedMin = beforeTimestamp - (userTtlMs - retryDelayMs);
      const expectedMax = afterTimestamp - (userTtlMs - retryDelayMs);

      expect(result!.lastUpdatedAt).toBeGreaterThanOrEqual(expectedMin);
      expect(result!.lastUpdatedAt).toBeLessThanOrEqual(expectedMax);
    });

    it('should update existing TTL record with new delay', async () => {
      // Create initial TTL record with 2 minute delay
      await LocalUserService.upsertTtlWithDelay(userId, 120_000);

      const beforeTimestamp = Date.now();

      // Update with 1 minute delay
      await LocalUserService.upsertTtlWithDelay(userId, 60_000);

      const afterTimestamp = Date.now();
      const result = await Core.UserTtlModel.findById(userId);

      expect(result).not.toBeNull();

      // Verify new timestamp is for 1 minute delay
      const userTtlMs = 600_000;
      const expectedMin = beforeTimestamp - (userTtlMs - 60_000);
      const expectedMax = afterTimestamp - (userTtlMs - 60_000);

      expect(result!.lastUpdatedAt).toBeGreaterThanOrEqual(expectedMin);
      expect(result!.lastUpdatedAt).toBeLessThanOrEqual(expectedMax);
    });

    it('should handle multiple users with different delay values', async () => {
      const userId1 = 'user-1' as Core.Pubky;
      const userId2 = 'user-2' as Core.Pubky;

      const beforeTimestamp = Date.now();

      await LocalUserService.upsertTtlWithDelay(userId1, 60_000); // 1 min delay
      await LocalUserService.upsertTtlWithDelay(userId2, 120_000); // 2 min delay

      const afterTimestamp = Date.now();
      const result1 = await Core.UserTtlModel.findById(userId1);
      const result2 = await Core.UserTtlModel.findById(userId2);

      const userTtlMs = 600_000;

      // User 1: 1 minute delay
      const expected1Min = beforeTimestamp - (userTtlMs - 60_000);
      const expected1Max = afterTimestamp - (userTtlMs - 60_000);
      expect(result1!.lastUpdatedAt).toBeGreaterThanOrEqual(expected1Min);
      expect(result1!.lastUpdatedAt).toBeLessThanOrEqual(expected1Max);

      // User 2: 2 minute delay
      const expected2Min = beforeTimestamp - (userTtlMs - 120_000);
      const expected2Max = afterTimestamp - (userTtlMs - 120_000);
      expect(result2!.lastUpdatedAt).toBeGreaterThanOrEqual(expected2Min);
      expect(result2!.lastUpdatedAt).toBeLessThanOrEqual(expected2Max);
    });
  });
});
