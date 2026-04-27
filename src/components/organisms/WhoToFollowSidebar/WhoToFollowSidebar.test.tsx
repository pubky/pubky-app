import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhoToFollowSidebar } from './WhoToFollowSidebar';

const hooksMocks = vi.hoisted(() => ({
  useUserStream: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('@/hooks', async () => {
  const actual = await vi.importActual('@/hooks');
  return {
    ...actual,
    useUserStream: hooksMocks.useUserStream,
    useFollowUser: () => ({
      toggleFollow: vi.fn(),
      isUserLoading: () => false,
    }),
  };
});

describe('WhoToFollowSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooksMocks.useUserStream.mockReset();
  });

  it('shows loading skeletons while stream is loading', () => {
    hooksMocks.useUserStream.mockReturnValue({
      users: [],
      userIds: [],
      isLoading: true,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    render(<WhoToFollowSidebar />);

    expect(screen.getAllByTestId('user-list-item-skeleton-compact')).toHaveLength(3);
  });

  it('should display users when stream returns user details', () => {
    hooksMocks.useUserStream.mockReturnValue({
      users: [
        { id: 'user-1', name: 'User One', image: null, avatarUrl: null, isFollowing: false },
        { id: 'user-2', name: 'User Two', image: null, avatarUrl: null, isFollowing: false },
        { id: 'user-3', name: 'User Three', image: null, avatarUrl: null, isFollowing: false },
      ],
      userIds: ['user-1', 'user-2', 'user-3'],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    render(<WhoToFollowSidebar />);

    expect(screen.getByText('User One')).toBeInTheDocument();
    expect(screen.getByText('User Two')).toBeInTheDocument();
    expect(screen.getByText('User Three')).toBeInTheDocument();
  });
});

describe('WhoToFollowSidebar - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooksMocks.useUserStream.mockReset();
  });

  it('matches snapshot when loading', () => {
    hooksMocks.useUserStream.mockReturnValue({
      users: [],
      userIds: [],
      isLoading: true,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    const { container } = render(<WhoToFollowSidebar />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with users', () => {
    hooksMocks.useUserStream.mockReturnValue({
      users: [
        { id: 'user-1', name: 'User One', image: null, avatarUrl: null, isFollowing: false },
        { id: 'user-2', name: 'User Two', image: null, avatarUrl: null, isFollowing: true },
      ],
      userIds: ['user-1', 'user-2'],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    const { container } = render(<WhoToFollowSidebar />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
