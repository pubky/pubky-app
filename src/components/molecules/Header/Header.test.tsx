import { usePathname, useRouter } from 'next/navigation';
import { fireEvent, render, screen } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { HeaderButtonSignIn } from '../HeaderButtonSignIn/HeaderButtonSignIn';
import { HeaderHome } from '../HeaderHome/HeaderHome';
import { HeaderSignIn } from '../HeaderSignIn/HeaderSignIn';
import {
  HeaderContainer,
  HeaderExploreNavigationButtons,
  HeaderNavigationButtons,
  HeaderOnboarding,
  HeaderSocialLinks,
  HeaderTitle,
} from './Header';

const collectionsDiscoveryMock = vi.hoisted(() => ({
  markCollectionsNavSeen: vi.fn(),
  showCollectionsNew: false,
}));

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

// Mock direct dependencies
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(),
}));
vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: vi.fn(),
}));
vi.mock('@/hooks/useCollectionsNavDiscovery/useCollectionsNavDiscovery', () => ({
  useCollectionsNavDiscovery: () => ({
    showCollectionsNew: collectionsDiscoveryMock.showCollectionsNew,
    markCollectionsNavSeen: collectionsDiscoveryMock.markCollectionsNavSeen,
  }),
}));
vi.mock('@/stores/search/search.store', () => ({
  useSearchStore: vi.fn(() => ({
    recentUsers: [],
    recentTags: [],
    activeTags: [],
    addUser: vi.fn(),
    addTag: vi.fn(),
    setActiveTags: vi.fn(),
    addActiveTag: vi.fn(),
    removeActiveTag: vi.fn(),
  })),
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
    table: vi.fn(() => ({
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn(),
        })),
      })),
    })),
    user_details: {
      get: vi.fn(),
    },
  },
}));

// Mock the organisms
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({
      name,
      avatarUrl,
      alt,
      className,
    }: {
      name: string;
      avatarUrl?: string;
      alt?: string;
      size?: string;
      className?: string;
    }) => (
      <div
        data-testid="avatar-with-fallback"
        data-name={name}
        data-url={avatarUrl}
        data-alt={alt}
        className={className}
      >
        {name}
      </div>
    ),
  };
});

vi.mock('@/organisms/SearchInput/SearchInput', () => {
  return {
    SearchInput: () => <div data-testid="search-input">Search Input</div>,
  };
});

vi.mock('@/molecules/ProgressSteps/ProgressSteps', () => {
  return {
    ProgressSteps: ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => (
      <div data-testid="progress-steps" data-current={currentStep} data-total={totalSteps}>
        Progress Steps
      </div>
    ),
  };
});

// Mock the libs - keep real implementations and only stub helpers we need

// Mock the config
vi.mock('@/config/externalLinks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/externalLinks')>();
  return {
    ...actual,
    GITHUB_URL: 'https://github.com',
    TWITTER_GETPUBKY_URL: 'https://twitter.com/getpubky',
    TELEGRAM_URL: 'https://t.me/getpubky',
    getGithubLink: () => 'https://github.com',
    getTwitterGetpubkyLink: () => 'https://twitter.com/getpubky',
    getTelegramLink: () => 'https://t.me/getpubky',
  };
});

// Mock the app routes
vi.mock('@/app/routes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/routes')>();
  return {
    ...actual,
    AUTH_ROUTES: {
      SIGN_IN: '/sign-in',
    },
    HOME_ROUTES: {
      HOME: '/home',
    },
  };
});

describe('Header Components', () => {
  const mockPush = vi.fn();
  const mockSetShowSignInDialog = vi.fn();
  const mockRouter = {
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue(mockRouter as ReturnType<typeof useRouter>);
    vi.mocked(usePathname).mockReturnValue('/home');
    collectionsDiscoveryMock.showCollectionsNew = false;
    vi.mocked(useAuthStore).mockImplementation((selector) => {
      const state = {
        currentUserPubky: 'test-pubky',
        setShowSignInDialog: mockSetShowSignInDialog,
      };
      return selector(state as never);
    });
    vi.mocked(useNotificationStore).mockReturnValue({ selectUnread: () => 0 });
    vi.mocked(useLiveQuery).mockReturnValue({ name: 'Test User', image: 'test-image.jpg' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    collectionsDiscoveryMock.showCollectionsNew = false;
  });

  describe('HeaderContainer', () => {
    it('renders with children', () => {
      render(
        <HeaderContainer>
          <div>Test Content</div>
        </HeaderContainer>,
      );

      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('applies correct classes', () => {
      render(
        <HeaderContainer>
          <div>Test Content</div>
        </HeaderContainer>,
      );

      const container = screen.getByRole('banner');
      expect(container).toHaveClass(
        'pointer-events-none',
        'sticky',
        'top-0',
        'z-(--z-sticky-header)',
        'w-full',
        'bg-linear-to-b',
        'from-(--background)',
        'from-50%',
        'to-transparent',
      );

      const innerContainer = container.querySelector('[data-testid="container"]') as HTMLElement | null;
      expect(innerContainer).not.toBeNull();
      const inner = innerContainer as HTMLElement;
      expect(inner).toHaveClass(
        'container',
        'max-w-(--container-max-width)',
        'pointer-events-auto',
        'mx-auto',
        'flex',
        'h-24',
        'w-full',
        'flex-row',
        'flex-wrap',
        'items-center',
        'justify-between',
        'gap-4',
        'sm:flex-nowrap',
        'sm:gap-6',
        'p-6',
      );
    });

    it('merges custom className', () => {
      render(
        <HeaderContainer className="custom-class">
          <div>Test Content</div>
        </HeaderContainer>,
      );

      const container = screen.getByRole('banner');
      expect(container).toHaveClass('custom-class');
    });
  });

  describe('HeaderTitle', () => {
    it('renders with title', () => {
      render(<HeaderTitle currentTitle="Test Title" />);

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('applies correct classes', () => {
      render(<HeaderTitle currentTitle="Test Title" />);

      const title = screen.getByText('Test Title');
      expect(title).toHaveClass('text-muted-foreground', 'font-normal');
    });

    it('applies correct heading attributes', () => {
      render(<HeaderTitle currentTitle="Test Title" />);

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });
  });

  describe('HeaderOnboarding', () => {
    it('renders with progress steps', () => {
      render(<HeaderOnboarding currentStep={3} />);

      const progressSteps = screen.getByTestId('progress-steps');
      expect(progressSteps).toHaveAttribute('data-current', '3');
      expect(progressSteps).toHaveAttribute('data-total', '5');
    });
  });

  describe('HeaderSocialLinks', () => {
    it('renders social links', () => {
      render(<HeaderSocialLinks />);

      // Github2 may not include a lucide- class; assert presence via anchor with svg
      const githubLink = document.querySelector('a[href="https://github.com"]');
      expect(githubLink?.querySelector('svg')).toBeInTheDocument();
      expect(document.querySelector('.lucide-x-twitter')).toBeInTheDocument();
      expect(document.querySelector('.lucide-telegram')).toBeInTheDocument();
    });

    it('applies correct classes', () => {
      render(<HeaderSocialLinks />);

      const githubLink = document.querySelector('a[href="https://github.com"]');
      expect(githubLink?.querySelector('svg')).toBeInTheDocument();
    });

    it('renders links with correct hrefs', () => {
      render(<HeaderSocialLinks />);

      const githubLink = document.querySelector('a[href="https://github.com"]');
      const twitterLink = document.querySelector('a[href="https://twitter.com/getpubky"]');
      const telegramLink = document.querySelector('a[href="https://t.me/getpubky"]');

      expect(githubLink).toHaveAttribute('href', 'https://github.com');
      expect(twitterLink).toHaveAttribute('href', 'https://twitter.com/getpubky');
      expect(telegramLink).toHaveAttribute('href', 'https://t.me/getpubky');
    });
  });

  describe('HeaderButtonSignIn', () => {
    it('renders sign in button', () => {
      vi.mocked(usePathname).mockReturnValue('/');
      render(<HeaderButtonSignIn />);

      const button = screen.getByText('Sign in');
      expect(button).toBeInTheDocument();
    });

    it('handles click events', () => {
      vi.mocked(usePathname).mockReturnValue('/');
      render(<HeaderButtonSignIn />);

      const button = screen.getByText('Sign in');
      fireEvent.click(button);

      expect(mockPush).toHaveBeenCalledWith('/sign-in');
    });

    it('renders new here button on the sign-in page', () => {
      vi.mocked(usePathname).mockReturnValue('/sign-in');
      render(<HeaderButtonSignIn />);

      expect(screen.getByText('New here?')).toBeInTheDocument();
    });

    it('navigates to onboarding when clicked on the sign-in page', () => {
      vi.mocked(usePathname).mockReturnValue('/sign-in');
      render(<HeaderButtonSignIn />);

      fireEvent.click(screen.getByText('New here?'));

      expect(mockPush).toHaveBeenCalledWith('/onboarding/human');
    });

    it('renders sign in button on the onboarding page', () => {
      vi.mocked(usePathname).mockReturnValue('/onboarding/human');
      render(<HeaderButtonSignIn />);

      expect(screen.getByText('Sign in')).toBeInTheDocument();
    });

    it('navigates to sign-in when clicked on the onboarding page', () => {
      vi.mocked(usePathname).mockReturnValue('/onboarding/human');
      render(<HeaderButtonSignIn />);

      fireEvent.click(screen.getByText('Sign in'));

      expect(mockPush).toHaveBeenCalledWith('/sign-in');
    });

    it('applies correct classes', () => {
      vi.mocked(usePathname).mockReturnValue('/');
      render(<HeaderButtonSignIn />);

      const button = screen.getByText('Sign in');
      expect(button).toHaveAttribute('data-variant', 'secondary');
    });

    it('renders with login icon', () => {
      vi.mocked(usePathname).mockReturnValue('/');
      render(<HeaderButtonSignIn />);

      expect(document.querySelector('.lucide-log-in')).toBeInTheDocument();
    });
  });

  describe('HeaderHome', () => {
    it('renders with social links and sign in button', () => {
      render(<HeaderHome />);

      expect(screen.getByTestId('header-social-links')).toBeInTheDocument();
      // The component now renders the actual button instead of a mock
      expect(screen.getByText('Sign in')).toBeInTheDocument();
    });

    it('applies correct classes', () => {
      render(<HeaderHome />);

      expect(screen.getByTestId('header-social-links')).toBeInTheDocument();
    });
  });

  describe('HeaderSignIn', () => {
    it('renders with search input and navigation buttons', () => {
      render(<HeaderSignIn />);

      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      // lucide uses 'house' for the home icon
      expect(document.querySelector('.lucide-house')).toBeInTheDocument();
      expect(document.querySelector('.lucide-flame')).toBeInTheDocument();
      expect(document.querySelector('.lucide-library')).toBeInTheDocument();
      expect(document.querySelector('.lucide-settings')).toBeInTheDocument();
    });

    it('applies correct classes', () => {
      render(<HeaderSignIn />);

      expect(screen.getByTestId('search-input')).toBeInTheDocument();
    });
  });

  describe('HeaderNavigationButtons', () => {
    it('renders with default props', () => {
      render(<HeaderNavigationButtons avatarImage="/images/default-avatar.png" avatarName="U" />);

      expect(screen.getByText('U')).toBeInTheDocument();
    });

    it('renders with custom avatar image and name', () => {
      render(<HeaderNavigationButtons avatarImage="test.jpg" avatarName="TU" counter={5} />);

      expect(screen.getByText('TU')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('renders counter badge when counter > 0', () => {
      render(<HeaderNavigationButtons avatarName="TU" counter={5} />);

      const badge = screen.getByText('5');
      expect(badge).toBeInTheDocument();
    });

    it('renders 21+ when counter > 21', () => {
      render(<HeaderNavigationButtons avatarName="TU" counter={25} />);

      const badge = screen.getByText('21+');
      expect(badge).toBeInTheDocument();
    });

    it('does not render badge when counter is 0', () => {
      render(<HeaderNavigationButtons avatarName="TU" counter={0} />);

      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('uses fallback name when none provided', () => {
      render(<HeaderNavigationButtons />);

      expect(screen.getByText('U')).toBeInTheDocument();
    });

    it('renders navigation links', () => {
      render(<HeaderNavigationButtons avatarName="TU" />);

      const homeLink = document.querySelector('.lucide-house')?.closest('a');
      const hotLink = document.querySelector('.lucide-flame')?.closest('a');
      const collectionsLink = document.querySelector('.lucide-library')?.closest('a');
      const settingsLink = document.querySelector('.lucide-settings')?.closest('a');
      const profileLink = screen.getByText('TU').closest('a');

      expect(homeLink).toHaveAttribute('href', '/home');
      expect(hotLink).toHaveAttribute('href', '/hot');
      expect(collectionsLink).toHaveAttribute('href', '/collections');
      expect(settingsLink).toHaveAttribute('href', '/settings/account');
      expect(profileLink).toHaveAttribute('href', '/profile');
    });

    it('highlights Collections on nested collection routes', () => {
      vi.mocked(usePathname).mockReturnValue('/collections/bookmarks');
      render(<HeaderNavigationButtons avatarName="TU" />);

      const collectionsButton = document.querySelector('.lucide-library')?.closest('button');
      expect(collectionsButton).toHaveClass('bg-secondary');
      expect(collectionsButton).not.toHaveClass('bg-white/5');
    });

    it('shows the Collections NEW treatment before dismissal', () => {
      collectionsDiscoveryMock.showCollectionsNew = true;

      render(<HeaderNavigationButtons avatarName="TU" />);

      const collectionsButton = document.querySelector('.lucide-library')?.closest('button');
      expect(collectionsButton).toHaveClass('border-brand', 'text-brand');
      expect(screen.getByRole('button', { name: 'Collections, New' })).toBeInTheDocument();
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('marks Collections discovery seen when clicking the Collections nav link', () => {
      collectionsDiscoveryMock.showCollectionsNew = true;
      render(<HeaderNavigationButtons avatarName="TU" />);

      const collectionsLink = document.querySelector('.lucide-library')?.closest('a');
      expect(collectionsLink).toBeTruthy();
      fireEvent.click(collectionsLink!);

      expect(collectionsDiscoveryMock.markCollectionsNavSeen).toHaveBeenCalledTimes(1);
    });

    it('does not show the Collections NEW treatment after dismissal', () => {
      collectionsDiscoveryMock.showCollectionsNew = false;

      render(<HeaderNavigationButtons avatarName="TU" />);

      expect(screen.queryByText('New')).not.toBeInTheDocument();
      const collectionsButton = document.querySelector('.lucide-library')?.closest('button');
      expect(collectionsButton).not.toHaveClass('border-brand');
    });

    it('applies correct button classes', () => {
      render(<HeaderNavigationButtons avatarName="TU" />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveClass('w-12', 'h-12');
      });
    });
  });

  describe('HeaderExploreNavigationButtons', () => {
    it('renders full navigation with account routes gated behind the Join dialog', () => {
      render(<HeaderExploreNavigationButtons />);

      // Home and Hot are public explore routes → real navigation links.
      const links = screen.getAllByRole('link');
      expect(links.map((link) => link.getAttribute('href'))).toEqual(['/home', '/hot']);
      expect(screen.getByTestId('search-input')).toBeInTheDocument();

      // All four nav icons are shown.
      expect(document.querySelector('.lucide-house')).toBeInTheDocument();
      expect(document.querySelector('.lucide-flame')).toBeInTheDocument();
      expect(document.querySelector('.lucide-library')).toBeInTheDocument();
      expect(document.querySelector('.lucide-settings')).toBeInTheDocument();

      // Collections/Settings require an account, so they render as auth-gated buttons, not links.
      expect(document.querySelector('.lucide-library')?.closest('a')).toBeNull();
      expect(document.querySelector('.lucide-settings')?.closest('a')).toBeNull();
      expect(document.querySelector('[data-cy="header-collections-btn"]')?.tagName).toBe('BUTTON');
      expect(document.querySelector('[data-cy="header-settings-btn"]')?.tagName).toBe('BUTTON');
    });

    it('opens sign-in dialog from the Join button', () => {
      render(<HeaderExploreNavigationButtons />);

      fireEvent.click(screen.getByTestId('header-explore-join-button'));

      expect(mockSetShowSignInDialog).toHaveBeenCalledWith(true);
    });
  });

  describe('HeaderSignIn - Avatar Logic', () => {
    beforeEach(() => {
      vi.mocked(useAuthStore).mockReturnValue({ currentUserPubky: 'test-pubky' });
    });

    it('passes name to AvatarWithFallback for valid name', () => {
      vi.mocked(useLiveQuery).mockReturnValue({ name: 'Test User', image: null });
      render(<HeaderSignIn />);

      const avatar = screen.getByTestId('avatar-with-fallback');
      expect(avatar).toHaveAttribute('data-name', 'Test User');
    });

    it('uses default fallback name when name is undefined', () => {
      vi.mocked(useLiveQuery).mockReturnValue({ name: undefined, image: null });
      render(<HeaderSignIn />);

      const avatar = screen.getByTestId('avatar-with-fallback');
      // When name is undefined, HeaderNavigationButtons uses its default value 'U'
      expect(avatar).toHaveAttribute('data-name', 'U');
    });

    it('passes empty name to AvatarWithFallback for empty name', () => {
      vi.mocked(useLiveQuery).mockReturnValue({ name: '', image: null });
      render(<HeaderSignIn />);

      const avatar = screen.getByTestId('avatar-with-fallback');
      expect(avatar).toHaveAttribute('data-name', '');
    });

    it('passes whitespace-only name to AvatarWithFallback', () => {
      vi.mocked(useLiveQuery).mockReturnValue({ name: '   ', image: null });
      render(<HeaderSignIn />);

      const avatar = screen.getByTestId('avatar-with-fallback');
      expect(avatar).toHaveAttribute('data-name', '   ');
    });

    it('passes name with whitespace to AvatarWithFallback', () => {
      vi.mocked(useLiveQuery).mockReturnValue({ name: '  Sarah Jones  ', image: null });
      render(<HeaderSignIn />);

      const avatar = screen.getByTestId('avatar-with-fallback');
      expect(avatar).toHaveAttribute('data-name', '  Sarah Jones  ');
    });

    it('renders AvatarWithFallback when no image provided', () => {
      vi.mocked(useLiveQuery).mockReturnValue({ name: 'Test User', image: null });
      render(<HeaderSignIn />);

      const avatar = screen.getByTestId('avatar-with-fallback');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('data-name', 'Test User');
    });

    it('renders AvatarWithFallback with name when image is provided', () => {
      vi.mocked(useLiveQuery).mockReturnValue({ name: 'Test User', image: 'custom-avatar.jpg' });
      render(<HeaderSignIn />);

      const avatar = screen.getByTestId('avatar-with-fallback');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute('data-name', 'Test User');
    });
  });
});

describe('Header Components - Snapshots', () => {
  const mockPush = vi.fn();
  const mockRouter = {
    push: mockPush,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(useRouter).mockReturnValue(mockRouter as ReturnType<typeof useRouter>);
    vi.mocked(usePathname).mockReturnValue('/home');
    vi.mocked(useAuthStore).mockReturnValue({ currentUserPubky: 'test-pubky' });
    vi.mocked(useNotificationStore).mockReturnValue({ selectUnread: () => 0 });
    vi.mocked(useLiveQuery).mockReturnValue({ name: 'Test User', image: 'test-image.jpg' });
  });

  it('matches snapshot for HeaderContainer', () => {
    const { container } = render(
      <HeaderContainer>
        <div>Test Content</div>
      </HeaderContainer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HeaderTitle', () => {
    const { container } = render(<HeaderTitle currentTitle="Test Title" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HeaderOnboarding', () => {
    const { container } = render(<HeaderOnboarding currentStep={3} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HeaderSocialLinks', () => {
    const { container } = render(<HeaderSocialLinks />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HeaderButtonSignIn', () => {
    const { container } = render(<HeaderButtonSignIn />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HeaderHome', () => {
    const { container } = render(<HeaderHome />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HeaderSignIn', () => {
    const { container } = render(<HeaderSignIn />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HeaderNavigationButtons', () => {
    const { container } = render(<HeaderNavigationButtons avatarName="TU" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for HeaderNavigationButtons with counter', () => {
    const { container } = render(<HeaderNavigationButtons avatarName="TU" counter={5} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
