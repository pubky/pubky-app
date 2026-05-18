import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_PAGE_TYPES } from '@/app/profile/types';
import { ProfilePageLayout } from './ProfilePageLayout';
import { ProfilePageLayoutProps } from './ProfilePageLayout.types';

// Mock molecules and organisms
vi.mock('@/atoms/Container/Container', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    Container: React.forwardRef<
      HTMLDivElement,
      React.HTMLAttributes<HTMLDivElement> & {
        overrideDefaults?: boolean;
      }
    >(function MockContainer({ children, className, overrideDefaults, ...props }, ref) {
      return (
        <div ref={ref} data-testid="container" data-override={overrideDefaults} className={className} {...props}>
          {children}
        </div>
      );
    }),
  };
});

vi.mock('@/molecules/AvatarZoomModal/AvatarZoomModal', () => {
  return {
    AvatarZoomModal: ({
      open,
      onClose,
      avatarUrl,
      name,
      fallbackSeed,
    }: {
      open: boolean;
      onClose: () => void;
      avatarUrl?: string;
      name: string;
      fallbackSeed?: string;
    }) =>
      open ? (
        <div
          data-testid="avatar-zoom-modal"
          data-avatar-url={avatarUrl}
          data-name={name}
          data-fallback-seed={fallbackSeed}
        >
          <button data-testid="modal-close" onClick={onClose}>
            Close
          </button>
        </div>
      ) : null,
  };
});

vi.mock('@/molecules/MobileFooter/MobileFooter', () => {
  return {
    MobileFooter: () => <div data-testid="mobile-footer">Footer</div>,
  };
});

vi.mock('@/molecules/MobileHeader/MobileHeader', () => {
  return {
    MobileHeader: ({ showLeftButton, showRightButton }: { showLeftButton?: boolean; showRightButton?: boolean }) => (
      <div data-testid="mobile-header" data-left={showLeftButton} data-right={showRightButton}>
        Mobile Header
      </div>
    ),
  };
});

vi.mock('@/molecules/ProfilePageFilterBar/ProfilePageFilterBar', () => {
  return {
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
  };
});

vi.mock('@/molecules/ProfilePageLayoutWrapper/ProfilePageLayoutWrapper', () => {
  return {
    ProfilePageLayoutWrapper: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="profile-page-layout-wrapper">{children}</div>
    ),
  };
});

vi.mock('@/molecules/ProfilePageMobileMenu/ProfilePageMobileMenu', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    ProfilePageMobileMenu: React.forwardRef<HTMLDivElement, { activePage: string }>(function MockProfilePageMobileMenu(
      { activePage },
      ref,
    ) {
      return (
        <div ref={ref} data-testid="profile-page-mobile-menu" data-active={activePage}>
          Profile Mobile Menu
        </div>
      );
    }),
  };
});

const mockIsMobile = vi.fn(() => false);

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile(),
}));

vi.mock('@/organisms/ProfilePageHeader/ProfilePageHeader', () => {
  return {
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
  };
});

vi.mock('@/organisms/ProfilePageSidebar/ProfilePageSidebar', () => {
  return {
    ProfilePageSidebar: () => <div data-testid="profile-sidebar">Sidebar</div>,
  };
});

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
  followLoadingAction: null,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders without errors', () => {
    render(<ProfilePageLayout {...defaultProps} />);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders all main sections', () => {
    render(<ProfilePageLayout {...defaultProps} />);

    expect(screen.getByTestId('mobile-header')).toBeInTheDocument();
    expect(screen.getByTestId('profile-page-mobile-menu')).toBeInTheDocument();
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
    const menu = screen.getByTestId('profile-page-mobile-menu');
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

  it('renders a single profile header above the posts section for other-user posts', () => {
    const { container } = render(
      <ProfilePageLayout
        {...defaultProps}
        activePage={PROFILE_PAGE_TYPES.POSTS}
        filterBarActivePage={PROFILE_PAGE_TYPES.POSTS}
        isOwnProfile={false}
      >
        <div data-testid="posts-content">Posts Content</div>
      </ProfilePageLayout>,
    );

    const profileHeader = screen.getByTestId('profile-page-header');
    const postsFeed = container.querySelector('[data-cy="profile-posts-feed"]');
    expect(screen.getAllByTestId('profile-page-header')).toHaveLength(1);
    expect(profileHeader.compareDocumentPosition(postsFeed!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(postsFeed).toContainElement(screen.getByTestId('posts-content'));
    expect(screen.getByTestId('posts-content')).toBeInTheDocument();
  });

  it('scrolls mobile other-user posts into view after the profile header loads', () => {
    mockIsMobile.mockReturnValue(true);
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect(
      this: HTMLElement,
    ) {
      if (this.getAttribute('data-testid') === 'profile-page-mobile-menu') {
        return new DOMRect(0, 80, 0, 64);
      }
      return new DOMRect();
    });

    const props = {
      ...defaultProps,
      activePage: PROFILE_PAGE_TYPES.POSTS,
      filterBarActivePage: PROFILE_PAGE_TYPES.POSTS,
      isOwnProfile: false,
    };
    const { container, rerender } = render(
      <ProfilePageLayout {...props} isLoading={true}>
        <div data-testid="posts-content">Posts Content</div>
      </ProfilePageLayout>,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(
      <ProfilePageLayout {...props} isLoading={false}>
        <div data-testid="posts-content">Posts Content</div>
      </ProfilePageLayout>,
    );

    const postsFeed = container.querySelector<HTMLElement>('[data-cy="profile-posts-feed"]');
    expect(postsFeed).toHaveClass('min-h-[calc(100dvh-var(--header-height-mobile))]', 'min-w-0');
    expect(postsFeed?.style.scrollMarginTop).toBe('144px');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('only scrolls once per user even if the layout re-renders', () => {
    mockIsMobile.mockReturnValue(true);
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const props = {
      ...defaultProps,
      activePage: PROFILE_PAGE_TYPES.POSTS,
      filterBarActivePage: PROFILE_PAGE_TYPES.POSTS,
      isOwnProfile: false,
    };
    const { rerender } = render(
      <ProfilePageLayout {...props}>
        <div data-testid="posts-content">Posts Content</div>
      </ProfilePageLayout>,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(
      <ProfilePageLayout {...props}>
        <div data-testid="posts-content">Posts Content updated</div>
      </ProfilePageLayout>,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not set scroll-margin-top when the sticky mobile menu has not laid out yet', () => {
    mockIsMobile.mockReturnValue(true);
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    // Default DOMRect → bottom = 0, simulates the menu element existing but not yet measured.

    const { container } = render(
      <ProfilePageLayout
        {...defaultProps}
        activePage={PROFILE_PAGE_TYPES.POSTS}
        filterBarActivePage={PROFILE_PAGE_TYPES.POSTS}
        isOwnProfile={false}
      >
        <div data-testid="posts-content">Posts Content</div>
      </ProfilePageLayout>,
    );

    const postsFeed = container.querySelector<HTMLElement>('[data-cy="profile-posts-feed"]');
    expect(postsFeed?.style.scrollMarginTop).toBe('');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
  });

  it('does not auto-scroll other-user posts on desktop', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <ProfilePageLayout
        {...defaultProps}
        activePage={PROFILE_PAGE_TYPES.POSTS}
        filterBarActivePage={PROFILE_PAGE_TYPES.POSTS}
        isOwnProfile={false}
      >
        <div data-testid="posts-content">Posts Content</div>
      </ProfilePageLayout>,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('resets mobile scroll to top when leaving other-user posts for another profile tab', () => {
    mockIsMobile.mockReturnValue(true);
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal('scrollTo', scrollTo);

    const props = {
      ...defaultProps,
      activePage: PROFILE_PAGE_TYPES.POSTS,
      filterBarActivePage: PROFILE_PAGE_TYPES.POSTS,
      isOwnProfile: false,
    };
    const { rerender } = render(
      <ProfilePageLayout {...props}>
        <div data-testid="posts-content">Posts Content</div>
      </ProfilePageLayout>,
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollTo).not.toHaveBeenCalled();

    rerender(
      <ProfilePageLayout
        {...props}
        activePage={PROFILE_PAGE_TYPES.FOLLOWERS}
        filterBarActivePage={PROFILE_PAGE_TYPES.FOLLOWERS}
      >
        <div data-testid="followers-content">Followers Content</div>
      </ProfilePageLayout>,
    );

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does not add the mobile posts header for own-profile posts', () => {
    render(
      <ProfilePageLayout
        {...defaultProps}
        activePage={PROFILE_PAGE_TYPES.POSTS}
        filterBarActivePage={PROFILE_PAGE_TYPES.POSTS}
        isOwnProfile={true}
      />,
    );

    expect(screen.getAllByTestId('profile-page-header')).toHaveLength(1);
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
      expect(modal).toHaveAttribute('data-fallback-seed', defaultProps.userId);
    });

    it('passes onAvatarClick action to ProfilePageHeader', () => {
      render(<ProfilePageLayout {...defaultProps} />);

      const header = screen.getByTestId('profile-page-header');
      const actionsKeys = JSON.parse(header.getAttribute('data-actions') || '[]');

      expect(actionsKeys).toContain('onAvatarClick');
    });
  });
});
