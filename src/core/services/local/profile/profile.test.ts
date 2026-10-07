import type { PubkyAppUser } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProfileLocalEditTtlMs } from '@/config/user';
import type { Pubky } from '@/models/models.types';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LocalUserService } from '@/services/local/user/user';
import { NexusSocialGraphStatus, type NexusUserCounts, type NexusUserDetails } from '@/services/nexus/nexus.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocalProfileService } from './profile';

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

    const baseDetails: NexusUserDetails = {
      id: userId,
      name: 'Test User',
      bio: '',
      image: null,
      status: null,
      links: null,
      indexed_at: 1,
    };

    it('keeps a newer profile and its social graph tier when an older response arrives', async () => {
      const newerDetails = {
        ...baseDetails,
        name: 'Newer name',
        bio: 'Newer bio',
        image: 'https://example.com/new-avatar.jpg',
        status: 'Available',
        links: [{ title: 'Website', url: 'https://example.com' }],
        indexed_at: 2,
        nexusIndexedAt: 2,
        social_graph_status: NexusSocialGraphStatus.NETWORKED,
      };
      await UserDetailsModel.upsert(newerDetails);

      await LocalProfileService.upsertDetails(baseDetails);

      expect(await UserDetailsModel.findById(userId)).toMatchObject(newerDetails);
    });

    it.each([true, false])('keeps the newer concurrent write (older first: %s)', async (olderFirst) => {
      const newerDetails = { ...baseDetails, name: 'Newer name', indexed_at: 2 };
      const details = olderFirst ? [baseDetails, newerDetails] : [newerDetails, baseDetails];

      await Promise.all(details.map((user) => LocalProfileService.upsertDetails(user)));

      expect(await UserDetailsModel.findById(userId)).toMatchObject(newerDetails);
    });

    it('should keep a social graph tier persisted by a full user view', async () => {
      await UserDetailsModel.upsert({ ...baseDetails, social_graph_status: NexusSocialGraphStatus.NETWORKED });

      await LocalProfileService.upsertDetails({ ...baseDetails, name: 'Renamed' });

      const result = await UserDetailsModel.findById(userId);
      expect(result!.name).toBe('Renamed');
      expect(result!.social_graph_status).toBe(NexusSocialGraphStatus.NETWORKED);
    });

    it('should keep a cached "no ranking" tier', async () => {
      await UserDetailsModel.upsert({ ...baseDetails, social_graph_status: null });

      await LocalProfileService.upsertDetails(baseDetails);

      const result = await UserDetailsModel.findById(userId);
      expect(result!.social_graph_status).toBeNull();
    });

    it('should leave the tier unknown for a user never persisted from a full view', async () => {
      await LocalProfileService.upsertDetails(baseDetails);

      const result = await UserDetailsModel.findById(userId);
      expect(result!.social_graph_status).toBeUndefined();
    });

    describe('with a pending local edit', () => {
      const localEdit = { ...baseDetails, name: 'Local edit', indexed_at: 1_000, nexusIndexedAt: 1 };
      const serverChange = { ...baseDetails, name: 'Other change', indexed_at: 2 };

      it('keeps the edit against a newer revision that does not include it', async () => {
        await UserDetailsModel.upsert({ ...localEdit, localUpdatedAt: Date.now() });

        await LocalProfileService.upsertDetails(serverChange);

        expect(await UserDetailsModel.findById(userId)).toMatchObject({ name: 'Local edit', nexusIndexedAt: 1 });
      });

      it('accepts Nexus again once the protection window has passed', async () => {
        await UserDetailsModel.upsert({ ...localEdit, localUpdatedAt: Date.now() - getProfileLocalEditTtlMs() });

        await LocalProfileService.upsertDetails(serverChange);

        const result = await UserDetailsModel.findById(userId);
        expect(result).toMatchObject({ name: 'Other change', nexusIndexedAt: 2 });
        expect(result!.localUpdatedAt).toBeUndefined();
      });
    });
  });

  describe('updateDetails', () => {
    const userId = 'test-user-id' as Pubky;

    it('should store the published profile with its status, filling in absent fields', async () => {
      await LocalProfileService.updateDetails(
        asOpaque<PubkyAppUser>({ name: 'Published', status: '🪚building' }),
        userId,
      );

      expect(await UserDetailsModel.findById(userId)).toMatchObject({
        name: 'Published',
        bio: '',
        image: null,
        links: [],
        status: '🪚building',
      });
    });

    it('should create a missing row as a pending local edit with a fresh TTL', async () => {
      await UserTtlModel.table.clear();

      await LocalProfileService.updateDetails(asOpaque<PubkyAppUser>({ name: 'Published' }), userId);

      const result = await UserDetailsModel.findById(userId);
      expect(result!.localUpdatedAt).toEqual(expect.any(Number));
      expect(await UserTtlModel.findById(userId)).toMatchObject({ lastUpdatedAt: result!.localUpdatedAt });
    });

    it('should keep the known Nexus revision and badge tier of an existing row', async () => {
      await UserDetailsModel.upsert({
        id: userId,
        name: 'Cached',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: 5,
        nexusIndexedAt: 5,
        social_graph_status: NexusSocialGraphStatus.NETWORKED,
      });

      await LocalProfileService.updateDetails(asOpaque<PubkyAppUser>({ name: 'Published' }), userId);

      expect(await UserDetailsModel.findById(userId)).toMatchObject({
        name: 'Published',
        nexusIndexedAt: 5,
        social_graph_status: NexusSocialGraphStatus.NETWORKED,
      });
    });

    it('should clear a cached tombstone when the profile is written', async () => {
      await UserDetailsModel.upsert({
        id: userId,
        name: '',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: 1,
        deleted: true,
      });

      await LocalProfileService.updateDetails(
        asOpaque<PubkyAppUser>({ name: 'Revived', bio: 'Back again', image: null, links: [] }),
        userId,
      );

      const result = await UserDetailsModel.findById(userId);
      expect(result!.name).toBe('Revived');
      expect(result!.deleted).toBe(false);
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
        collections: 0,
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
        collections: 0,
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
        collections: 0,
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
        collections: 0,
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
