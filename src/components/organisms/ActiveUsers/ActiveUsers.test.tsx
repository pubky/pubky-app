import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import { ActiveUsers } from './ActiveUsers';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock the useFollowUser hook
vi.mock('@/hooks', async () => {
  const actual = await vi.importActual('@/hooks');
  return {
    ...actual,
    useFollowUser: () => ({
      toggleFollow: vi.fn(),
      isUserLoading: () => false,
    }),
  };
});

describe('ActiveUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Data Flow - Issue #967', () => {
    it('shows loading skeletons while stream is loading', () => {
      const streamSpy = vi.spyOn(Hooks, 'useUserStream').mockReturnValue({
        users: [],
        userIds: [],
        isLoading: true,
        isLoadingMore: false,
        hasMore: false,
        error: null,
        loadMore: vi.fn(),
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof Hooks.useUserStream>);

      render(<ActiveUsers />);

      expect(screen.getAllByTestId('user-list-item-skeleton-compact')).toHaveLength(3);
      expect(screen.queryByText('No users to show')).not.toBeInTheDocument();
      streamSpy.mockRestore();
    });

    it('should display users when stream returns user IDs and user details exist in cache', async () => {
      const mockUserIds: Core.Pubky[] = ['user-1', 'user-2', 'user-3'];
      const mockUserDetails: Core.NexusUserDetails[] = [
        {
          id: 'user-1',
          name: 'User One',
          bio: 'Bio 1',
          image: null,
          links: null,
          status: null,
          indexed_at: Date.now(),
        },
        {
          id: 'user-2',
          name: 'User Two',
          bio: 'Bio 2',
          image: null,
          links: null,
          status: null,
          indexed_at: Date.now(),
        },
        {
          id: 'user-3',
          name: 'User Three',
          bio: 'Bio 3',
          image: null,
          links: null,
          status: null,
          indexed_at: Date.now(),
        },
      ];

      // Setup: Persist user details to cache
      await Core.UserDetailsModel.bulkSave(mockUserDetails);

      // Setup: Persist stream to cache
      await Core.LocalStreamUsersService.upsert({
        streamId: Core.UserStreamTypes.TODAY_INFLUENCERS_ALL,
        stream: mockUserIds,
      });

      // Render
      render(<ActiveUsers />);

      // Assert: Should display user names
      await waitFor(
        () => {
          expect(screen.getByText('User One')).toBeInTheDocument();
          expect(screen.getByText('User Two')).toBeInTheDocument();
          expect(screen.getByText('User Three')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('should show "No users to show" when stream is empty', async () => {
      // Setup: Persist empty stream to cache
      await Core.LocalStreamUsersService.upsert({
        streamId: Core.UserStreamTypes.TODAY_INFLUENCERS_ALL,
        stream: [],
      });

      // Render
      render(<ActiveUsers />);

      // Assert: Should display empty message
      await waitFor(
        () => {
          expect(screen.getByText('No users to show')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });

    it('should show "No users to show" when stream has IDs but user details are missing from cache', async () => {
      const mockUserIds: Core.Pubky[] = ['missing-user-1', 'missing-user-2'];

      // Setup: Persist stream with user IDs but NO user details in cache
      await Core.LocalStreamUsersService.upsert({
        streamId: Core.UserStreamTypes.TODAY_INFLUENCERS_ALL,
        stream: mockUserIds,
      });

      // Note: We intentionally do NOT persist user details to simulate the bug

      // Render
      render(<ActiveUsers />);

      // Assert: Should display empty message because user details are missing
      // This is the bug scenario - stream has IDs but details aren't in cache
      await waitFor(
        () => {
          expect(screen.getByText('No users to show')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });
});
