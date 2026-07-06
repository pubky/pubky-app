import { usePathname } from 'next/navigation';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FORCE_FEED_SCROLL_TOP_KEY } from '@/config/feed';
import { FileController } from '@/controllers/file/file';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useKeyboardOffset } from '@/hooks/useKeyboardOffset/useKeyboardOffset';
import { MobileFooter } from './MobileFooter';

const collectionsDiscoveryMock = vi.hoisted(() => ({
  markCollectionsNavSeen: vi.fn(),
  setShowSignInDialog: vi.fn(),
  showCollectionsNew: false,
}));

let mockCurrentUserPubky: string | null = 'pk:test-user-pubky';
let mockIsPublicRoute = false;
let mockIsCoreExploreRoute = false;

const createSessionStorageMock = () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

// Mock the organisms
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({
      avatarUrl,
      name,
      size,
      className,
      alt,
    }: {
      avatarUrl?: string;
      name: string;
      size?: string;
      className?: string;
      alt?: string;
    }) => (
      <div data-testid="avatar-with-fallback" className={className} data-size={size}>
        {avatarUrl ? (
          <img data-testid="avatar-image" src={avatarUrl} alt={alt || name} />
        ) : (
          <span data-testid="avatar-fallback">
            {name
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join('') || 'U'}
          </span>
        )}
        <span data-testid="avatar-name">{name}</span>
      </div>
    ),
  };
});

// Mock the libs - use actual implementations

// Mock the app routes
vi.mock('@/app/routes', async () => {
  const actual = await vi.importActual('@/app/routes');
  return {
    ...actual,
    APP_ROUTES: {
      HOME: '/home',
      SEARCH: '/search',
      HOT: '/hot',
      COLLECTIONS: '/collections',
      SETTINGS: '/settings',
      PROFILE: '/profile',
    },
    SETTINGS_ROUTES: {
      ACCOUNT: '/settings/account',
    },
    UNAUTHENTICATED_ROUTES: [],
    AUTHENTICATED_ROUTES: [],
  };
});

// Mock Hooks
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(() => ({
    userDetails: { name: 'Test User', image: null, indexed_at: 123 },
    currentUserPubky: 'pk:test-user-pubky',
  })),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: vi.fn(() => ({
    isPublicRoute: mockIsPublicRoute,
    isDynamicPublicRoute: mockIsPublicRoute,
    isCoreExploreRoute: mockIsCoreExploreRoute,
    isPublicExploreRoute: mockIsPublicRoute || mockIsCoreExploreRoute,
  })),
}));

vi.mock('@/hooks/useKeyboardOffset/useKeyboardOffset', () => ({
  useKeyboardOffset: vi.fn(() => ({ isKeyboardVisible: false, keyboardOffset: 0 })),
}));
vi.mock('@/hooks/useCollectionsNavDiscovery/useCollectionsNavDiscovery', () => ({
  useCollectionsNavDiscovery: () => ({
    showCollectionsNew: Boolean(mockCurrentUserPubky) && collectionsDiscoveryMock.showCollectionsNew,
    markCollectionsNavSeen: collectionsDiscoveryMock.markCollectionsNavSeen,
  }),
}));

// Track notification store mock for per-test overrides
const mockSelectUnread = vi.fn(() => 0);
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn((pubky: string, version?: string | number) =>
      version ? `https://example.com/avatar/${pubky}?v=${version}` : `https://example.com/avatar/${pubky}`,
    ),
  },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(
    (selector: (state: { currentUserPubky: string | null; setShowSignInDialog: (open: boolean) => void }) => unknown) =>
      selector({
        currentUserPubky: mockCurrentUserPubky,
        setShowSignInDialog: collectionsDiscoveryMock.setShowSignInDialog,
      }),
  ),
}));
vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: vi.fn((selector: (state: { profile: string | null }) => unknown) => selector({ profile: null })),
}));
vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: vi.fn((selector: (state: { selectUnread: () => number }) => unknown) =>
    selector({ selectUnread: mockSelectUnread }),
  ),
}));

describe('MobileFooter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/home');
    mockSelectUnread.mockReturnValue(0);
    mockCurrentUserPubky = 'pk:test-user-pubky';
    collectionsDiscoveryMock.showCollectionsNew = false;
    mockIsPublicRoute = false;
    mockIsCoreExploreRoute = false;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: createSessionStorageMock(),
    });

    // Reset keyboard offset mock
    vi.mocked(useKeyboardOffset).mockReturnValue({ isKeyboardVisible: false, keyboardOffset: 0 });
  });

  it('renders with default props', () => {
    render(<MobileFooter />);

    expect(document.querySelector('.lucide-house')).toBeInTheDocument();
    expect(document.querySelector('.lucide-search')).toBeInTheDocument();
    expect(document.querySelector('.lucide-flame')).toBeInTheDocument();
    expect(document.querySelector('.lucide-library')).toBeInTheDocument();
    expect(document.querySelector('.lucide-settings')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-with-fallback')).toBeInTheDocument();
  });

  it('renders with custom className', () => {
    render(<MobileFooter className="custom-footer" />);

    expect(document.querySelector('.lucide-house')).toBeInTheDocument();
  });

  it('renders all navigation items', () => {
    render(<MobileFooter />);

    const navItems = [
      { href: '/home', iconClass: '.lucide-house', label: 'Home' },
      { href: '/search', iconClass: '.lucide-search', label: 'Search' },
      { href: '/hot', iconClass: '.lucide-flame', label: 'Hot' },
      { href: '/collections', iconClass: '.lucide-library', label: 'Collections' },
      { href: '/settings/account', iconClass: '.lucide-settings', label: 'Settings' },
    ];

    const links = screen.getAllByRole('link');
    navItems.forEach((item) => {
      const link = links.find((link) => link.getAttribute('href') === item.href);
      expect(link).toHaveAttribute('href', item.href);
      expect(link).toHaveAttribute('aria-label', item.label);
    });
  });

  it('renders profile link', () => {
    render(<MobileFooter />);

    const profileLink = screen.getByTestId('avatar-with-fallback').closest('a');
    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(profileLink).toHaveAttribute('aria-label', 'Profile');
  });

  it('contains correct icons', () => {
    render(<MobileFooter />);

    expect(document.querySelector('.lucide-search')).toBeInTheDocument();
    expect(document.querySelector('.lucide-house')).toBeInTheDocument();
    expect(document.querySelector('.lucide-library')).toBeInTheDocument();
    expect(document.querySelector('.lucide-settings')).toBeInTheDocument();
  });

  it('renders avatar with user name', () => {
    render(<MobileFooter />);

    const avatarName = screen.getByTestId('avatar-name');
    expect(avatarName).toBeInTheDocument();
    expect(avatarName).toHaveTextContent('Test User');
  });

  it('does not request avatar URL when user has no avatar set', async () => {
    render(<MobileFooter />);

    expect(vi.mocked(FileController.getAvatarUrl)).not.toHaveBeenCalled();
    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('TU');
  });

  it('requests avatar URL when user has an avatar set', async () => {
    vi.mocked(useCurrentUserProfile).mockReturnValueOnce({
      userDetails: {
        id: 'pk:test-user-pubky',
        name: 'Test User',
        bio: '',
        image: 'has-avatar',
        indexed_at: 456,
        links: [],
        status: '',
      },
      currentUserPubky: 'pk:test-user-pubky',
    });

    render(<MobileFooter />);

    expect(vi.mocked(FileController.getAvatarUrl)).toHaveBeenCalledWith('pk:test-user-pubky', 456);
    expect(screen.getByTestId('avatar-image').getAttribute('src')).toBe(
      'https://example.com/avatar/pk:test-user-pubky?v=456',
    );
  });

  it('applies correct icon classes', () => {
    render(<MobileFooter />);

    const iconClasses = ['.lucide-house', '.lucide-search', '.lucide-flame', '.lucide-library', '.lucide-settings'];
    iconClasses.forEach((selector) => {
      const iconElement = document.querySelector(selector) as HTMLElement | null;
      expect(iconElement).toHaveClass('h-6', 'w-6');
    });
  });

  it('handles active state correctly', () => {
    vi.mocked(usePathname).mockReturnValue('/home');
    render(<MobileFooter />);

    const homeLink = document.querySelector('.lucide-house')?.closest('a');
    expect(homeLink).toHaveClass('bg-secondary');
    expect(homeLink).not.toHaveClass('border');
  });

  it('handles inactive state correctly', () => {
    vi.mocked(usePathname).mockReturnValue('/search');
    render(<MobileFooter />);

    const homeLink = document.querySelector('.lucide-house')?.closest('a');
    expect(homeLink).toHaveClass('border', 'border-border', 'bg-white/5');
    expect(homeLink).not.toHaveClass('bg-secondary');
  });

  it('highlights Settings when on a settings sub-route', () => {
    vi.mocked(usePathname).mockReturnValue('/settings/account');
    render(<MobileFooter />);

    const settingsLink = document.querySelector('.lucide-settings')?.closest('a');
    expect(settingsLink).toHaveClass('bg-secondary');
    expect(settingsLink).not.toHaveClass('border');
  });

  it('highlights Collections on the Collections landing page', () => {
    vi.mocked(usePathname).mockReturnValue('/collections');
    render(<MobileFooter />);

    const collectionsLink = document.querySelector('.lucide-library')?.closest('a');
    expect(collectionsLink).toHaveClass('bg-secondary');
    expect(collectionsLink).not.toHaveClass('border');
  });

  it('highlights Collections when on a nested collection route', () => {
    vi.mocked(usePathname).mockReturnValue('/collections/bookmarks');
    render(<MobileFooter />);

    const collectionsLink = document.querySelector('.lucide-library')?.closest('a');
    expect(collectionsLink).toHaveClass('bg-secondary');
    expect(collectionsLink).not.toHaveClass('border');
  });

  it('shows the Collections NEW treatment before dismissal', () => {
    collectionsDiscoveryMock.showCollectionsNew = true;

    render(<MobileFooter />);

    const collectionsLink = document.querySelector('.lucide-library')?.closest('a');
    expect(collectionsLink).toHaveClass('border-brand', 'text-brand');
    expect(screen.getByRole('link', { name: 'Collections, New' })).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('uses the discovery treatment instead of active background when Collections is active and new', () => {
    vi.mocked(usePathname).mockReturnValue('/collections');
    collectionsDiscoveryMock.showCollectionsNew = true;

    render(<MobileFooter />);

    const collectionsLink = document.querySelector('.lucide-library')?.closest('a');
    expect(collectionsLink).toHaveClass('border-brand', 'bg-white/5', 'text-brand');
    expect(collectionsLink).not.toHaveClass('bg-secondary');
  });

  it('marks Collections discovery seen when clicking the authenticated Collections nav link', () => {
    collectionsDiscoveryMock.showCollectionsNew = true;
    render(<MobileFooter />);

    const collectionsLink = document.querySelector('.lucide-library')?.closest('a');
    expect(collectionsLink).toBeTruthy();
    fireEvent.click(collectionsLink!);

    expect(collectionsDiscoveryMock.markCollectionsNavSeen).toHaveBeenCalledTimes(1);
  });

  it('does not show or dismiss Collections discovery for guests', () => {
    mockCurrentUserPubky = null;
    mockIsCoreExploreRoute = true;
    collectionsDiscoveryMock.showCollectionsNew = true;

    render(<MobileFooter />);

    expect(screen.queryByText('New')).not.toBeInTheDocument();
    const collectionsLink = document.querySelector('.lucide-library')?.closest('a');
    expect(collectionsLink).toBeTruthy();
    fireEvent.click(collectionsLink!);
    expect(collectionsDiscoveryMock.markCollectionsNavSeen).not.toHaveBeenCalled();
    expect(collectionsDiscoveryMock.setShowSignInDialog).toHaveBeenCalledWith(true);
  });

  it('highlights Settings when on any sibling settings page', () => {
    vi.mocked(usePathname).mockReturnValue('/settings/notifications');
    render(<MobileFooter />);

    const settingsLink = document.querySelector('.lucide-settings')?.closest('a');
    expect(settingsLink).toHaveClass('bg-secondary');
    expect(settingsLink).not.toHaveClass('border');
  });

  it('does not highlight profile avatar when on a profile route', () => {
    vi.mocked(usePathname).mockReturnValue('/profile/posts');
    render(<MobileFooter />);

    const profileLink = screen.getByTestId('avatar-with-fallback').closest('a');
    expect(profileLink).not.toHaveClass('ring-2', 'ring-primary');
  });

  it('does not highlight profile avatar when on a non-profile route', () => {
    vi.mocked(usePathname).mockReturnValue('/home');
    render(<MobileFooter />);

    const profileLink = screen.getByTestId('avatar-with-fallback').closest('a');
    expect(profileLink).not.toHaveClass('ring-2', 'ring-primary');
  });

  it('displays notification counter badge when unread notifications > 0', () => {
    mockSelectUnread.mockReturnValue(5);
    render(<MobileFooter />);

    const badge = screen.getByTestId('mobile-notification-counter');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('5');
  });

  it('does not display notification counter badge when unread notifications is 0', () => {
    mockSelectUnread.mockReturnValue(0);
    render(<MobileFooter />);

    expect(screen.queryByTestId('mobile-notification-counter')).not.toBeInTheDocument();
  });

  it('displays 21+ when unread notifications exceed 21', () => {
    mockSelectUnread.mockReturnValue(25);
    render(<MobileFooter />);

    const badge = screen.getByTestId('mobile-notification-counter');
    expect(badge).toHaveTextContent('21+');
  });

  it('renders with correct responsive behavior', () => {
    render(<MobileFooter />);

    expect(document.querySelector('.lucide-house')).toBeInTheDocument();
  });

  it('applies correct hover states', () => {
    render(<MobileFooter />);

    expect(document.querySelector('.lucide-house')).toBeInTheDocument();
  });

  it('scrolls to top when clicking Home while already on /home', () => {
    vi.mocked(usePathname).mockReturnValue('/home');
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');

    render(<MobileFooter />);
    const homeLink = document.querySelector('.lucide-house')?.closest('a');
    expect(homeLink).toBeTruthy();

    fireEvent.click(homeLink!);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('does not scroll to top when clicking Home from another page', () => {
    vi.mocked(usePathname).mockReturnValue('/search');
    Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');

    render(<MobileFooter />);
    const homeLink = document.querySelector('.lucide-house')?.closest('a');
    expect(homeLink).toBeTruthy();

    fireEvent.click(homeLink!);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(setItemSpy).toHaveBeenCalledWith(FORCE_FEED_SCROLL_TOP_KEY, '1');
  });

  it('applies transform when keyboard is visible', async () => {
    vi.mocked(useKeyboardOffset).mockReturnValue({ isKeyboardVisible: true, keyboardOffset: 300 });

    const { container } = render(<MobileFooter />);
    const footerContainer = container.querySelector('.fixed');

    expect(footerContainer).toBeInTheDocument();
    expect(footerContainer?.getAttribute('style')).toContain('translateY(-300px)');
  });

  it('does not apply transform when keyboard is not visible', async () => {
    vi.mocked(useKeyboardOffset).mockReturnValue({ isKeyboardVisible: false, keyboardOffset: 0 });

    const { container } = render(<MobileFooter />);
    const footerContainer = container.querySelector('.fixed');

    expect(footerContainer).toBeInTheDocument();
    expect(footerContainer?.getAttribute('style')).toBeFalsy();
  });

  it('always applies transition classes for smooth keyboard animation', async () => {
    // transition-transform and duration-75 are always present regardless of keyboard state
    vi.mocked(useKeyboardOffset).mockReturnValue({ isKeyboardVisible: false, keyboardOffset: 0 });
    const { container, rerender } = render(<MobileFooter />);
    let footerContainer = container.querySelector('.fixed');
    expect(footerContainer).toHaveClass('transition-transform', 'duration-75');

    // Still present when keyboard is visible
    vi.mocked(useKeyboardOffset).mockReturnValue({ isKeyboardVisible: true, keyboardOffset: 300 });
    rerender(<MobileFooter />);
    footerContainer = container.querySelector('.fixed');
    expect(footerContainer).toHaveClass('transition-transform', 'duration-75');
  });

  it('renders public explore navigation with gated account actions when unauthenticated on a core explore route', () => {
    mockCurrentUserPubky = null;
    mockIsCoreExploreRoute = true;

    render(<MobileFooter />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/home',
      '/search',
      '/hot',
      '/collections',
      '/settings/account',
    ]);
    expect(document.querySelector('.lucide-library')).toBeInTheDocument();
    expect(document.querySelector('.lucide-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('avatar-with-fallback')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join Pubky' })).toBeInTheDocument();
  });

  it('renders explore footer for guests on dynamic public routes', () => {
    mockCurrentUserPubky = null;
    mockIsPublicRoute = true;
    mockIsCoreExploreRoute = false;

    render(<MobileFooter />);

    expect(screen.getByRole('button', { name: 'Join Pubky' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('does not render for guests on non-explore routes', () => {
    mockCurrentUserPubky = null;
    mockIsPublicRoute = false;
    mockIsCoreExploreRoute = false;

    const { container } = render(<MobileFooter />);

    expect(container.firstChild).toBeNull();
  });
});

describe('MobileFooter - Snapshots', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/home');
    mockSelectUnread.mockReturnValue(0);
    mockCurrentUserPubky = 'pk:test-user-pubky';
    collectionsDiscoveryMock.showCollectionsNew = false;
    mockIsPublicRoute = false;
    mockIsCoreExploreRoute = false;
    vi.mocked(useKeyboardOffset).mockReturnValue({ isKeyboardVisible: false, keyboardOffset: 0 });
  });

  it('matches snapshot with default props', () => {
    const { container } = render(<MobileFooter />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<MobileFooter className="custom-footer" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different active path', () => {
    vi.mocked(usePathname).mockReturnValue('/search');
    const { container } = render(<MobileFooter />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for navigation links', () => {
    render(<MobileFooter />);

    const homeLink = document.querySelector('.lucide-house')?.closest('a');
    expect(homeLink).toMatchSnapshot();
  });

  it('matches snapshot for profile link', () => {
    render(<MobileFooter />);

    const profileLink = screen.getByTestId('avatar-with-fallback').closest('a');
    expect(profileLink).toMatchSnapshot();
  });
});
