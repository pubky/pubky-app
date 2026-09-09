import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_PAGE_TYPES } from '@/app/(main)/profile/types';
import { useProfileHeader } from '@/hooks/useProfileHeader/useProfileHeader';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { PUBKY_52_STAGING_FIXTURE, PUBKY_INVALID_TOO_LONG } from '@/test-utils/pubky';
import { mockAuthStore } from '@/test-utils/stores';
import { asOpaque } from '@/test-utils/type-assertions';
import { ProfilePageContainer } from './ProfilePageContainer';

const OTHER_VALID_PUBKY = 'gujx6qd8ksydh1makdphd3bxu351d9b8waqka8hfg6q7hnqkxexo';

// Mock dependencies
const mockCurrentUserPubky = PUBKY_52_STAGING_FIXTURE;
const mockAuthStoreState = {
  currentUserPubky: mockCurrentUserPubky,
  isLoggingOut: false,
};
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector: (state: AuthStore) => unknown) => selector(mockAuthStore(mockAuthStoreState))),
}));

// Mock Providers
vi.mock('@/providers/ProfileProvider/ProfileProvider', () => ({
  useProfileContext: vi.fn(() => ({
    pubky: mockCurrentUserPubky,
    isOwnProfile: true,
    isLoading: false,
  })),
}));

// Mock Hooks
const mockProfile = {
  name: 'Test User',
  bio: 'Test bio',
  publicKey: mockCurrentUserPubky,
  emoji: '🌴',
  status: 'Available',
  avatarUrl: 'https://example.com/avatar.jpg',
  link: `https://example.com/profile/${mockCurrentUserPubky}`,
};

const mockStats = {
  notifications: 5,
  posts: 10,
  replies: 3,
  followers: 100,
  following: 50,
  friends: 25,
  tagged: 7,
};

const mockActions = {
  onEdit: vi.fn(),
  onCopyPublicKey: vi.fn(),
  onCopyLink: vi.fn(),
  onSignOut: vi.fn(),
  onStatusClick: vi.fn(),
};

const mockNavigateToPage = vi.fn();

vi.mock('@/hooks/useProfileHeader/useProfileHeader', () => ({
  useProfileHeader: vi.fn(() => ({
    profile: mockProfile,
    stats: mockStats,
    actions: mockActions,
    isLoading: false,
    isProfileLoading: false,
    userNotFound: false,
  })),
}));

vi.mock('@/hooks/useProfileNavigation/useProfileNavigation', () => ({
  useProfileNavigation: vi.fn(() => ({
    activePage: PROFILE_PAGE_TYPES.NOTIFICATIONS,
    filterBarActivePage: PROFILE_PAGE_TYPES.NOTIFICATIONS,
    navigateToPage: mockNavigateToPage,
  })),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: vi.fn(() => ({
    isAuthenticated: true,
    requireAuth: vi.fn((callback) => callback()),
  })),
}));

vi.mock('@/hooks/useFollowUser/useFollowUser', () => ({
  useFollowUser: vi.fn(() => ({
    toggleFollow: vi.fn(),
    isLoading: false,
    loadingAction: null,
    error: null,
  })),
}));

vi.mock('@/hooks/useIsFollowing/useIsFollowing', () => ({
  useIsFollowing: vi.fn(() => ({
    isFollowing: false,
    isLoading: false,
  })),
}));

vi.mock('@/molecules/MobileFooter/MobileFooter', () => {
  return {
    MobileFooter: () => <div data-testid="mobile-footer" />,
  };
});

vi.mock('@/molecules/MobileHeader/MobileHeader', () => {
  return {
    MobileHeader: ({ showLeftButton, showRightButton }: { showLeftButton: boolean; showRightButton: boolean }) => (
      <div data-testid="mobile-header" data-left={showLeftButton} data-right={showRightButton} />
    ),
  };
});

vi.mock('@/molecules/ProfilePageLayoutWrapper/ProfilePageLayoutWrapper', () => {
  return {
    ProfilePageLayoutWrapper: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="profile-page-layout-wrapper">{children}</div>
    ),
  };
});

vi.mock('@/organisms/ProfileUserNotFoundDiscoveryView/ProfileUserNotFoundDiscoveryView', () => ({
  ProfileUserNotFoundDiscoveryView: () => (
    <div data-testid="profile-user-not-found-discovery">User not found discovery</div>
  ),
}));

// Mock Organisms - ProfilePageLayout
vi.mock('@/organisms/ProfilePageLayout/ProfilePageLayout', () => {
  return {
    ProfilePageLayout: ({
      children,
      profile,
      stats,
      actions,
      activePage,
      filterBarActivePage,
      isLoading,
      isHeaderLoading,
    }: {
      children: React.ReactNode;
      profile: Record<string, unknown>;
      stats: Record<string, unknown>;
      actions: Record<string, unknown>;
      activePage: string;
      filterBarActivePage: string;
      navigateToPage: (page: string) => void;
      isLoading: boolean;
      isHeaderLoading?: boolean;
    }) => (
      <div
        data-testid="profile-page-layout"
        data-profile={JSON.stringify(profile)}
        data-stats={JSON.stringify(stats)}
        data-actions-count={Object.keys(actions).length}
        data-active-page={activePage}
        data-filter-bar-page={filterBarActivePage}
        data-is-loading={isLoading}
        data-is-header-loading={isHeaderLoading === undefined ? '' : String(isHeaderLoading)}
      >
        {children}
      </div>
    ),
  };
});

describe('ProfilePageContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without errors', () => {
    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders ProfilePageLayout', () => {
    render(
      <ProfilePageContainer>
        <div>Test</div>
      </ProfilePageContainer>,
    );
    expect(screen.getByTestId('profile-page-layout')).toBeInTheDocument();
  });

  it('passes profile data from useProfileHeader to layout', () => {
    render(
      <ProfilePageContainer>
        <div>Test</div>
      </ProfilePageContainer>,
    );
    const layout = screen.getByTestId('profile-page-layout');
    const profileData = JSON.parse(layout.getAttribute('data-profile') || '{}');
    expect(profileData).toEqual(mockProfile);
  });

  it('passes stats from useProfileHeader to layout', () => {
    render(
      <ProfilePageContainer>
        <div>Test</div>
      </ProfilePageContainer>,
    );
    const layout = screen.getByTestId('profile-page-layout');
    const statsData = JSON.parse(layout.getAttribute('data-stats') || '{}');
    expect(statsData).toEqual(mockStats);
  });

  it('passes actions from useProfileHeader to layout', () => {
    render(
      <ProfilePageContainer>
        <div>Test</div>
      </ProfilePageContainer>,
    );
    const layout = screen.getByTestId('profile-page-layout');
    const actionsCount = parseInt(layout.getAttribute('data-actions-count') || '0');
    // 5 from useProfileHeader + 4 from follow (onFollowToggle, isFollowLoading, followLoadingAction, isFollowing)
    expect(actionsCount).toBe(9);
  });

  it('passes activePage from useProfileNavigation to layout', () => {
    render(
      <ProfilePageContainer>
        <div>Test</div>
      </ProfilePageContainer>,
    );
    const layout = screen.getByTestId('profile-page-layout');
    expect(layout).toHaveAttribute('data-active-page', PROFILE_PAGE_TYPES.NOTIFICATIONS);
  });

  it('passes filterBarActivePage from useProfileNavigation to layout', () => {
    render(
      <ProfilePageContainer>
        <div>Test</div>
      </ProfilePageContainer>,
    );
    const layout = screen.getByTestId('profile-page-layout');
    expect(layout).toHaveAttribute('data-filter-bar-page', PROFILE_PAGE_TYPES.NOTIFICATIONS);
  });

  it('passes isLoading from useProfileHeader to layout', () => {
    render(
      <ProfilePageContainer>
        <div>Test</div>
      </ProfilePageContainer>,
    );
    const layout = screen.getByTestId('profile-page-layout');
    expect(layout).toHaveAttribute('data-is-loading', 'false');
  });

  it('passes children to layout', () => {
    render(
      <ProfilePageContainer>
        <div data-testid="custom-child">Custom Content</div>
      </ProfilePageContainer>,
    );
    expect(screen.getByTestId('custom-child')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('ProfilePageContainer - Props passed to layout', () => {
  it('passes all required props to ProfilePageLayout', () => {
    render(
      <ProfilePageContainer>
        <div>Test</div>
      </ProfilePageContainer>,
    );

    const layout = screen.getByTestId('profile-page-layout');

    // Verify all props are passed
    expect(layout).toHaveAttribute('data-profile');
    expect(layout).toHaveAttribute('data-stats');
    expect(layout).toHaveAttribute('data-actions-count');
    expect(layout).toHaveAttribute('data-active-page');
    expect(layout).toHaveAttribute('data-filter-bar-page');
    expect(layout).toHaveAttribute('data-is-loading');
  });
});

describe('ProfilePageContainer - User not found', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not show UserNotFound while profile context is loading', () => {
    vi.mocked(useProfileContext).mockReturnValue({
      pubky: null,
      isOwnProfile: false,
      isLoading: true,
    });

    vi.mocked(useProfileHeader).mockReturnValue({
      profile: {
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      },
      stats: asOpaque<ReturnType<typeof useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      isProfileLoading: false,
      userNotFound: true,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    expect(screen.queryByTestId('profile-user-not-found-discovery')).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-page-layout')).toBeInTheDocument();
  });

  it('shows UserNotFound when user is not found and not own profile', async () => {
    // Mock useProfileContext to return isOwnProfile: false
    vi.mocked(useProfileContext).mockReturnValue({
      pubky: OTHER_VALID_PUBKY,
      isOwnProfile: false,
      isLoading: false,
    });

    // Mock useProfileHeader to return userNotFound: true
    vi.mocked(useProfileHeader).mockReturnValue({
      profile: {
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      },
      stats: asOpaque<ReturnType<typeof useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      isProfileLoading: false,
      userNotFound: true,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    expect(screen.getByTestId('profile-user-not-found-discovery')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-page-layout')).not.toBeInTheDocument();
  });

  it('shows ProfileUserNotFoundDiscoveryView when pubky fails identifier shape', () => {
    vi.mocked(useProfileContext).mockReturnValue({
      pubky: PUBKY_INVALID_TOO_LONG,
      isOwnProfile: false,
      isLoading: false,
    });

    vi.mocked(useProfileHeader).mockReturnValue({
      profile: mockProfile,
      stats: asOpaque<ReturnType<typeof useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      isProfileLoading: false,
      userNotFound: false,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    expect(screen.getByTestId('profile-user-not-found-discovery')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-page-layout')).not.toBeInTheDocument();
    expect(useProfileHeader).toHaveBeenCalledWith(PUBKY_INVALID_TOO_LONG, { enabled: false });
  });

  it('shows ProfilePageLayout when user is found', async () => {
    // Reset to default mocks
    vi.mocked(useProfileContext).mockReturnValue({
      pubky: mockCurrentUserPubky,
      isOwnProfile: true,
      isLoading: false,
    });
    vi.mocked(useProfileHeader).mockReturnValue({
      profile: mockProfile,
      stats: asOpaque<ReturnType<typeof useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      isProfileLoading: false,
      userNotFound: false,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    expect(screen.getByTestId('profile-page-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-user-not-found-discovery')).not.toBeInTheDocument();
  });

  it('does not show UserNotFound for own profile even if userNotFound is true', async () => {
    // Mock useProfileContext to return isOwnProfile: true
    vi.mocked(useProfileContext).mockReturnValue({
      pubky: mockCurrentUserPubky,
      isOwnProfile: true,
      isLoading: false,
    });

    // Mock useProfileHeader to return userNotFound: true (edge case)
    vi.mocked(useProfileHeader).mockReturnValue({
      profile: {
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      },
      stats: asOpaque<ReturnType<typeof useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      isProfileLoading: false,
      userNotFound: true,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    // Should still show layout for own profile
    expect(screen.getByTestId('profile-page-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-user-not-found-discovery')).not.toBeInTheDocument();
  });

  it('does not show UserNotFound during logout even if userNotFound is true', async () => {
    // Mock useProfileContext to return isOwnProfile: false (simulating state after logout clears auth)
    vi.mocked(useProfileContext).mockReturnValue({
      pubky: '',
      isOwnProfile: false,
      isLoading: false,
    });

    // Mock useAuthStore to return isLoggingOut: true (global logout state)
    vi.mocked(useAuthStore).mockImplementation((selector: (state: AuthStore) => unknown) => {
      const stateWithLogout = mockAuthStore({ ...mockAuthStoreState, isLoggingOut: true });
      return selector(stateWithLogout);
    });

    // Mock useProfileHeader to return userNotFound: true
    vi.mocked(useProfileHeader).mockReturnValue({
      profile: {
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      },
      stats: asOpaque<ReturnType<typeof useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      isProfileLoading: false,
      userNotFound: true,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    // Should NOT show UserNotFound during logout to prevent flash of error state
    expect(screen.queryByTestId('profile-user-not-found-discovery')).not.toBeInTheDocument();
    // Should show the profile layout instead
    expect(screen.getByTestId('profile-page-layout')).toBeInTheDocument();
  });
});
