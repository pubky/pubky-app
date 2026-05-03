import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUserProfile } from './useUserProfile';
import type { Pubky } from '@/models/models.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
// Hoist mock data using vi.hoisted
// Note: undefined = query not executed yet (loading), null = query executed but no data found
const mockMocks = vi.hoisted(() => {
  const mockUserDetails = { current: undefined as NexusUserDetails | null | undefined };
  const mockGetDetails = vi.fn();
  const mockFetchDetails = vi.fn();
  const mockGetAvatarUrl = vi.fn((userId: string) => `https://example.com/avatar/${userId}`);
  return {
    mockUserDetails,
    mockGetDetails,
    mockFetchDetails,
    mockGetAvatarUrl,
  };
});

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((queryFn, _deps, _defaultValue) => {
    // Execute the query function to return mock data
    if (queryFn) {
      void queryFn();
    }
    return mockMocks.mockUserDetails.current;
  }),
}));

// Mock controllers and services
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getDetails: mockMocks.mockGetDetails,
    fetchDetails: mockMocks.mockFetchDetails,
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: mockMocks.mockGetAvatarUrl,
  },
}));

// Mock Config to provide DEFAULT_URL
vi.mock('@/config/metadata', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/metadata')>();
  return {
    ...actual,
    DEFAULT_URL: 'https://example.com',
  };
});

describe('useUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to undefined (simulating query not yet executed)
    mockMocks.mockUserDetails.current = undefined;
    mockMocks.mockGetDetails.mockImplementation(() => Promise.resolve(mockMocks.mockUserDetails.current));
    mockMocks.mockFetchDetails.mockResolvedValue(undefined).mockClear();
  });

  describe('Profile data fetching', () => {
    it('returns null profile and isLoading true when query has not executed yet (undefined)', () => {
      // undefined = query not executed yet
      mockMocks.mockUserDetails.current = undefined;
      mockMocks.mockGetDetails.mockResolvedValue(undefined);
      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile).toBeNull();
      expect(result.current.isLoading).toBe(true);
    });

    it('returns null profile and isLoading false when user not found (null)', async () => {
      // null = query executed but user not found
      mockMocks.mockUserDetails.current = null;
      mockMocks.mockGetDetails.mockResolvedValue(null);
      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile).toBeNull();
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('returns profile data when user exists', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test User',
        bio: 'Test bio',
        image: 'avatar.jpg',
        status: 'Active',
        links: [],
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile).not.toBeNull();
      expect(result.current.profile?.name).toBe('Test User');
      expect(result.current.profile?.bio).toBe('Test bio');
      expect(result.current.profile?.status).toBe('Active');
      expect(result.current.isLoading).toBe(false);
    });

    it('handles missing optional fields gracefully', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test User',
        bio: '',
        image: null,
        status: null,
        links: [],
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile?.name).toBe('Test User');
      expect(result.current.profile?.bio).toBe('');
      expect(result.current.profile?.status).toBe('');
      expect(result.current.profile?.avatarUrl).toBeUndefined();
    });
  });

  describe('Public key formatting', () => {
    it('builds correct public key format', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile?.publicKey).toBe('pubkytest-user-id');
    });

    it('handles empty userId', () => {
      mockMocks.mockUserDetails.current = null;
      mockMocks.mockGetDetails.mockResolvedValue(null);
      const { result } = renderHook(() => useUserProfile(''));

      expect(result.current.profile).toBeNull();
    });
  });

  describe('Profile link generation', () => {
    it('builds correct profile link using config', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      // Uses DEFAULT_URL from config (SSR-safe)
      expect(result.current.profile?.link).toBe('https://example.com/profile/test-user-id');
    });
  });

  describe('Avatar URL generation', () => {
    it('builds avatar URL when user has image', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test',
        bio: '',
        image: 'avatar.jpg',
        status: null,
        links: null,
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile?.avatarUrl).toBe('https://example.com/avatar/test-user-id');
      expect(mockMocks.mockGetAvatarUrl).toHaveBeenCalledWith('test-user-id', expect.anything());
    });

    it('returns undefined avatar URL when user has no image', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test',
        bio: '',
        image: '',
        status: null,
        links: null,
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile?.avatarUrl).toBeUndefined();
    });

    it('returns undefined avatar URL when image is null', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile?.avatarUrl).toBeUndefined();
    });
  });

  describe('Default values', () => {
    it('includes default emoji', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.profile?.emoji).toBe('🌴');
    });
  });

  describe('Loading state', () => {
    it('isLoading is true when query has not executed yet (undefined)', () => {
      mockMocks.mockUserDetails.current = undefined;
      mockMocks.mockGetDetails.mockResolvedValue(undefined);
      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.isLoading).toBe(true);
    });

    it('isLoading is false when user not found (null)', async () => {
      mockMocks.mockUserDetails.current = null;
      mockMocks.mockGetDetails.mockResolvedValue(null);
      const { result } = renderHook(() => useUserProfile('test-user-id'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('isLoading is false when user details are available', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };
      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockResolvedValue(mockUser);

      const { result } = renderHook(() => useUserProfile('test-user-id'));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Controller integration', () => {
    it('does not call UserController.fetchDetails when data is cached (cache hit optimization)', () => {
      const mockUser: NexusUserDetails = {
        id: 'test-user-id' as Pubky,
        name: 'Test',
        bio: '',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };

      mockMocks.mockUserDetails.current = mockUser;
      mockMocks.mockGetDetails.mockImplementation(() => Promise.resolve(mockMocks.mockUserDetails.current));

      renderHook(() => useUserProfile('test-user-id'));

      // Phase 1 optimization: fetchFn is skipped when data is already cached (non-null).
      // Freshness is managed by TTL Coordinator via useTtlSubscription in ProfilePageHeader.
      expect(mockMocks.mockFetchDetails).not.toHaveBeenCalled();
    });
  });
});
