import { fireEvent, render, screen } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { REACH } from '@/stores/home/home.types';
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

// Home store drives the reach tab; expose a mutable state object per test
const mockHomeState = {
  reach: REACH.ALL as (typeof REACH)[keyof typeof REACH],
  taggedAsActive: false,
  profileTags: [] as string[],
};
vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: (selector?: (state: typeof mockHomeState) => unknown) =>
    selector ? selector(mockHomeState) : mockHomeState,
}));

// Keep the icon utilities real (DynamicLucideIcon depends on them) but noop the
// preloader so tests do not kick off background icon chunk loads.
vi.mock('@/libs/lucide/lucideIcons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/lucide/lucideIcons')>()),
  preloadLucideIcons: vi.fn(),
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
      'aria-label': ariaLabel,
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      className?: string;
      overrideDefaults?: boolean;
      onClick?: () => void;
      'aria-label'?: string;
    }) => (
      <button
        data-testid="button"
        data-variant={variant}
        data-size={size}
        className={className}
        data-override-defaults={overrideDefaults}
        onClick={onClick}
        aria-label={ariaLabel}
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

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      className,
      overrideDefaults,
      'aria-label': ariaLabel,
      'aria-current': ariaCurrent,
    }: {
      children: React.ReactNode;
      href?: string;
      className?: string;
      overrideDefaults?: boolean;
      'aria-label'?: string;
      'aria-current'?: React.AriaAttributes['aria-current'];
    }) => (
      <a
        data-testid="link"
        href={href}
        className={className}
        data-override-defaults={overrideDefaults}
        aria-label={ariaLabel}
        aria-current={ariaCurrent}
      >
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
    CustomFeedDialog: ({
      children,
      mode,
      feed,
      open,
    }: {
      children?: React.ReactNode;
      mode: string;
      feed?: FeedModelSchema;
      open?: boolean;
    }) => (
      <div data-testid={`custom-feed-dialog-${mode}`} data-feed-id={feed?.id} data-open={open}>
        {children}
      </div>
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

const getLink = (href: string) => screen.getAllByTestId('link').find((link) => link.getAttribute('href') === href);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeedNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomFeeds = [];
    mockIsAuthenticated = true;
    mockHomeState.reach = REACH.ALL;
    mockHomeState.taggedAsActive = false;
    mockHomeState.profileTags = [];
    mockRequireAuth.mockImplementation((action: () => unknown) => action());
    mockUsePathname.mockReturnValue('/home');
    mockGetList.mockResolvedValue([]);
  });

  // ── Sanity ───────────────────────────────────────────────────────────────

  it('renders with default state (no custom feeds)', () => {
    render(<FeedNavigation />);

    const [container] = screen.getAllByTestId('container');
    expect(container).toBeInTheDocument();

    // The reach tab (default reach = All) should always be present
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByTestId('custom-feed-dialog-create')).toHaveTextContent('Feed');
  });

  it('runs full-bleed below lg to cancel the shell gutter', () => {
    render(<FeedNavigation />);

    const [root] = screen.getAllByTestId('container');
    expect(root).toHaveClass('-mx-4', 'w-auto', 'lg:mx-0', 'lg:w-full');
  });

  // ── Reach tab (first tab, links to /home) ────────────────────────────────

  it('renders the reach tab as a link to /home', () => {
    render(<FeedNavigation />);

    const homeLink = getLink('/home');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveTextContent('All');
    expect(homeLink?.querySelector('svg')).toHaveClass('lucide-radio');
  });

  it('reflects the selected reach in the tab label and icon', () => {
    mockHomeState.reach = REACH.NETWORK;

    render(<FeedNavigation />);

    const homeLink = getLink('/home');
    expect(homeLink).toHaveTextContent('My network');
    expect(homeLink?.querySelector('svg')).toHaveClass('lucide-waypoints');
  });

  it('shows Tagged as when the tagged-as filter is active with profile tags', () => {
    mockHomeState.reach = REACH.NETWORK;
    mockHomeState.taggedAsActive = true;
    mockHomeState.profileTags = ['bitcoiner'];

    render(<FeedNavigation />);

    const homeLink = getLink('/home');
    expect(homeLink).toHaveTextContent('Tagged as');
    expect(homeLink?.querySelector('svg')).toHaveClass('lucide-tags');
  });

  it('forces the All reach when unauthenticated', () => {
    mockIsAuthenticated = false;
    mockHomeState.reach = REACH.NETWORK;
    mockHomeState.taggedAsActive = true;
    mockHomeState.profileTags = ['bitcoiner'];

    render(<FeedNavigation />);

    const homeLink = getLink('/home');
    expect(homeLink).toHaveTextContent('All');
    expect(homeLink?.querySelector('svg')).toHaveClass('lucide-radio');
  });

  it('applies active styling to the reach tab when pathname is /home', () => {
    mockUsePathname.mockReturnValue('/home');
    render(<FeedNavigation />);

    const homeLink = getLink('/home');
    expect(homeLink).toHaveClass('border-white');
    expect(homeLink).toHaveClass('text-white');
    expect(homeLink).toHaveAttribute('aria-current', 'page');
  });

  it('applies muted styling to the reach tab when pathname is not /home', () => {
    mockUsePathname.mockReturnValue('/feed/feed-abc123');
    render(<FeedNavigation />);

    const homeLink = getLink('/home');
    expect(homeLink).toHaveClass('border-border');
    expect(homeLink).toHaveClass('text-muted-foreground');
    expect(homeLink).not.toHaveAttribute('aria-current');
  });

  it('collapses the reach tab label to icon-only on mobile when inactive', () => {
    mockUsePathname.mockReturnValue('/feed/feed-abc123');
    render(<FeedNavigation />);

    const label = getLink('/home')?.querySelector('[data-testid="typography"]');
    expect(label).toHaveClass('hidden', 'lg:inline');
  });

  it('keeps the reach tab label visible on mobile when active', () => {
    mockUsePathname.mockReturnValue('/home');
    render(<FeedNavigation />);

    const label = getLink('/home')?.querySelector('[data-testid="typography"]');
    expect(label).not.toHaveClass('hidden');
  });

  it('splits All and Create evenly on mobile when there are no custom feeds', () => {
    mockUsePathname.mockReturnValue('/home');
    render(<FeedNavigation />);

    // Both tabs share the equal flex basis, so the row divides 50/50: the
    // active All tab must not get the content-hugging width here.
    const homeLink = getLink('/home');
    expect(homeLink).toHaveClass('min-w-0', 'basis-1/2', 'lg:flex-auto');
    expect(homeLink).not.toHaveClass('flex-none');
    expect(homeLink).not.toHaveClass('max-w-[60%]');

    const createButton = screen.getByLabelText('Create feed');
    expect(createButton).toHaveClass('min-w-0', 'basis-1/2', 'lg:flex-auto');
    expect(createButton).not.toHaveClass('flex-none');
  });

  it('keeps the active reach tab hugging its content on mobile when custom feeds are present', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed' })];
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    expect(getLink('/home')).toHaveClass('max-w-[60%]', 'flex-none', 'lg:flex-auto');
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

    const customFeedLink = getLink('/feed/feed-xyz');
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

    expect(feedNames).toEqual(['All', 'Alpha Feed', 'Beta Feed', 'Gamma Feed', 'Feed']);
  });

  it('renders the feed icon inside the custom feed link (Activity fallback when unset)', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed', icon: undefined })];

    render(<FeedNavigation />);

    expect(getLink('/feed/feed-1')?.querySelector('svg')).toHaveClass('lucide-activity');
  });

  // ── Active / Inactive custom feed styling ───────────────────────────────

  it('applies active styling to a custom feed when its route matches pathname', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-active', name: 'Active Feed' })];
    mockUsePathname.mockReturnValue('/feed/feed-active');

    render(<FeedNavigation />);

    const activeLink = getLink('/feed/feed-active');
    expect(activeLink).toHaveClass('text-white');
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(activeLink?.parentElement).toHaveClass('border-white');
  });

  it('applies muted styling to a custom feed when its route does not match pathname', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-inactive', name: 'Inactive Feed' })];
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    const inactiveLink = getLink('/feed/feed-inactive');
    expect(inactiveLink).toHaveClass('text-muted-foreground', 'group-hover:text-white');
    expect(inactiveLink?.parentElement).toHaveClass('border-border');
    expect(inactiveLink?.parentElement).not.toHaveClass('hover:text-white');
  });

  it('collapses inactive custom feed tabs to icon-only on mobile, keeps the active label', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-active', name: 'Active Feed' }),
      createMockFeed({ id: 'feed-other', name: 'Other Feed' }),
    ];
    mockUsePathname.mockReturnValue('/feed/feed-active');

    render(<FeedNavigation />);

    const activeLabel = getLink('/feed/feed-active')?.querySelector('[data-testid="typography"]');
    expect(activeLabel).not.toHaveClass('hidden');
    expect(getLink('/feed/feed-active')).toHaveClass('px-10', 'lg:px-2.5');

    const inactiveLabel = getLink('/feed/feed-other')?.querySelector('[data-testid="typography"]');
    expect(inactiveLabel).toHaveClass('hidden', 'lg:inline');

    // The active tab hugs its content on mobile; inactive tabs share the row.
    expect(getLink('/feed/feed-active')?.parentElement).toHaveClass('flex-none', 'lg:flex-auto');
    expect(getLink('/feed/feed-other')?.parentElement).toHaveClass('min-w-12', 'flex-1');
  });

  it('gives desktop tabs content-aware flex bases before truncating feed names', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-short', name: 'K' }),
      createMockFeed({ id: 'feed-long', name: 'New custom feed with a longer title' }),
    ];

    render(<FeedNavigation />);

    const shortTab = getLink('/feed/feed-short')?.parentElement;
    const longTab = getLink('/feed/feed-long')?.parentElement;

    expect(shortTab).toHaveClass('lg:flex-auto');
    expect(longTab).toHaveClass('lg:flex-auto');
    expect(shortTab).not.toHaveClass('lg:flex-1');
    expect(longTab).not.toHaveClass('lg:flex-1');
  });

  // ── Edit dialog for custom feeds ────────────────────────────────────────

  it('renders a right-side edit pencil for every custom feed', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-edit', name: 'Editable Feed' }),
      createMockFeed({ id: 'feed-other', name: 'Other Feed' }),
    ];
    mockUsePathname.mockReturnValue('/feed/feed-edit');

    render(<FeedNavigation />);

    const pencils = [screen.getByLabelText('Edit Editable Feed'), screen.getByLabelText('Edit Other Feed')];

    pencils.forEach((editButton) => {
      expect(editButton).toHaveClass('absolute', 'right-1', 'p-2', 'text-muted-foreground');
      // Hover-capable devices hide the pencil until hover/focus; hover-less
      // lg+ devices (no :hover) keep it visible and interactive.
      expect(editButton).toHaveClass(
        '[@media(hover:hover)]:lg:opacity-0',
        '[@media(hover:hover)]:lg:pointer-events-none',
        'lg:group-hover:opacity-100',
        'lg:group-hover:pointer-events-auto',
        'lg:group-focus-within:opacity-100',
      );
      expect(editButton.querySelector('svg')).toHaveClass('size-3');
    });
  });

  it('opens a single edit dialog for the clicked feed only', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-edit', name: 'Editable Feed' }),
      createMockFeed({ id: 'feed-other', name: 'Other Feed' }),
    ];
    mockUsePathname.mockReturnValue('/feed/feed-edit');

    render(<FeedNavigation />);

    expect(screen.queryByTestId('custom-feed-dialog-edit')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Edit Other Feed'));

    const editDialog = screen.getByTestId('custom-feed-dialog-edit');
    expect(editDialog).toHaveAttribute('data-feed-id', 'feed-other');
    expect(editDialog).toHaveAttribute('data-open', 'true');
  });

  it('closes the edit dialog when a background sync removes the feed', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-gone', name: 'Doomed Feed' })];
    const { rerender } = render(<FeedNavigation />);

    fireEvent.click(screen.getByLabelText('Edit Doomed Feed'));
    expect(screen.getByTestId('custom-feed-dialog-edit')).toHaveAttribute('data-feed-id', 'feed-gone');

    // The feed disappears from the live query — the snapshot must not outlive it.
    mockCustomFeeds = [];
    rerender(<FeedNavigation />);

    expect(screen.queryByTestId('custom-feed-dialog-edit')).not.toBeInTheDocument();
  });

  it('caps the active tab width so one long feed name cannot push the others off-screen', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-long', name: 'A'.repeat(200) })];
    mockUsePathname.mockReturnValue('/feed/feed-long');

    render(<FeedNavigation />);

    expect(getLink('/feed/feed-long')?.parentElement).toHaveClass('max-w-[60%]', 'lg:max-w-none');
  });

  it('shows the pencil on mobile only for the active custom feed', () => {
    mockCustomFeeds = [
      createMockFeed({ id: 'feed-active', name: 'Active Feed' }),
      createMockFeed({ id: 'feed-other', name: 'Other Feed' }),
    ];
    mockUsePathname.mockReturnValue('/feed/feed-active');

    render(<FeedNavigation />);

    expect(screen.getByLabelText('Edit Active Feed')).not.toHaveClass('hidden');
    expect(screen.getByLabelText('Edit Other Feed')).toHaveClass('hidden', 'lg:block');
  });

  it('keeps the pencil outside the feed link so it does not navigate', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-edit', name: 'Editable Feed' })];
    mockUsePathname.mockReturnValue('/feed/feed-edit');

    render(<FeedNavigation />);

    const feedLink = getLink('/feed/feed-edit');
    expect(feedLink?.querySelector('.lucide-pencil')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Edit Editable Feed').querySelector('.lucide-pencil')).toBeInTheDocument();
  });

  it('whitens only the custom feed name on hover, not the pencil', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed' })];
    mockUsePathname.mockReturnValue('/home');

    render(<FeedNavigation />);

    const feedLink = getLink('/feed/feed-1');
    expect(feedLink).toHaveClass('group-hover:text-white');
    expect(screen.getByLabelText('Edit Test Feed')).toHaveClass('text-muted-foreground');
  });

  it('does not render an edit dialog until a pencil is clicked', () => {
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

  it('renders Feed button with PlusCircle icon and mobile-hidden label', () => {
    render(<FeedNavigation />);

    const createDialog = screen.getByTestId('custom-feed-dialog-create');
    expect(createDialog.querySelector('svg')).toBeInTheDocument();
    expect(createDialog.querySelector('[data-testid="typography"]')).toHaveClass('hidden', 'lg:inline');
  });

  it('does not expose custom feeds when unauthenticated', () => {
    mockIsAuthenticated = false;
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Private Feed' })];

    render(<FeedNavigation />);

    expect(screen.getByText('All')).toBeInTheDocument();
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

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByTestId('custom-feed-dialog-create')).toHaveTextContent('Feed');
  });

  // ── Container and layout ────────────────────────────────────────────────

  it('renders a horizontally scrollable row that sticks under the mobile header', () => {
    render(<FeedNavigation />);

    // Sticky chrome and the gradient fade live on the outer, non-scrolling
    // wrapper; the scroll container is the inner row, so the ::after fade is
    // not clipped into the scrollport.
    const [wrapper, row] = screen.getAllByTestId('container');
    expect(wrapper).toHaveClass('mobile-menu-gradient-fade', 'sticky', 'top-(--header-height-settings)');
    expect(wrapper).toHaveClass('bg-background', 'lg:static', 'lg:bg-transparent', 'lg:after:hidden');
    expect(wrapper).not.toHaveClass('overflow-x-auto');
    expect(row).toHaveClass('flex', 'flex-row');
    expect(row).toHaveClass('overflow-x-auto');
  });

  it('renders tabs with Figma chrome classes', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed' })];
    render(<FeedNavigation />);

    const homeLink = getLink('/home');
    expect(homeLink).toHaveClass('min-h-12', 'lg:flex-auto');
    expect(homeLink).toHaveClass('px-8', 'lg:px-2.5');

    const customLink = getLink('/feed/feed-1');
    expect(customLink).toHaveClass('h-full', 'w-full');
    expect(customLink).toHaveClass('px-2', 'lg:px-2.5');
    expect(customLink?.parentElement).toHaveClass('min-h-12', 'flex-1');

    screen.getAllByTestId('typography').forEach((label) => {
      expect(label).toHaveClass('text-sm', 'leading-5');
    });
  });

  it('does not use a pencil as the custom feed icon', () => {
    mockCustomFeeds = [createMockFeed({ id: 'feed-1', name: 'Test Feed' })];
    render(<FeedNavigation />);

    const customLink = getLink('/feed/feed-1');
    expect(customLink?.querySelector('.lucide-pencil')).not.toBeInTheDocument();
  });

  it('does not show a pencil on the reach tab or Create Feed', () => {
    render(<FeedNavigation />);

    const homeLink = getLink('/home');
    expect(homeLink?.querySelector('svg')).toHaveClass('lucide-radio');
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
    mockHomeState.reach = REACH.ALL;
    mockHomeState.taggedAsActive = false;
    mockHomeState.profileTags = [];
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
