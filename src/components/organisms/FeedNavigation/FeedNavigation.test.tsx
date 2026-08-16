import { fireEvent, render, screen } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { FeedNavigation } from './FeedNavigation';

// Mock next/navigation
const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock dexie-react-hooks — allow controlling useLiveQuery return value per test
let mockCustomFeeds: FeedModelSchema[];
let mockIsAuthenticated = true;
const mockRequireAuth = vi.fn((action: () => unknown) => action());
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(
    (queryFn: () => Promise<FeedModelSchema[]>, _deps?: unknown[], defaultResult?: FeedModelSchema[]) => {
      // Execute the query function so error-path tests can verify Logger calls
      void queryFn().catch(() => {});
      return mockIsAuthenticated ? mockCustomFeeds : (defaultResult ?? []);
    },
  ),
}));

// Mock feed controller
const mockGetList = vi.fn();
vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    getList: (...args: unknown[]) => mockGetList(...args),
  },
}));

// Mock @/atoms — lightweight forwarding mocks
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      size,
      className,
      overrideDefaults,
      onClick,
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      className?: string;
      overrideDefaults?: boolean;
      onClick?: () => void;
    }) => (
      <button
        data-testid="button"
        data-variant={variant}
        data-size={size}
        className={className}
        data-override-defaults={overrideDefaults}
        onClick={onClick}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({
      children,
      level,
      size,
      className,
    }: {
      children: React.ReactNode;
      level?: number;
      size?: string;
      className?: string;
    }) => (
      <div data-testid="heading" data-level={level} data-size={size} className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      href?: string;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <a data-testid="link" href={href} className={className} data-override-defaults={overrideDefaults}>
        {children}
      </a>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <span data-testid="typography" className={className} data-override-defaults={overrideDefaults}>
        {children}
      </span>
    ),
  };
});

// Mock @/organisms — CustomFeedDialog is a complex component; mock it as a transparent wrapper
vi.mock('@/organisms/CustomFeedDialog/CustomFeedDialog', () => {
  return {
    CustomFeedDialog: ({ children, mode }: { children: React.ReactNode; mode: string }) => (
      <div data-testid={`custom-feed-dialog-${mode}`}>{children}</div>
    ),
  };
});

// Mock @/app/routes
vi.mock('@/app/routes', () => ({
  APP_ROUTES: {
    HOME: '/home',
    FEED: '/feed',
  },
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    requireAuth: mockRequireAuth,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockFeed = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
  id: 'feed-abc123',
  name: 'Bitcoin News',
  tags: ['bitcoin', 'lightning'],
  domain_tags: [],
  reach: PubkyAppFeedReach.All,
  sort: PubkyAppFeedSort.Recent,
  content: null,
  layout: PubkyAppFeedLayout.Columns,
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeedNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomFeeds = [];
    mockIsAuthenticated = true;
    mockRequireAuth.mockImplementation((action: () => unknown) => action());
    mockUsePathname.mockReturnValue('/home');
    mockGetList.mockResolvedValue([]);
  });

  // ── Sanity ───────────────────────────────────────────────────────────────

  it('renders with default state (no custom feeds)', () => {
    render(<FeedNavigation />);

    const container = screen.getByTestId('container');
    expect(container).toBeInTheDocument();

    // Home link should always be present
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByTestId('custom-feed-dialog-create')).toHaveTextContent('Feed');
  });

  // ── Home feed link ──────────────────────────────────────────────────────

  it('renders the Home feed link with correct href', () => {
    render(<FeedNavigation />);

    const links = screen.getAllByTestId('link');
    const homeLink = links.find((link) => link.getAttribute('href') === '/home');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveTextContent('Home');
  });

  it('applies active styling to Home link when pathname is /home', () => {
    mockUsePathname.mockReturnValue('/home');
    render(<FeedNavigation />);

    const links = screen.getAllByTestId('link');
    const homeLink = links.find((link) => link.getAttribute('href') === '/home');
    expect(homeLink).toHaveClass('border-white');
    expect(homeLink).toHaveClass('text-white');
  });

  it('applies muted styling to Home link when pathname is not /home', () => {
    mockUsePathname.mockReturnValue('/feed/feed-abc123');
    render(<FeedNavigation />);

    const links = screen.getAllByTestId('link');
    const homeLink = links.find((link) => link.getAttribute('href') === '/home');
    expect(homeLink).toHaveClass('border-border');
    expect(homeLink).toHaveClass('text-muted-foreground');
  });

  // ── Custom feeds rendering ──────────────────────────────────────────────

  it('renders custom feeds from useLiveQuery', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-1', name: 'Bitcoin News' }),
      createMockFeed({ id: 'feed-2', name: 'Lightning Network' }),
    ];

    render(<FeedNavigation />);

    expect(screen.getByText('Bitcoin News')).toBeInTheDocument();
    expect(screen.getByText('Lightning Network')).toBeInTheDocument();
  });

  it('renders custom feed links with correct href based on feed id', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-xyz', name: 'My Feed' })];

    render(<FeedNavigation />);

    const links = screen.getAllByTestId('link');
    const customFeedLink = links.find((link) => link.getAttribute('href') === '/feed/feed-xyz');
    expect(customFeedLink).toBeInTheDocument();
    expect(customFeedLink).toHaveTextContent('My Feed');
  });

  it('renders multiple custom feeds in order', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-a', name: 'Alpha Feed' }),
      createMockFeed({ id: 'feed-b', name: 'Beta Feed' }),
      createMockFeed({ id: 'feed-c', name: 'Gamma Feed' }),
    ];

    render(<FeedNavigation />);

    const typographies = screen.getAllByTestId('typography');
    const feedNames = typographies.map((t) => t.textContent);

    expect(feedNames).toEqual(['Home', 'Alpha Feed', 'Beta Feed', 'Gamma Feed', 'Feed']);
  });

  // ── Active / Inactive custom feed styling ───────────────────────────────

  it('applies active styling to a custom feed when its route matches pathname', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-active', name: 'Active Feed' })];
    mockUsePathname.mockReturnValue('/feed/feed-active');

    render(<FeedNavigation />);

    const activeLink = screen.getAllByTestId('link').find((link) => link.getAttribute('href') === '/feed/feed-active');
    expect(activeLink).toHaveClass('text-white');
    expect(activeLink?.parentElement).toHaveClass('border-white');
  });

  it('applies muted styling to a custom feed when its route does not match pathname', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-inactive', name: 'Inactive Feed' })];
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    const inactiveLink = screen
      .getAllByTestId('link')
      .find((link) => link.getAttribute('href') === '/feed/feed-inactive');
    expect(inactiveLink).toHaveClass('text-muted-foreground', 'group-hover:text-white');
    expect(inactiveLink?.parentElement).toHaveClass('border-border');
    expect(inactiveLink?.parentElement).not.toHaveClass('hover:text-white');
  });

  // ── Edit dialog for custom feeds ────────────────────────────────────────

  it('wraps the right-side pencil in an edit dialog for every custom feed', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-edit', name: 'Editable Feed' }),
      createMockFeed({ id: 'feed-other', name: 'Other Feed' }),
    ];
    mockUsePathname.mockReturnValue('/feed/feed-edit');

    render(<FeedNavigation />);

    const editDialogs = screen.getAllByTestId('custom-feed-dialog-edit');
    expect(editDialogs).toHaveLength(2);

    editDialogs.forEach((editDialog) => {
      const editButton = editDialog.querySelector('[data-testid="button"]');
      expect(editButton).toBeInTheDocument();
      expect(editButton).toHaveClass(
        'absolute',
        'right-3',
        'text-muted-foreground',
        'lg:opacity-0',
        'lg:group-hover:opacity-100',
      );
      expect(editButton?.querySelector('svg')).toHaveClass('size-3');
    });
  });

  it('keeps the pencil outside the feed link so it does not navigate', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-edit', name: 'Editable Feed' })];
    mockUsePathname.mockReturnValue('/feed/feed-edit');

    render(<FeedNavigation />);

    const feedLink = screen.getAllByTestId('link').find((link) => link.getAttribute('href') === '/feed/feed-edit');
    expect(feedLink?.querySelector('.lucide-pencil')).not.toBeInTheDocument();
    expect(screen.getByTestId('custom-feed-dialog-edit').querySelector('.lucide-pencil')).toBeInTheDocument();
  });

  it('whitens only the custom feed name on hover, not the pencil', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed' })];
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    const feedLink = screen.getAllByTestId('link').find((link) => link.getAttribute('href') === '/feed/feed-1');
    expect(feedLink).toHaveClass('group-hover:text-white');
    expect(screen.getByTestId('custom-feed-dialog-edit').querySelector('[data-testid="button"]')).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('does not show edit dialog for Home feed even when active', () => {
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    expect(screen.queryByTestId('custom-feed-dialog-edit')).not.toBeInTheDocument();
  });

  // ── Create Feed button ──────────────────────────────────────────────────

  it('renders Feed button inside a create dialog', () => {
    render(<FeedNavigation />);

    const createDialog = screen.getByTestId('custom-feed-dialog-create');
    expect(createDialog).toBeInTheDocument();
    expect(createDialog).toHaveTextContent('Feed');
  });

  it('renders Feed button with PlusCircle icon', () => {
    render(<FeedNavigation />);

    const createDialog = screen.getByTestId('custom-feed-dialog-create');
    const svg = createDialog.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('does not expose custom feeds when unauthenticated', () => {
    mockIsAuthenticated = false;
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Private Feed' })];

    render(<FeedNavigation />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('Private Feed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('custom-feed-dialog-create')).not.toBeInTheDocument();
    expect(mockGetList).not.toHaveBeenCalled();
  });

  it('opens sign-in dialog when unauthenticated user clicks Create Feed', () => {
    mockIsAuthenticated = false;
    mockRequireAuth.mockReturnValue(undefined);

    render(<FeedNavigation />);

    fireEvent.click(screen.getByTestId('button'));

    expect(mockRequireAuth).toHaveBeenCalledTimes(1);
  });

  // ── Error handling ──────────────────────────────────────────────────────

  it('renders empty feed list when getList rejects (error handled in useLiveQuery callback)', async () => {
    mockGetList.mockRejectedValue(new Error('Database error'));
    mockCustomFeeds = [];

    render(<FeedNavigation />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByTestId('custom-feed-dialog-create')).toHaveTextContent('Feed');
  });

  // ── Container and layout ────────────────────────────────────────────────

  it('renders container with flex-row and overflow-x-auto classes', () => {
    render(<FeedNavigation />);

    const container = screen.getByTestId('container');
    expect(container).toHaveClass('lg:flex-row');
    expect(container).toHaveClass('overflow-x-auto');
  });

  it('renders tabs with Figma chrome classes', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed' })];
    render(<FeedNavigation />);

    const homeLink = screen.getAllByTestId('link').find((link) => link.getAttribute('href') === '/home');
    expect(homeLink).toHaveClass('min-h-12', 'w-full', 'min-w-40', 'lg:flex-1');

    const customLink = screen.getAllByTestId('link').find((link) => link.getAttribute('href') === '/feed/feed-1');
    expect(customLink).toHaveClass('absolute', 'inset-0');
    expect(customLink?.parentElement).toHaveClass('min-h-12', 'w-full', 'min-w-40', 'lg:flex-1');

    screen.getAllByTestId('typography').forEach((label) => {
      expect(label).toHaveClass('text-sm', 'leading-5');
    });
  });

  it('does not use a left-side pencil as the custom feed icon', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed' })];
    render(<FeedNavigation />);

    const customLink = screen.getAllByTestId('link').find((link) => link.getAttribute('href') === '/feed/feed-1');
    expect(customLink?.querySelector('svg')).not.toBeInTheDocument();
  });

  it('does not show a pencil on Home or Create Feed', () => {
    render(<FeedNavigation />);

    const homeLink = screen.getAllByTestId('link').find((link) => link.getAttribute('href') === '/home');
    expect(homeLink?.querySelector('svg')).toHaveClass('lucide-house');
    expect(homeLink?.querySelector('.lucide-pencil')).not.toBeInTheDocument();
    expect(screen.getByTestId('custom-feed-dialog-create').querySelector('.lucide-pencil')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

describe('FeedNavigation - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomFeeds = [];
    mockIsAuthenticated = true;
    mockRequireAuth.mockImplementation((action: () => unknown) => action());
    mockUsePathname.mockReturnValue('/home');
    mockGetList.mockResolvedValue([]);
  });

  it('matches snapshot with no custom feeds and Home active', () => {
    const { container } = render(<FeedNavigation />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom feeds and Home active', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-1', name: 'Bitcoin News' }),
      createMockFeed({ id: 'feed-2', name: 'Lightning Network' }),
    ];

    const { container } = render(<FeedNavigation />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom feed active (showing edit dialog)', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-active', name: 'Active Feed' })];
    mockUsePathname.mockReturnValue('/feed/feed-active');

    const { container } = render(<FeedNavigation />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple custom feeds and one active', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-1', name: 'Bitcoin' }),
      createMockFeed({ id: 'feed-2', name: 'Lightning' }),
      createMockFeed({ id: 'feed-3', name: 'Nostr' }),
    ];
    mockUsePathname.mockReturnValue('/feed/feed-2');

    const { container } = render(<FeedNavigation />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
