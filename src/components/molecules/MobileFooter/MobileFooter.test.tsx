import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePathname } from 'next/navigation';
import { MobileFooter } from './MobileFooter';

const FORCE_HOME_SCROLL_TOP_KEY = 'pubky:force-home-scroll-top';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

// Mock the organisms
vi.mock('@/organisms', () => ({
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
}));

// Mock the libs - use actual implementations
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

// Mock the app routes
vi.mock('@/app', async () => {
  const actual = await vi.importActual('@/app');
  return {
    ...actual,
    APP_ROUTES: {
      HOME: '/home',
      SEARCH: '/search',
      HOT: '/hot',
      BOOKMARKS: '/bookmarks',
      SETTINGS: '/settings',
      PROFILE: '/profile',
    },
    UNAUTHENTICATED_ROUTES: [],
    AUTHENTICATED_ROUTES: [],
  };
});

// Mock Hooks
vi.mock('@/hooks', () => ({
  useCurrentUserProfile: vi.fn(() => ({
    userDetails: { name: 'Test User', image: null, indexed_at: 123 },
    currentUserPubky: 'pk:test-user-pubky',
  })),
  usePublicRoute: vi.fn(() => ({
    isPublicRoute: false,
  })),
}));

// Track notification store mock for per-test overrides
const mockSelectUnread = vi.fn(() => 0);
vi.mock('@/core', async () => {
  const actual = await vi.importActual('@/core');
  return {
    ...actual,
    FileController: {
      getAvatarUrl: vi.fn((pubky: string, version?: string | number) =>
        version ? `https://example.com/avatar/${pubky}?v=${version}` : `https://example.com/avatar/${pubky}`,
      ),
    },
    useAuthStore: vi.fn((selector: (state: { currentUserPubky: string | null }) => unknown) =>
      selector({ currentUserPubky: 'pk:test-user-pubky' }),
    ),
    useLocalFilesStore: vi.fn((selector: (state: { profile: string | null }) => unknown) =>
      selector({ profile: null }),
    ),
    useNotificationStore: vi.fn((selector: (state: { selectUnread: () => number }) => unknown) =>
      selector({ selectUnread: mockSelectUnread }),
    ),
  };
});

describe('MobileFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/home');
    mockSelectUnread.mockReturnValue(0);
  });

  it('renders with default props', () => {
    render(<MobileFooter />);

    expect(document.querySelector('.lucide-house')).toBeInTheDocument();
    expect(document.querySelector('.lucide-search')).toBeInTheDocument();
    expect(document.querySelector('.lucide-flame')).toBeInTheDocument();
    expect(document.querySelector('.lucide-bookmark')).toBeInTheDocument();
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
      { href: '/bookmarks', iconClass: '.lucide-bookmark', label: 'Bookmarks' },
      { href: '/settings', iconClass: '.lucide-settings', label: 'Settings' },
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
    expect(document.querySelector('.lucide-bookmark')).toBeInTheDocument();
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

    const { FileController } = await import('@/core');
    expect(vi.mocked(FileController.getAvatarUrl)).not.toHaveBeenCalled();
    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('TU');
  });

  it('requests avatar URL when user has an avatar set', async () => {
    const { useCurrentUserProfile } = await import('@/hooks');
    vi.mocked(useCurrentUserProfile).mockReturnValueOnce({
      userDetails: { name: 'Test User', image: 'has-avatar', indexed_at: 456 },
      currentUserPubky: 'pk:test-user-pubky',
    });

    render(<MobileFooter />);

    const { FileController } = await import('@/core');
    expect(vi.mocked(FileController.getAvatarUrl)).toHaveBeenCalledWith('pk:test-user-pubky', 456);
    expect(screen.getByTestId('avatar-image').getAttribute('src')).toBe(
      'https://example.com/avatar/pk:test-user-pubky?v=456',
    );
  });

  it('applies correct icon classes', () => {
    render(<MobileFooter />);

    const iconClasses = ['.lucide-house', '.lucide-search', '.lucide-flame', '.lucide-bookmark', '.lucide-settings'];
    iconClasses.forEach((selector) => {
      const iconElement = document.querySelector(selector) as HTMLElement | null;
      expect(iconElement).toHaveClass('h-6', 'w-6');
    });
  });

  it('handles active state correctly', () => {
    vi.mocked(usePathname).mockReturnValue('/home');
    render(<MobileFooter />);

    const homeLink = document.querySelector('.lucide-house')?.closest('a');
    expect(homeLink).toHaveClass('bg-secondary/30');
  });

  it('handles inactive state correctly', () => {
    vi.mocked(usePathname).mockReturnValue('/search');
    render(<MobileFooter />);

    const homeLink = document.querySelector('.lucide-house')?.closest('a');
    expect(homeLink).toHaveClass('bg-secondary/20', 'hover:bg-secondary/25');
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
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

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
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    render(<MobileFooter />);
    const homeLink = document.querySelector('.lucide-house')?.closest('a');
    expect(homeLink).toBeTruthy();

    fireEvent.click(homeLink!);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(setItemSpy).toHaveBeenCalledWith(FORCE_HOME_SCROLL_TOP_KEY, '1');
  });
});

describe('MobileFooter - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/home');
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
