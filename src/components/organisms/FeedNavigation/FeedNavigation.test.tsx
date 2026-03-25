import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeedNavigation } from './FeedNavigation';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import type { FeedModelSchema } from '@/core/models/feed/feed.schema';

// Mock next/navigation
const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock dexie-react-hooks — allow controlling useLiveQuery return value per test
let mockCustomFeeds: FeedModelSchema[];
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((queryFn: () => Promise<FeedModelSchema[]>) => {
    // Execute the query function so error-path tests can verify Logger calls
    void queryFn().catch(() => {});
    return mockCustomFeeds;
  }),
}));

// Mock @/core
const mockGetList = vi.fn();
vi.mock('@/core', () => ({
  FeedController: {
    getList: (...args: unknown[]) => mockGetList(...args),
  },
}));

// Mock @/atoms — lightweight forwarding mocks
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
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
  Button: ({
    children,
    variant,
    size,
    className,
    overrideDefaults,
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
    className?: string;
    overrideDefaults?: boolean;
  }) => (
    <button
      data-testid="button"
      data-variant={variant}
      data-size={size}
      className={className}
      data-override-defaults={overrideDefaults}
    >
      {children}
    </button>
  ),
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
}));

// Mock @/organisms — CustomFeedDialog is a complex component; mock it as a transparent wrapper
vi.mock('@/organisms', () => ({
  CustomFeedDialog: ({ children, mode }: { children: React.ReactNode; mode: string }) => (
    <div data-testid={`custom-feed-dialog-${mode}`}>{children}</div>
  ),
}));

// Keep real @/libs (cn, icons, Logger) but spy on Logger.error
vi.mock('@/libs', async () => {
  const actual = (await vi.importActual('@/libs')) as Record<string, unknown>;
  return {
    ...actual,
    Logger: {
      ...(actual.Logger as Record<string, unknown>),
      error: vi.fn(),
    },
  };
});

// Mock @/app/routes
vi.mock('@/app/routes', () => ({
  APP_ROUTES: {
    HOME: '/home',
    FEED: '/feed',
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockFeed = (overrides: Partial<FeedModelSchema> = {}): FeedModelSchema => ({
  id: 'feed-abc123',
  name: 'Bitcoin News',
  tags: ['bitcoin', 'lightning'],
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

    // Create Feed button should always be present
    expect(screen.getByText('Create Feed')).toBeInTheDocument();
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
    expect(homeLink).toHaveClass('border-muted-foreground');
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

    // Home is first, then custom feeds, then Create Feed
    expect(feedNames).toEqual(['Home', 'Alpha Feed', 'Beta Feed', 'Gamma Feed', 'Create Feed']);
  });

  // ── Active / Inactive custom feed styling ───────────────────────────────

  it('applies active styling to a custom feed when its route matches pathname', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-active', name: 'Active Feed' })];
    mockUsePathname.mockReturnValue('/feed/feed-active');

    render(<FeedNavigation />);

    const links = screen.getAllByTestId('link');
    const activeLink = links.find((link) => link.getAttribute('href') === '/feed/feed-active');
    expect(activeLink).toHaveClass('border-white');
    expect(activeLink).toHaveClass('text-white');
  });

  it('applies muted styling to a custom feed when its route does not match pathname', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-inactive', name: 'Inactive Feed' })];
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    const links = screen.getAllByTestId('link');
    const inactiveLink = links.find((link) => link.getAttribute('href') === '/feed/feed-inactive');
    expect(inactiveLink).toHaveClass('border-muted-foreground');
    expect(inactiveLink).toHaveClass('text-muted-foreground');
  });

  // ── Edit dialog for active custom feed ──────────────────────────────────

  it('wraps custom feed icon in edit dialog when feed is active', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-edit', name: 'Editable Feed' })];
    mockUsePathname.mockReturnValue('/feed/feed-edit');

    render(<FeedNavigation />);

    const editDialog = screen.getByTestId('custom-feed-dialog-edit');
    expect(editDialog).toBeInTheDocument();

    // The edit dialog should contain a button with the pencil icon
    const editButton = editDialog.querySelector('[data-testid="button"]');
    expect(editButton).toBeInTheDocument();
  });

  it('does not show edit dialog for inactive custom feed', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-noedit', name: 'No Edit Feed' })];
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    // There should be a create dialog but no edit dialog
    expect(screen.queryByTestId('custom-feed-dialog-edit')).not.toBeInTheDocument();
  });

  it('does not show edit dialog for Home feed even when active', () => {
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    expect(screen.queryByTestId('custom-feed-dialog-edit')).not.toBeInTheDocument();
  });

  // ── Create Feed button ──────────────────────────────────────────────────

  it('renders Create Feed button inside a create dialog', () => {
    render(<FeedNavigation />);

    const createDialog = screen.getByTestId('custom-feed-dialog-create');
    expect(createDialog).toBeInTheDocument();
    expect(createDialog).toHaveTextContent('Create Feed');
  });

  it('renders Create Feed button with PlusCircle icon', () => {
    render(<FeedNavigation />);

    const createDialog = screen.getByTestId('custom-feed-dialog-create');
    const svg = createDialog.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  // ── Error handling ──────────────────────────────────────────────────────

  it('renders empty feed list when getList rejects (error handled in useLiveQuery callback)', async () => {
    mockGetList.mockRejectedValue(new Error('Database error'));
    mockCustomFeeds = [];

    render(<FeedNavigation />);

    // Should still render Home and Create Feed even when getList fails
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Create Feed')).toBeInTheDocument();
  });

  // ── Container and layout ────────────────────────────────────────────────

  it('renders container with flex-row and overflow-x-auto classes', () => {
    render(<FeedNavigation />);

    const container = screen.getByTestId('container');
    expect(container).toHaveClass('lg:flex-row');
    expect(container).toHaveClass('overflow-x-auto');
  });

  it('renders all links with min-w-40 and h-12 classes', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed' })];
    render(<FeedNavigation />);

    const links = screen.getAllByTestId('link');
    links.forEach((link) => {
      expect(link).toHaveClass('min-w-40');
      expect(link).toHaveClass('min-h-12');
    });
  });
});

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

describe('FeedNavigation - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomFeeds = [];
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
