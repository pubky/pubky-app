import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhoToFollowSidebar } from './WhoToFollowSidebar';

const hooksMocks = vi.hoisted(() => ({
  useUserStream: vi.fn(),
  toggleFollow: vi.fn(),
  pathname: '/',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => hooksMocks.pathname,
}));

vi.mock('@/hooks/useUserStream/useUserStream', () => ({
  useUserStream: hooksMocks.useUserStream,
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({
    toggleFollow: hooksMocks.toggleFollow,
    isUserLoading: () => false,
  }),
}));

vi.mock('@/organisms/UserListItem/UserListItem', () => ({
  UserListItem: ({
    user,
    onFollowClick,
  }: {
    user: { id: string; name: string; isFollowing?: boolean };
    onFollowClick?: (userId: string, isFollowing: boolean) => void;
  }) => (
    <button
      data-testid="user-list-item"
      data-user-id={user.id}
      type="button"
      onClick={() => onFollowClick?.(user.id, user.isFollowing ?? false)}
    >
      {user.name}
    </button>
  ),
}));

describe('WhoToFollowSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooksMocks.useUserStream.mockReset();
    hooksMocks.toggleFollow.mockResolvedValue(undefined);
    hooksMocks.pathname = '/';
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

  it('passes clicked users as preserved before follow resolves', async () => {
    hooksMocks.toggleFollow.mockReturnValue(new Promise(() => {}));
    hooksMocks.useUserStream.mockReturnValue({
      users: [{ id: 'user-1', name: 'User One', image: null, avatarUrl: null, isFollowing: false }],
      userIds: ['user-1'],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    render(<WhoToFollowSidebar />);
    fireEvent.click(screen.getByText('User One'));

    expect(hooksMocks.toggleFollow).toHaveBeenCalledWith('user-1', false);
    await waitFor(() => {
      expect(hooksMocks.useUserStream).toHaveBeenLastCalledWith(
        expect.objectContaining({
          preserveFollowedUserIds: ['user-1'],
        }),
      );
    });
  });

  it('rolls back preserved users when follow fails', async () => {
    hooksMocks.toggleFollow.mockRejectedValue(new Error('follow failed'));
    hooksMocks.useUserStream.mockReturnValue({
      users: [{ id: 'user-1', name: 'User One', image: null, avatarUrl: null, isFollowing: false }],
      userIds: ['user-1'],
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    render(<WhoToFollowSidebar />);
    fireEvent.click(screen.getByText('User One'));

    await waitFor(() => {
      expect(hooksMocks.useUserStream).toHaveBeenLastCalledWith(
        expect.objectContaining({
          preserveFollowedUserIds: [],
        }),
      );
    });
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
