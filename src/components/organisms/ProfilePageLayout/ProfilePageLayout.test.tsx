import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfilePageLayout } from './ProfilePageLayout';
import { ProfilePageLayoutProps } from './ProfilePageLayout.types';
import { PROFILE_PAGE_TYPES } from '@/app/profile/types';

// Mock molecules and organisms
vi.mock('@/atoms', () => ({
  Container: ({
    children,
    className,
    overrideDefaults,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
    [key: string]: unknown;
  }) => (
    <div data-testid="container" data-override={overrideDefaults} className={className} {...props}>
      {children}
    </div>
  ),
}));

vi.mock('@/molecules', () => ({
  MobileHeader: ({ showLeftButton, showRightButton }: { showLeftButton?: boolean; showRightButton?: boolean }) => (
    <div data-testid="mobile-header" data-left={showLeftButton} data-right={showRightButton}>
      Mobile Header
    </div>
  ),
  ProfilePageMobileMenu: ({ activePage }: { activePage: string; onPageChangeAction: (page: string) => void }) => (
    <div data-testid="profile-mobile-menu" data-active={activePage}>
      Profile Mobile Menu
    </div>
  ),
  ProfilePageFilterBar: ({
    activePage,
    stats,
  }: {
    activePage: string;
    onPageChangeAction: (page: string) => void;
    stats: Record<string, number>;
  }) => (
    <div data-testid="profile-filter-bar" data-active={activePage} data-stats={JSON.stringify(stats)}>
      Filter Bar
    </div>
  ),
  ProfilePageLayoutWrapper: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="profile-page-layout-wrapper">{children}</div>
  ),
  MobileFooter: () => <div data-testid="mobile-footer">Footer</div>,
  AvatarZoomModal: ({
    open,
    onClose,
    avatarUrl,
    name,
  }: {
    open: boolean;
    onClose: () => void;
    avatarUrl?: string;
    name: string;
  }) =>
    open ? (
      <div data-testid="avatar-zoom-modal" data-avatar-url={avatarUrl} data-name={name}>
        <button data-testid="modal-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

vi.mock('@/organisms', () => ({
  ProfilePageHeader: ({
    profile,
    actions,
  }: {
    profile: Record<string, unknown>;
    actions: Record<string, () => void>;
  }) => {
    const handleAvatarClick = actions.onAvatarClick || (() => {});
    return (
      <div
        data-testid="profile-page-header"
        data-profile={JSON.stringify(profile)}
        data-actions={JSON.stringify(Object.keys(actions))}
      >
        <button data-testid="avatar-button" onClick={handleAvatarClick}>
          Click Avatar
        </button>
        Profile Header
      </div>
    );
  },
  ProfilePageSidebar: () => <div data-testid="profile-sidebar">Sidebar</div>,
}));

const mockProfile = {
  name: 'Test User',
  bio: 'Test bio',
  publicKey: 'pk:test123',
  emoji: '🌴',
  status: 'Available',
  avatarUrl: 'https://example.com/avatar.jpg',
  link: 'https://example.com/profile/test123',
};

const mockStats = {
  notifications: 5,
  posts: 10,
  replies: 3,
  followers: 100,
  following: 50,
  friends: 25,
  tagged: 7,
  uniqueTags: 12,
};

const mockActions = {
  onEdit: vi.fn(),
  onCopyPublicKey: vi.fn(),
  onCopyLink: vi.fn(),
  onSignOut: vi.fn(),
  onStatusChange: vi.fn(),
};

const defaultProps: ProfilePageLayoutProps = {
  children: <div>Test Content</div>,
  profile: mockProfile,
  stats: mockStats,
  actions: mockActions,
  activePage: PROFILE_PAGE_TYPES.NOTIFICATIONS,
  filterBarActivePage: PROFILE_PAGE_TYPES.NOTIFICATIONS,
  navigateToPage: vi.fn(),
  isLoading: false,
  userId: 'test123',
};

describe('ProfilePageLayout', () => {
  it('renders without errors', () => {
    render(<ProfilePageLayout {...defaultProps} />);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders all main sections', () => {
    render(<ProfilePageLayout {...defaultProps} />);

    expect(screen.getByTestId('mobile-header')).toBeInTheDocument();
    expect(screen.getByTestId('profile-mobile-menu')).toBeInTheDocument();
    expect(screen.getByTestId('profile-page-layout-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('profile-filter-bar')).toBeInTheDocument();
    expect(screen.getByTestId('profile-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-footer')).toBeInTheDocument();
  });

  it('passes correct props to MobileHeader', () => {
    render(<ProfilePageLayout {...defaultProps} />);
    const header = screen.getByTestId('mobile-header');
    expect(header).toHaveAttribute('data-left', 'false');
    expect(header).toHaveAttribute('data-right', 'false');
  });

  it('passes correct activePage to ProfilePageMobileMenu', () => {
    render(<ProfilePageLayout {...defaultProps} activePage={PROFILE_PAGE_TYPES.POSTS} />);
    const menu = screen.getByTestId('profile-mobile-menu');
    expect(menu).toHaveAttribute('data-active', PROFILE_PAGE_TYPES.POSTS);
  });

  it('passes correct activePage to ProfilePageFilterBar', () => {
    render(<ProfilePageLayout {...defaultProps} filterBarActivePage={PROFILE_PAGE_TYPES.REPLIES} />);
    const filterBar = screen.getByTestId('profile-filter-bar');
    expect(filterBar).toHaveAttribute('data-active', PROFILE_PAGE_TYPES.REPLIES);
  });

  it('passes stats to ProfilePageFilterBar', () => {
    render(<ProfilePageLayout {...defaultProps} />);
    const filterBar = screen.getByTestId('profile-filter-bar');
    const statsData = JSON.parse(filterBar.getAttribute('data-stats') || '{}');
    expect(statsData).toEqual(mockStats);
  });

  it('does not render ProfilePageHeader when loading', () => {
    render(<ProfilePageLayout {...defaultProps} isLoading={true} />);
    expect(screen.queryByTestId('profile-page-header')).not.toBeInTheDocument();
  });

  it('renders ProfilePageHeader when not loading', () => {
    render(<ProfilePageLayout {...defaultProps} isLoading={false} />);
    expect(screen.getByTestId('profile-page-header')).toBeInTheDocument();
  });

  it('passes profile data to ProfilePageHeader', () => {
    render(<ProfilePageLayout {...defaultProps} />);
    const header = screen.getByTestId('profile-page-header');
    const profileData = JSON.parse(header.getAttribute('data-profile') || '{}');
    expect(profileData).toEqual(mockProfile);
  });

  it('passes actions to ProfilePageHeader', () => {
    render(<ProfilePageLayout {...defaultProps} />);
    const header = screen.getByTestId('profile-page-header');
    expect(header).toHaveAttribute('data-actions');
  });

  it('renders children in the correct location', () => {
    render(
      <ProfilePageLayout {...defaultProps}>
        <div data-testid="custom-child">Custom Content</div>
      </ProfilePageLayout>,
    );
    expect(screen.getByTestId('custom-child')).toBeInTheDocument();
  });

  it('matches snapshot with default props', () => {
    const { container } = render(<ProfilePageLayout {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when loading', () => {
    const { container } = render(<ProfilePageLayout {...defaultProps} isLoading={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different active pages', () => {
    const { container } = render(
      <ProfilePageLayout
        {...defaultProps}
        activePage={PROFILE_PAGE_TYPES.POSTS}
        filterBarActivePage={PROFILE_PAGE_TYPES.POSTS}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  describe('Avatar Zoom Modal', () => {
    it('does not show modal initially', () => {
      render(<ProfilePageLayout {...defaultProps} />);
      expect(screen.queryByTestId('avatar-zoom-modal')).not.toBeInTheDocument();
    });

    it('shows modal when avatar is clicked', () => {
      render(<ProfilePageLayout {...defaultProps} />);

      const avatarButton = screen.getByTestId('avatar-button');
      fireEvent.click(avatarButton);

      expect(screen.getByTestId('avatar-zoom-modal')).toBeInTheDocument();
    });

    it('closes modal when close button is clicked', () => {
      render(<ProfilePageLayout {...defaultProps} />);

      // Open modal
      const avatarButton = screen.getByTestId('avatar-button');
      fireEvent.click(avatarButton);
      expect(screen.getByTestId('avatar-zoom-modal')).toBeInTheDocument();

      // Close modal
      const closeButton = screen.getByTestId('modal-close');
      fireEvent.click(closeButton);
      expect(screen.queryByTestId('avatar-zoom-modal')).not.toBeInTheDocument();
    });

    it('passes correct props to modal', () => {
      render(<ProfilePageLayout {...defaultProps} />);

      const avatarButton = screen.getByTestId('avatar-button');
      fireEvent.click(avatarButton);

      const modal = screen.getByTestId('avatar-zoom-modal');
      expect(modal).toHaveAttribute('data-avatar-url', mockProfile.avatarUrl);
      expect(modal).toHaveAttribute('data-name', mockProfile.name);
    });

    it('passes onAvatarClick action to ProfilePageHeader', () => {
      render(<ProfilePageLayout {...defaultProps} />);

      const header = screen.getByTestId('profile-page-header');
      const actionsKeys = JSON.parse(header.getAttribute('data-actions') || '[]');

      expect(actionsKeys).toContain('onAvatarClick');
    });
  });
});
