import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalProfileService } from './profile';
import type { Pubky } from '@/models/models.types';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { LocalUserService } from '@/services/local/user/user';
import type { NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
describe('LocalProfileService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await UserDetailsModel.table.clear();
    await UserCountsModel.table.clear();
  });

  describe('upsertDetails', () => {
    const userId = 'test-user-id' as Pubky;

    it('should upsert user details into local database', async () => {
      const userDetails: NexusUserDetails = {
        id: userId,
        name: 'Test User',
        bio: 'Test bio',
        image: 'https://example.com/avatar.jpg',
        status: 'active',
        links: [{ title: 'Website', url: 'https://example.com' }],
        indexed_at: Date.now(),
      };

      await LocalProfileService.upsertDetails(userDetails);

      const result = await LocalUserService.readDetails({ userId });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(userId);
      expect(result!.name).toBe('Test User');
    });

    it('should update existing user details', async () => {
      const initialDetails: NexusUserDetails = {
        id: userId,
        name: 'Initial Name',
        bio: 'Initial bio',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };

      await LocalProfileService.upsertDetails(initialDetails);

      const updatedDetails: NexusUserDetails = {
        id: userId,
        name: 'Updated Name',
        bio: 'Updated bio',
        image: 'https://example.com/new-avatar.jpg',
        status: 'away',
        links: [{ title: 'New Link', url: 'https://new.example.com' }],
        indexed_at: Date.now(),
      };

      await LocalProfileService.upsertDetails(updatedDetails);

      const result = await LocalUserService.readDetails({ userId });
      expect(result!.name).toBe('Updated Name');
      expect(result!.bio).toBe('Updated bio');
    });
  });

  describe('upsertCounts', () => {
    const userId = 'test-user-id' as Pubky;

    it('should upsert user counts into local database', async () => {
      const userCounts: NexusUserCounts = {
        posts: 10,
        replies: 5,
        followers: 100,
        following: 50,
        friends: 25,
        tagged: 3,
        tags: 2,
        unique_tags: 1,
        bookmarks: 15,
      };

      await LocalProfileService.upsertCounts(userId, userCounts);

      const result = await LocalUserService.readCounts({ userId });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(userId);
      expect(result!.posts).toBe(10);
      expect(result!.replies).toBe(5);
      expect(result!.followers).toBe(100);
      expect(result!.following).toBe(50);
      expect(result!.friends).toBe(25);
    });

    it('should update existing user counts', async () => {
      const initialCounts: NexusUserCounts = {
        posts: 5,
        replies: 2,
        followers: 50,
        following: 25,
        friends: 10,
        tagged: 1,
        tags: 1,
        unique_tags: 0,
        bookmarks: 5,
      };

      await LocalProfileService.upsertCounts(userId, initialCounts);

      const updatedCounts: NexusUserCounts = {
        posts: 15,
        replies: 8,
        followers: 150,
        following: 75,
        friends: 35,
        tagged: 5,
        tags: 4,
        unique_tags: 3,
        bookmarks: 20,
      };

      await LocalProfileService.upsertCounts(userId, updatedCounts);

      const result = await LocalUserService.readCounts({ userId });
      expect(result!.posts).toBe(15);
      expect(result!.replies).toBe(8);
      expect(result!.followers).toBe(150);
      expect(result!.following).toBe(75);
      expect(result!.friends).toBe(35);
    });

    it('should handle zero counts', async () => {
      const zeroCounts: NexusUserCounts = {
        posts: 0,
        replies: 0,
        followers: 0,
        following: 0,
        friends: 0,
        tagged: 0,
        tags: 0,
        unique_tags: 0,
        bookmarks: 0,
      };

      await LocalProfileService.upsertCounts(userId, zeroCounts);

      const result = await LocalUserService.readCounts({ userId });
      expect(result).not.toBeNull();
      expect(result!.posts).toBe(0);
      expect(result!.followers).toBe(0);
    });
  });
});
