import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
import * as App from '@/app';

// Mock Next.js navigation
const mockUsePathname = vi.fn();
const mockUseRouter = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => mockUseRouter(),
}));

// Mock auth store - use selector pattern (component calls useAuthStore with selector function)
let mockCurrentUserPubky: string | null = null;
// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(() => ({ name: 'Test User', image: 'test-image.jpg' })),
}));

// Mock atoms, libs, config, and app
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Button: ({ children, onClick, variant }: { children: React.ReactNode; onClick?: () => void; variant?: string }) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
  Link: ({ children, href }: { children: React.ReactNode; href?: string }) => <a href={href}>{children}</a>,
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: ({ src }: { src?: string }) => <img src={src} alt="avatar" />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Typography: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

// Keep real libs for icons and utilities; only stub helpers we rely on for deterministic tests

vi.mock('@/config', () => ({
  GITHUB_URL: 'https://github.com',
  TWITTER_GETPUBKY_URL: 'https://twitter.com',
  TELEGRAM_URL: 'https://telegram.com',
}));

vi.mock('@/app', () => ({
  AUTH_ROUTES: { SIGN_IN: '/sign-in', LOGOUT: '/logout' },
  HOME_ROUTES: { HOME: '/home' },
  ROOT_ROUTES: '/',
  ONBOARDING_ROUTES: {
    HUMAN: '/onboarding/human',
    INSTALL: '/onboarding/install',
    SCAN: '/onboarding/scan',
    PUBKY: '/onboarding/pubky',
    BACKUP: '/onboarding/backup',
    PROFILE: '/onboarding/profile',
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky }),
}));
vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: () => ({ selectUnread: () => 0 }),
}));
vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: {
    read: vi.fn(() => Promise.resolve({ name: 'Test User', image: 'test-image.jpg' })),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn((pubky: string) => `https://cdn.example.com/avatar/${pubky}`),
  },
}));
vi.mock('@/database/franky/franky', () => ({
  db: {
    user_details: {
      get: vi.fn(() => Promise.resolve({ name: 'Test User', image: 'test-image.jpg' })),
    },
  },
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  HeaderContainer: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="header-container" data-class-name={className}>
      {children}
    </div>
  ),
  Logo: ({ noLink }: { noLink?: boolean }) => (
    <div data-testid="logo" data-no-link={noLink}>
      Logo
    </div>
  ),
  HeaderTitle: ({ currentTitle }: { currentTitle: string }) => <div data-testid="header-title">{currentTitle}</div>,
  HeaderOnboarding: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="onboarding-header" data-step={currentStep}>
      Onboarding Step {currentStep}
    </div>
  ),
  HeaderSocialLinks: () => <div data-testid="header-social-links">Social Links</div>,
  HeaderNavigationButtons: ({ avatarImage, avatarInitial }: { avatarImage?: string; avatarInitial?: string }) => (
    <div data-testid="header-navigation-buttons" data-avatar-image={avatarImage} data-avatar-initial={avatarInitial}>
      Navigation Buttons
    </div>
  ),
  SearchInput: () => <div data-testid="search-input">Search Input</div>,
  HeaderHome: () => (
    <div data-testid="header-home">
      <div data-testid="header-social-links">Social Links</div>
      <button>Sign in</button>
    </div>
  ),
  HeaderSignIn: () => (
    <div data-testid="header-sign-in">
      <div data-testid="search-input">Search Input</div>
      <div data-testid="header-navigation-buttons">Navigation Buttons</div>
    </div>
  ),
  HeaderJoin: () => (
    <div data-testid="header-join">
      <button aria-label="Join Pubky">Join</button>
    </div>
  ),
}));

// Mock hooks
const mockIsPublicRoute = vi.fn();
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: vi.fn(() => ({
    userDetails: { name: 'Test User', image: 'test-image.jpg' },
    currentUserPubky: 'test-pubky-123',
  })),
}));

vi.mock('@/hooks/usePublicRoute/usePublicRoute', () => ({
  usePublicRoute: () => ({ isPublicRoute: mockIsPublicRoute() }),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock return values
    mockCurrentUserPubky = null; // Not authenticated by default
    mockUsePathname.mockReturnValue(App.ROOT_ROUTES);
    mockUseRouter.mockReturnValue({ push: vi.fn() });
    mockIsPublicRoute.mockReturnValue(false);
  });

  it('renders header container with logo and home header', () => {
    mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

    render(<Header />);

    expect(screen.getByTestId('header-container')).toBeInTheDocument();
    expect(screen.getByTestId('logo')).toBeInTheDocument();
    // HeaderHome renders social links and sign in button
    expect(screen.getByTestId('header-social-links')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('hides header container on mobile when signed in outside onboarding', () => {
    mockCurrentUserPubky = 'test-pubky-123';
    mockUsePathname.mockReturnValue(App.HOME_ROUTES.HOME);

    render(<Header />);

    const headerContainer = screen.getByTestId('header-container');
    expect(headerContainer).toHaveAttribute('data-class-name', 'hidden lg:block');
  });

  it('keeps header visible on mobile during onboarding when signed in', () => {
    mockCurrentUserPubky = 'test-pubky-123';
    mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.PROFILE);

    render(<Header />);

    const headerContainer = screen.getByTestId('header-container');
    expect(headerContainer).not.toHaveAttribute('data-class-name', 'hidden lg:block');
  });

  it('shows home header for non-onboarding paths', () => {
    mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

    render(<Header />);

    // HeaderHome renders social links and sign in button
    expect(screen.getByTestId('header-social-links')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-header')).not.toBeInTheDocument();
  });

  it('shows onboarding header for onboarding paths', () => {
    mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.INSTALL);

    render(<Header />);

    expect(screen.getByTestId('onboarding-header')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });

  it('displays correct step for install path', () => {
    mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.INSTALL);

    render(<Header />);

    const onboardingHeader = screen.getByTestId('onboarding-header');
    expect(onboardingHeader).toHaveAttribute('data-step', '2');
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('displays correct step for scan path', () => {
    mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.SCAN);

    render(<Header />);

    const onboardingHeader = screen.getByTestId('onboarding-header');
    expect(onboardingHeader).toHaveAttribute('data-step', '3');
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('displays correct step for pubky path', () => {
    mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.PUBKY);

    render(<Header />);

    const onboardingHeader = screen.getByTestId('onboarding-header');
    expect(onboardingHeader).toHaveAttribute('data-step', '3');
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('displays correct step for backup path', () => {
    mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.BACKUP);

    render(<Header />);

    const onboardingHeader = screen.getByTestId('onboarding-header');
    expect(onboardingHeader).toHaveAttribute('data-step', '4');
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('handles unknown paths with default values', () => {
    mockUsePathname.mockReturnValue('/unknown-path');

    render(<Header />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('updates when pathname changes', () => {
    mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.INSTALL);

    const { rerender } = render(<Header />);

    expect(screen.getByTestId('onboarding-header')).toBeInTheDocument();
    const onboardingHeader = screen.getByTestId('onboarding-header');
    expect(onboardingHeader).toHaveAttribute('data-step', '2');

    // Change pathname
    mockUsePathname.mockReturnValue(App.ROOT_ROUTES);
    rerender(<Header />);

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-header')).not.toBeInTheDocument();
  });

  it('correctly identifies onboarding paths', () => {
    const onboardingPaths = [
      App.ONBOARDING_ROUTES.INSTALL,
      App.ONBOARDING_ROUTES.SCAN,
      App.ONBOARDING_ROUTES.PUBKY,
      App.ONBOARDING_ROUTES.BACKUP,
    ];

    onboardingPaths.forEach((path) => {
      mockUsePathname.mockReturnValue(path);

      const { rerender } = render(<Header />);

      expect(screen.getByTestId('onboarding-header')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();

      rerender(<></>); // Clear for next iteration
    });
  });

  it('correctly identifies non-onboarding paths', () => {
    // TODO: Is it in purpose sigin? or it should be sign-in?
    const nonOnboardingPaths = [App.ROOT_ROUTES, '/about', '/contact', '/signin'];

    nonOnboardingPaths.forEach((path) => {
      mockUsePathname.mockReturnValue(path);

      const { rerender } = render(<Header />);

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-header')).not.toBeInTheDocument();

      rerender(<></>); // Clear for next iteration
    });
  });

  describe('Authentication Logic', () => {
    it('renders SignInHeader when user is authenticated', () => {
      mockCurrentUserPubky = 'test-pubky-123';
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      render(<Header />);

      // HeaderSignIn renders search input and navigation buttons
      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      expect(screen.getByTestId('header-navigation-buttons')).toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-header')).not.toBeInTheDocument();
    });

    it('renders HomeHeader when user is not authenticated', () => {
      mockCurrentUserPubky = null;
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      render(<Header />);

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.queryByTestId('search-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-header')).not.toBeInTheDocument();
    });

    it('does not render HeaderTitle when user is authenticated', () => {
      mockCurrentUserPubky = 'test-pubky-123';
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      render(<Header />);

      expect(screen.queryByTestId('header-title')).not.toBeInTheDocument();
    });

    it('renders HomeHeader when user is not authenticated', () => {
      mockCurrentUserPubky = null;
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      render(<Header />);

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.queryByTestId('search-input')).not.toBeInTheDocument();
    });

    it('prioritizes onboarding header over authentication state', () => {
      mockCurrentUserPubky = 'test-pubky-123';
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.INSTALL);

      render(<Header />);

      expect(screen.getByTestId('onboarding-header')).toBeInTheDocument();
      expect(screen.queryByTestId('search-input')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    });
  });

  describe('Logo Configuration', () => {
    it('renders logo with noLink=true when on profile step (step 5)', () => {
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.PROFILE);

      render(<Header />);

      const logo = screen.getByTestId('logo');
      expect(logo).toHaveAttribute('data-no-link', 'true');
    });

    it('renders logo with noLink=false when not on profile step', () => {
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.INSTALL);

      render(<Header />);

      const logo = screen.getByTestId('logo');
      expect(logo).toHaveAttribute('data-no-link', 'false');
    });
  });

  describe('Logout Path Configuration', () => {
    it('handles logout path correctly', () => {
      mockUsePathname.mockReturnValue(App.AUTH_ROUTES.LOGOUT);

      render(<Header />);

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByTestId('logo')).toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-header')).not.toBeInTheDocument();
    });

    it('sets correct step for logout path', () => {
      mockUsePathname.mockReturnValue(App.AUTH_ROUTES.LOGOUT);

      render(<Header />);

      // Since logout is not an onboarding path, it should show HomeHeader
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-header')).not.toBeInTheDocument();
    });
  });

  describe('Path Configuration', () => {
    it('displays correct step for human path', () => {
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.HUMAN);

      render(<Header />);

      const onboardingHeader = screen.getByTestId('onboarding-header');
      expect(onboardingHeader).toHaveAttribute('data-step', '1');
      expect(screen.getByTestId('logo')).toBeInTheDocument();
    });

    it('displays correct step for profile path', () => {
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.PROFILE);

      render(<Header />);

      const onboardingHeader = screen.getByTestId('onboarding-header');
      expect(onboardingHeader).toHaveAttribute('data-step', '5');
      expect(screen.getByTestId('logo')).toBeInTheDocument();
    });
  });

  describe('HeaderTitle Display Logic', () => {
    it('does not render HeaderTitle for unauthenticated users on public routes', () => {
      mockCurrentUserPubky = null;
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      render(<Header />);

      // No title should be shown on public routes (like /, /profile/[pubky], /post/[x]/[y])
      // This matches Pubky-app behavior where header shows just Logo + Join button
      expect(screen.queryByTestId('header-title')).not.toBeInTheDocument();
    });

    it('renders HeaderTitle for unauthenticated users on logout route', () => {
      mockCurrentUserPubky = null;
      mockUsePathname.mockReturnValue(App.AUTH_ROUTES.LOGOUT);

      render(<Header />);

      expect(screen.getByTestId('header-title')).toBeInTheDocument();
      expect(screen.getByTestId('header-title')).toHaveTextContent('Signed out');
    });

    it('renders HeaderTitle when on step 5 (profile) even if signed in', () => {
      mockCurrentUserPubky = 'test-pubky-123';
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.PROFILE);

      render(<Header />);

      expect(screen.getByTestId('header-title')).toBeInTheDocument();
      expect(screen.getByTestId('header-title')).toHaveTextContent('Profile');
    });

    it('does not render HeaderTitle when signed in and not on step 5', () => {
      mockCurrentUserPubky = 'test-pubky-123';
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      render(<Header />);

      expect(screen.queryByTestId('header-title')).not.toBeInTheDocument();
    });

    it('renders HeaderTitle with correct title for each onboarding step', () => {
      const testCases = [
        { path: App.ONBOARDING_ROUTES.HUMAN, expectedTitle: 'Create account' },
        { path: App.ONBOARDING_ROUTES.INSTALL, expectedTitle: 'Identity keys' },
        { path: App.ONBOARDING_ROUTES.SCAN, expectedTitle: 'Use Pubky Ring' },
        { path: App.ONBOARDING_ROUTES.PUBKY, expectedTitle: 'Your pubky' },
        { path: App.ONBOARDING_ROUTES.BACKUP, expectedTitle: 'Backup' },
        { path: App.ONBOARDING_ROUTES.PROFILE, expectedTitle: 'Profile' },
        { path: App.AUTH_ROUTES.LOGOUT, expectedTitle: 'Signed out' },
      ];

      testCases.forEach(({ path, expectedTitle }) => {
        mockUsePathname.mockReturnValue(path);
        mockCurrentUserPubky = null;

        const { rerender } = render(<Header />);

        console.log('path:', path, 'expectedTitle:', expectedTitle, testCases);
        expect(screen.getByTestId('header-title')).toHaveTextContent(expectedTitle);

        rerender(<></>); // Clear for next iteration
      });
    });
  });

  describe('Step 5 (Profile) Specific Logic', () => {
    it('renders logo with noLink=true only on step 5 (profile)', () => {
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.PROFILE);

      render(<Header />);

      const logo = screen.getByTestId('logo');
      expect(logo).toHaveAttribute('data-no-link', 'true');
    });

    it('renders logo with noLink=false on all other steps', () => {
      const nonProfilePaths = [
        App.ONBOARDING_ROUTES.INSTALL,
        App.ONBOARDING_ROUTES.SCAN,
        App.ONBOARDING_ROUTES.PUBKY,
        App.ONBOARDING_ROUTES.BACKUP,
        App.ONBOARDING_ROUTES.HUMAN,
        App.ROOT_ROUTES,
        App.AUTH_ROUTES.LOGOUT,
      ];

      nonProfilePaths.forEach((path) => {
        mockUsePathname.mockReturnValue(path);

        const { rerender } = render(<Header />);

        const logo = screen.getByTestId('logo');
        expect(logo).toHaveAttribute('data-no-link', 'false');

        rerender(<></>); // Clear for next iteration
      });
    });

    it('shows HeaderTitle on step 5 regardless of authentication state', () => {
      // Test with authenticated user
      mockCurrentUserPubky = 'test-pubky-123';
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.PROFILE);

      const { rerender } = render(<Header />);

      expect(screen.getByTestId('header-title')).toBeInTheDocument();
      expect(screen.getByTestId('header-title')).toHaveTextContent('Profile');

      // Test with unauthenticated user
      mockCurrentUserPubky = null;
      rerender(<Header />);

      expect(screen.getByTestId('header-title')).toBeInTheDocument();
      expect(screen.getByTestId('header-title')).toHaveTextContent('Profile');
    });
  });

  describe('Public Route Behavior', () => {
    it('renders HeaderJoin when unauthenticated on public route', () => {
      mockCurrentUserPubky = null;
      mockIsPublicRoute.mockReturnValue(true);

      render(<Header />);

      expect(screen.getByTestId('header-join')).toBeInTheDocument();
      expect(screen.queryByTestId('header-home')).not.toBeInTheDocument();
      expect(screen.queryByTestId('header-sign-in')).not.toBeInTheDocument();
    });

    it('renders HeaderHome when unauthenticated on non-public route', () => {
      mockCurrentUserPubky = null;
      mockIsPublicRoute.mockReturnValue(false);
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      render(<Header />);

      expect(screen.getByTestId('header-home')).toBeInTheDocument();
      expect(screen.queryByTestId('header-join')).not.toBeInTheDocument();
    });

    it('renders HeaderSignIn when authenticated regardless of public route', () => {
      mockCurrentUserPubky = 'test-pubky-123';
      mockIsPublicRoute.mockReturnValue(true);

      render(<Header />);

      expect(screen.getByTestId('header-sign-in')).toBeInTheDocument();
      expect(screen.queryByTestId('header-join')).not.toBeInTheDocument();
      expect(screen.queryByTestId('header-home')).not.toBeInTheDocument();
    });

    it('prioritizes onboarding header over public route state', () => {
      mockCurrentUserPubky = null;
      mockIsPublicRoute.mockReturnValue(true);
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.INSTALL);

      render(<Header />);

      expect(screen.getByTestId('onboarding-header')).toBeInTheDocument();
      expect(screen.queryByTestId('header-join')).not.toBeInTheDocument();
    });
  });

  describe('State Updates', () => {
    it('updates authentication state when isAuthenticated changes', () => {
      mockCurrentUserPubky = null;
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      const { rerender } = render(<Header />);

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

      // Change authentication state
      mockCurrentUserPubky = 'test-pubky-123';
      rerender(<Header />);

      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    });

    it('updates path configuration when pathname changes', () => {
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.INSTALL);

      const { rerender } = render(<Header />);

      let onboardingHeader = screen.getByTestId('onboarding-header');
      expect(onboardingHeader).toHaveAttribute('data-step', '2');

      // Change pathname
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.BACKUP);
      rerender(<Header />);

      onboardingHeader = screen.getByTestId('onboarding-header');
      expect(onboardingHeader).toHaveAttribute('data-step', '4');
    });

    it('updates HeaderTitle visibility when authentication state changes on configured routes', () => {
      // Use logout route which has a title configured
      mockUsePathname.mockReturnValue(App.AUTH_ROUTES.LOGOUT);
      mockCurrentUserPubky = null;

      const { rerender } = render(<Header />);

      // Should show HeaderTitle when not authenticated on configured route
      expect(screen.getByTestId('header-title')).toBeInTheDocument();
      expect(screen.getByTestId('header-title')).toHaveTextContent('Signed out');

      // Change to authenticated
      mockCurrentUserPubky = 'test-pubky-123';
      rerender(<Header />);

      // Should hide HeaderTitle when authenticated (not on step 5)
      expect(screen.queryByTestId('header-title')).not.toBeInTheDocument();
    });

    it('updates HeaderTitle visibility when moving to/from step 5', () => {
      mockCurrentUserPubky = 'test-pubky-123';
      mockUsePathname.mockReturnValue(App.ROOT_ROUTES);

      const { rerender } = render(<Header />);

      // Should not show HeaderTitle when authenticated and not on step 5
      expect(screen.queryByTestId('header-title')).not.toBeInTheDocument();

      // Move to step 5 (profile)
      mockUsePathname.mockReturnValue(App.ONBOARDING_ROUTES.PROFILE);
      rerender(<Header />);

      // Should show HeaderTitle when on step 5, even if authenticated
      expect(screen.getByTestId('header-title')).toBeInTheDocument();
      expect(screen.getByTestId('header-title')).toHaveTextContent('Profile');
    });
  });
});
