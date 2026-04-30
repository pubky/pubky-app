import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { generateTestUserId } from '@/models/user/users.helpers';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
describe('UserDetailsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testUserId1 = generateTestUserId(1);
  const testUserId2 = generateTestUserId(2);

  const MOCK_NEXUS_USER_DETAILS: Omit<NexusUserDetails, 'id'> = {
    name: 'Test User',
    bio: 'This is a test user bio',
    image: 'https://example.com/avatar.jpg',
    indexed_at: Date.now(),
    links: [
      { title: 'Website', url: 'https://example.com' },
      { title: 'GitHub', url: 'https://github.com/testuser' },
    ],
    status: 'active',
  };

  describe('Constructor', () => {
    it('should create UserDetailsModel instance with all properties', () => {
      const mockUserDetailsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_DETAILS,
      };

      const userDetails = new UserDetailsModel(mockUserDetailsData);

      expect(userDetails.id).toBe(mockUserDetailsData.id);
      expect(userDetails.name).toBe(mockUserDetailsData.name);
      expect(userDetails.bio).toBe(mockUserDetailsData.bio);
      expect(userDetails.image).toBe(mockUserDetailsData.image);
      expect(userDetails.indexed_at).toBe(mockUserDetailsData.indexed_at);
      expect(userDetails.links).toEqual(mockUserDetailsData.links);
      expect(userDetails.status).toBe(mockUserDetailsData.status);
    });
  });

  describe('Static Methods', () => {
    it('should create user details', async () => {
      const mockUserDetailsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_DETAILS,
      };

      const result = await UserDetailsModel.create(mockUserDetailsData);
      expect(result).toBe(mockUserDetailsData.id);
    });

    it('should find user details by id', async () => {
      const mockUserDetailsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_DETAILS,
      };

      await UserDetailsModel.create(mockUserDetailsData);
      const result = await UserDetailsModel.findById(testUserId1);

      expect(result).not.toBeNull();
      expect(result!).toBeInstanceOf(UserDetailsModel);
      expect(result!.id).toBe(testUserId1);
      expect(result!.name).toBe(MOCK_NEXUS_USER_DETAILS.name);
      expect(result!.bio).toBe(MOCK_NEXUS_USER_DETAILS.bio);
    });

    it('should return null for non-existent user details', async () => {
      const nonExistentId = generateTestUserId(999);
      const result = await UserDetailsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save user details', async () => {
      const mockUserDetailsArray: NexusUserDetails[] = [
        { id: testUserId1, ...MOCK_NEXUS_USER_DETAILS },
        {
          id: testUserId2,
          ...MOCK_NEXUS_USER_DETAILS,
          name: 'Test User 2',
          bio: 'Second test user bio',
        },
      ];

      const result = await UserDetailsModel.bulkSave(mockUserDetailsArray);
      expect(result).toBeDefined();

      // Verify the data was saved correctly
      const userDetails1 = await UserDetailsModel.findById(testUserId1);
      const userDetails2 = await UserDetailsModel.findById(testUserId2);

      expect(userDetails1).not.toBeNull();
      expect(userDetails2).not.toBeNull();
      expect(userDetails1!.name).toBe('Test User');
      expect(userDetails2!.name).toBe('Test User 2');
      expect(userDetails2!.bio).toBe('Second test user bio');
    });

    it('should handle empty array in bulk save', async () => {
      const result = await UserDetailsModel.bulkSave([]);
      // bulkPut with empty array returns undefined, which is expected
      expect(result).toBeUndefined();
    });

    it('should handle multiple user details with different data', async () => {
      const mockDetailsArray: NexusUserDetails[] = [
        { id: testUserId1, ...MOCK_NEXUS_USER_DETAILS },
        {
          id: testUserId2,
          ...MOCK_NEXUS_USER_DETAILS,
          name: 'Another User',
          bio: 'Different bio',
          image: null,
          links: null,
          status: null,
        },
      ];

      await UserDetailsModel.bulkSave(mockDetailsArray);

      const userDetails1 = await UserDetailsModel.findById(testUserId1);
      const userDetails2 = await UserDetailsModel.findById(testUserId2);

      expect(userDetails1).not.toBeNull();
      expect(userDetails2).not.toBeNull();
      expect(userDetails1!.name).toBe('Test User');
      expect(userDetails1!.image).toBe('https://example.com/avatar.jpg');
      expect(userDetails1!.links).toHaveLength(2);
      expect(userDetails2!.name).toBe('Another User');
      expect(userDetails2!.image).toBeNull();
      expect(userDetails2!.links).toBeNull();
      expect(userDetails1!.status).toBe('active');
      expect(userDetails2!.status).toBeNull();
      expect(userDetails1!.links).toEqual([
        { title: 'Website', url: 'https://example.com' },
        { title: 'GitHub', url: 'https://github.com/testuser' },
      ]);
      expect(userDetails2?.links).toBeNull();
    });

    it('should handle user details with null values', async () => {
      const mockUserDetailsWithNulls: NexusUserDetails = {
        id: testUserId1,
        name: 'Minimal User',
        bio: '',
        image: null,
        indexed_at: Date.now(),
        links: null,
        status: null,
      };

      const result = await UserDetailsModel.create(mockUserDetailsWithNulls);
      expect(result).toBe(mockUserDetailsWithNulls.id);

      const foundUser = await UserDetailsModel.findById(testUserId1);
      expect(foundUser).not.toBeNull();
      expect(foundUser!.name).toBe('Minimal User');
      expect(foundUser!.image).toBeNull();
      expect(foundUser!.links).toBeNull();
      expect(foundUser!.status).toBeNull();
    });
  });
});
