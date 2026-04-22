import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfilePageContainer } from './ProfilePageContainer';
import { PROFILE_PAGE_TYPES } from '@/app/profile/types';
import type { AuthStore } from '@/core/stores/auth/auth.types';
import { asOpaque, mockAuthStore } from '@/test-utils';

// Mock Core
const mockCurrentUserPubky = 'user123';
const mockAuthStoreState = {
  currentUserPubky: mockCurrentUserPubky,
  isLoggingOut: false,
};
vi.mock('@/core', () => ({
  useAuthStore: vi.fn((selector: (state: AuthStore) => unknown) => selector(mockAuthStore(mockAuthStoreState))),
}));

// Mock Providers
vi.mock('@/providers', () => ({
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
  publicKey: 'pubkyuser123',
  emoji: '🌴',
  status: 'Available',
  avatarUrl: 'https://example.com/avatar.jpg',
  link: 'https://example.com/profile/user123',
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

vi.mock('@/hooks', () => ({
  useProfileHeader: vi.fn(() => ({
    profile: mockProfile,
    stats: mockStats,
    actions: mockActions,
    isLoading: false,
    userNotFound: false,
  })),
  useProfileNavigation: vi.fn(() => ({
    activePage: PROFILE_PAGE_TYPES.NOTIFICATIONS,
    filterBarActivePage: PROFILE_PAGE_TYPES.NOTIFICATIONS,
    navigateToPage: mockNavigateToPage,
  })),
  useRequireAuth: vi.fn(() => ({
    isAuthenticated: true,
    requireAuth: vi.fn((callback) => callback()),
  })),
  useFollowUser: vi.fn(() => ({
    toggleFollow: vi.fn(),
    isLoading: false,
    loadingAction: null,
    error: null,
  })),
  useIsFollowing: vi.fn(() => ({
    isFollowing: false,
    isLoading: false,
  })),
}));

// Mock Molecules for UserNotFound component
vi.mock('@/molecules', () => ({
  MobileHeader: ({ showLeftButton, showRightButton }: { showLeftButton: boolean; showRightButton: boolean }) => (
    <div data-testid="mobile-header" data-left={showLeftButton} data-right={showRightButton} />
  ),
  MobileFooter: () => <div data-testid="mobile-footer" />,
  ProfilePageLayoutWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="profile-page-layout-wrapper">{children}</div>
  ),
  UserNotFound: () => <div data-testid="user-not-found">User not found</div>,
}));

// Mock Organisms - ProfilePageLayout
vi.mock('@/organisms', () => ({
  ProfilePageLayout: ({
    children,
    profile,
    stats,
    actions,
    activePage,
    filterBarActivePage,
    isLoading,
  }: {
    children: React.ReactNode;
    profile: Record<string, unknown>;
    stats: Record<string, unknown>;
    actions: Record<string, unknown>;
    activePage: string;
    filterBarActivePage: string;
    navigateToPage: (page: string) => void;
    isLoading: boolean;
  }) => (
    <div
      data-testid="profile-page-layout"
      data-profile={JSON.stringify(profile)}
      data-stats={JSON.stringify(stats)}
      data-actions-count={Object.keys(actions).length}
      data-active-page={activePage}
      data-filter-bar-page={filterBarActivePage}
      data-is-loading={isLoading}
    >
      {children}
    </div>
  ),
}));

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

  it('shows UserNotFound when user is not found and not own profile', async () => {
    // Mock useProfileContext to return isOwnProfile: false
    const providers = await import('@/providers');
    vi.mocked(providers.useProfileContext).mockReturnValue({
      pubky: 'nonexistent-user',
      isOwnProfile: false,
      isLoading: false,
    });

    // Mock useProfileHeader to return userNotFound: true
    const hooks = await import('@/hooks');
    vi.mocked(hooks.useProfileHeader).mockReturnValue({
      profile: {
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      },
      stats: asOpaque<ReturnType<typeof hooks.useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof hooks.useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      userNotFound: true,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    expect(screen.getByTestId('user-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-page-layout')).not.toBeInTheDocument();
  });

  it('shows ProfilePageLayout when user is found', async () => {
    // Reset to default mocks
    const providers = await import('@/providers');
    vi.mocked(providers.useProfileContext).mockReturnValue({
      pubky: mockCurrentUserPubky,
      isOwnProfile: true,
      isLoading: false,
    });

    const hooks = await import('@/hooks');
    vi.mocked(hooks.useProfileHeader).mockReturnValue({
      profile: mockProfile,
      stats: asOpaque<ReturnType<typeof hooks.useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof hooks.useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      userNotFound: false,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    expect(screen.getByTestId('profile-page-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('user-not-found')).not.toBeInTheDocument();
  });

  it('does not show UserNotFound for own profile even if userNotFound is true', async () => {
    // Mock useProfileContext to return isOwnProfile: true
    const providers = await import('@/providers');
    vi.mocked(providers.useProfileContext).mockReturnValue({
      pubky: mockCurrentUserPubky,
      isOwnProfile: true,
      isLoading: false,
    });

    // Mock useProfileHeader to return userNotFound: true (edge case)
    const hooks = await import('@/hooks');
    vi.mocked(hooks.useProfileHeader).mockReturnValue({
      profile: {
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      },
      stats: asOpaque<ReturnType<typeof hooks.useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof hooks.useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      userNotFound: true,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    // Should still show layout for own profile
    expect(screen.getByTestId('profile-page-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('user-not-found')).not.toBeInTheDocument();
  });

  it('does not show UserNotFound during logout even if userNotFound is true', async () => {
    // Mock useProfileContext to return isOwnProfile: false (simulating state after logout clears auth)
    const providers = await import('@/providers');
    vi.mocked(providers.useProfileContext).mockReturnValue({
      pubky: '',
      isOwnProfile: false,
      isLoading: false,
    });

    // Mock useAuthStore to return isLoggingOut: true (global logout state)
    const core = await import('@/core');
    vi.mocked(core.useAuthStore).mockImplementation((selector: (state: AuthStore) => unknown) => {
      const stateWithLogout = mockAuthStore({ ...mockAuthStoreState, isLoggingOut: true });
      return selector(stateWithLogout);
    });

    // Mock useProfileHeader to return userNotFound: true
    const hooks = await import('@/hooks');
    vi.mocked(hooks.useProfileHeader).mockReturnValue({
      profile: {
        name: '',
        bio: '',
        publicKey: '',
        emoji: '🌴',
        status: '',
        avatarUrl: undefined,
        link: '',
      },
      stats: asOpaque<ReturnType<typeof hooks.useProfileHeader>['stats']>(mockStats),
      actions: asOpaque<ReturnType<typeof hooks.useProfileHeader>['actions']>(mockActions),
      isLoading: false,
      userNotFound: true,
    });

    render(
      <ProfilePageContainer>
        <div>Test Content</div>
      </ProfilePageContainer>,
    );

    // Should NOT show UserNotFound during logout to prevent flash of error state
    expect(screen.queryByTestId('user-not-found')).not.toBeInTheDocument();
    // Should show the profile layout instead
    expect(screen.getByTestId('profile-page-layout')).toBeInTheDocument();
  });
});
