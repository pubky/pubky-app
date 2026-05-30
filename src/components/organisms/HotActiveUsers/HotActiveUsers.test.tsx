import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseMutedUsersResult } from '@/hooks/useMutedUsers/useMutedUsers.types';
import type { Pubky } from '@/models/models.types';
import { HotActiveUsers } from './HotActiveUsers';

const hooksMocks = vi.hoisted(() => ({
  useUserStream: vi.fn(),
}));

const mockUseMutedUsers = vi.hoisted(() =>
  vi.fn(
    (): UseMutedUsersResult => ({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: (_userId: Pubky) => false,
      isLoading: false,
    }),
  ),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/stores/hot/hot.store', () => ({
  useHotStore: vi.fn(() => ({
    reach: 'all',
    timeframe: 'this_month',
  })),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    currentUserPubky: null,
  })),
}));

vi.mock('@/hooks/useUserStream/useUserStream', () => ({
  useUserStream: hooksMocks.useUserStream,
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: () => ({
    toggleFollow: vi.fn(),
    isUserLoading: () => false,
  }),
}));

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: mockUseMutedUsers,
}));

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({
    children,
    overrideDefaults: _overrideDefaults,
    ...props
  }: {
    children: React.ReactNode;
    overrideDefaults?: boolean;
    [key: string]: unknown;
  }) => <div {...props}>{children}</div>,
}));

vi.mock('@/atoms/Heading/Heading', () => ({
  Heading: ({ children }: { children: React.ReactNode }) => <h5>{children}</h5>,
}));

vi.mock('@/atoms/Typography/Typography', () => ({
  Typography: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <p className={className}>{children}</p>
  ),
}));

vi.mock('../FullUserListItemSkeleton/FullUserListItemSkeleton', () => ({
  FullUserListItemSkeleton: () => <div data-testid="full-user-skeleton" />,
}));

vi.mock('../UserListItem/UserListItem', () => ({
  UserListItem: ({ user }: { user: { id: string; name?: string } }) => (
    <div data-testid={`hot-active-user-${user.id}`}>{user.name ?? user.id}</div>
  ),
}));

const baseStreamResult = {
  userIds: [] as string[],
  isLoadingMore: false,
  hasMore: false,
  loadMore: vi.fn(),
  refetch: vi.fn(),
};

describe('HotActiveUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooksMocks.useUserStream.mockReset();
    mockUseMutedUsers.mockImplementation(
      (): UseMutedUsersResult => ({
        mutedUserIds: [],
        mutedUserIdSet: new Set(),
        isMuted: (_userId: Pubky) => false,
        isLoading: false,
      }),
    );
  });

  it('hides muted users from the active users list', () => {
    mockUseMutedUsers.mockImplementation(
      (): UseMutedUsersResult => ({
        mutedUserIds: ['muted-user'],
        mutedUserIdSet: new Set(['muted-user']),
        isMuted: (id: Pubky) => id === 'muted-user',
        isLoading: false,
      }),
    );

    hooksMocks.useUserStream.mockReturnValue({
      ...baseStreamResult,
      users: [
        { id: 'muted-user', name: 'Muted Person', image: null, avatarUrl: null, isFollowing: false },
        { id: 'visible-user', name: 'Visible Person', image: null, avatarUrl: null, isFollowing: false },
      ],
      isLoading: false,
      error: null,
    });

    render(<HotActiveUsers />);

    expect(screen.queryByTestId('hot-active-user-muted-user')).not.toBeInTheDocument();
    expect(screen.getByTestId('hot-active-user-visible-user')).toBeInTheDocument();
  });

  it('shows empty state when every influencer is muted', () => {
    mockUseMutedUsers.mockImplementation(
      (): UseMutedUsersResult => ({
        mutedUserIds: ['only-user'],
        mutedUserIdSet: new Set(['only-user']),
        isMuted: (_userId: Pubky) => true,
        isLoading: false,
      }),
    );

    hooksMocks.useUserStream.mockReturnValue({
      ...baseStreamResult,
      users: [{ id: 'only-user', name: 'Only', image: null, avatarUrl: null, isFollowing: false }],
      isLoading: false,
      error: null,
    });

    render(<HotActiveUsers />);

    expect(screen.queryByTestId('hot-active-user-only-user')).not.toBeInTheDocument();
    expect(screen.getByText('noUsersToShow')).toBeInTheDocument();
  });
});
