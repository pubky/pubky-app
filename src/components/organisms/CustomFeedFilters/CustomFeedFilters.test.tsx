import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { CustomFeedFilters } from './CustomFeedFilters';

// Mock hooks
const mockUseCustomFeed = vi.fn();

// Whether the configured Pinakes serves My network (`wot_2`)
const reachSet = vi.hoisted(() => ({ served: false }));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesReachSetServed: () => reachSet.served,
}));
beforeEach(() => {
  reachSet.served = false;
});
vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => ({
  useCustomFeed: () => mockUseCustomFeed(),
}));
// Whether a resources feed's saved filters are in the URL yet (`useSeedCustomResourceFeed`)
const seeded = vi.hoisted(() => ({ ready: false }));
vi.mock('@/hooks/useCustomResourceFeed/useCustomResourceFeed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomResourceFeed/useCustomResourceFeed')>();
  return {
    ...actual,
    useCustomResourceFeed: () => {
      const feed = mockUseCustomFeed();
      return {
        feed: feed?.target === 'resources' ? actual.toCustomResourceFeedSearch(feed) : null,
        isReady: seeded.ready,
      };
    },
  };
});
vi.mock('@/organisms/SearchResources/SearchResourceFilters', () => ({
  SearchResourceFilters: ({ feed }: { feed: unknown }) => (
    <div data-testid="search-resource-filters" data-feed={JSON.stringify(feed)} />
  ),
}));
beforeEach(() => {
  seeded.ready = false;
});

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      overrideDefaults?: boolean;
      className?: string;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId ?? 'container'} className={className}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Label/Label', () => ({
  Label: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <label className={className}>{children}</label>
  ),
}));

vi.mock('@/molecules/PostTag/PostTag', () => ({
  PostTag: ({ label }: { label: string }) => <span data-testid={`readonly-tag-${label}`}>{label}</span>,
}));

// Mock molecules — filter components capture their props for assertion
vi.mock('@/molecules/Filters/FilterContent/FilterContent', () => {
  return {
    FilterContent: ({
      selectedTab,
      defaultSelectedTab,
      disabled,
    }: {
      selectedTab?: string;
      defaultSelectedTab?: string;
      disabled?: boolean;
    }) => (
      <div
        data-testid="filter-content"
        data-selected-tab={selectedTab ?? ''}
        data-default-selected-tab={defaultSelectedTab ?? ''}
        data-disabled={disabled}
      >
        FilterContent
      </div>
    ),
  };
});

vi.mock('@/molecules/Filters/FilterLayout/FilterLayout', () => {
  return {
    FilterLayout: ({
      selectedTab,
      defaultSelectedTab,
      disabled,
      showVisual,
      showCards,
    }: {
      selectedTab?: string;
      defaultSelectedTab?: string;
      disabled?: boolean;
      showVisual?: boolean;
      showCards?: boolean;
    }) => (
      <div
        data-testid="filter-layout"
        data-show-visual={showVisual}
        data-selected-tab={selectedTab ?? ''}
        data-default-selected-tab={defaultSelectedTab ?? ''}
        data-disabled={disabled}
        data-show-cards={showCards}
      >
        FilterLayout
      </div>
    ),
  };
});

vi.mock('@/molecules/Filters/FilterReach/FilterReach', () => {
  return {
    TAGGED_AS_FILTER_KEY: 'tagged_as',
    FilterReach: ({
      selectedTab,
      defaultSelectedTab,
      disabled,
      showTaggedAs,
      hiddenTabs,
    }: {
      selectedTab?: string;
      defaultSelectedTab?: string;
      disabled?: boolean;
      showTaggedAs?: boolean;
      hiddenTabs?: readonly string[];
    }) => (
      <div
        data-testid="filter-reach"
        data-hidden-tabs={(hiddenTabs ?? []).join(',')}
        data-selected-tab={selectedTab ?? ''}
        data-default-selected-tab={defaultSelectedTab ?? ''}
        data-disabled={disabled}
        data-show-tagged-as={showTaggedAs}
      >
        FilterReach
      </div>
    ),
  };
});

vi.mock('@/molecules/Filters/FilterSort/FilterSort', () => {
  return {
    FilterSort: ({
      selectedTab,
      defaultSelectedTab,
      disabled,
    }: {
      selectedTab?: string;
      defaultSelectedTab?: string;
      disabled?: boolean;
    }) => (
      <div
        data-testid="filter-sort"
        data-selected-tab={selectedTab ?? ''}
        data-default-selected-tab={defaultSelectedTab ?? ''}
        data-disabled={disabled}
      >
        FilterSort
      </div>
    ),
  };
});

const createMockFeed = (overrides?: Partial<FeedModelSchema>): FeedModelSchema => ({
  id: 'feed-1',
  name: 'Test Feed',
  tags: ['tag1', 'tag2'],
  domain_tags: [],
  reach: 'all',
  sort: 'recent',
  content: 'note',
  layout: 'columns',
  created_at: 1700000000,
  updated_at: 1700000000,
  ...overrides,
});

describe('CustomFeedFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCustomFeed.mockReturnValue(undefined);
  });

  // ── Sanity / Rendering ─────────────────────────────────────────────

  it('renders all four filter components for sidebar variant', () => {
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
    expect(screen.getByTestId('filter-content')).toBeInTheDocument();
  });

  it('renders all four filter components for drawer variant', () => {
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
    expect(screen.getByTestId('filter-content')).toBeInTheDocument();
  });

  // ── Disabled State ─────────────────────────────────────────────────

  it('renders all filters as disabled', () => {
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-disabled', 'true');
  });

  // ── No Custom Feed (undefined) ────────────────────────────────────

  it('passes undefined selectedTab to all filters when customFeed is undefined', () => {
    mockUseCustomFeed.mockReturnValue(undefined);
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', '');
    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-selected-tab', '');
    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-selected-tab', '');
    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', '');
  });

  it('passes undefined defaultSelectedTab to all filters', () => {
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-default-selected-tab', '');
    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-default-selected-tab', '');
    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-default-selected-tab', '');
    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-default-selected-tab', '');
  });

  // ── With Custom Feed Data ─────────────────────────────────────────

  it('maps customFeed reach to filter selectedTab', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: 'following' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'following');
  });

  it('maps My network and Me reach values and exposes the standalone read-only options', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: 'wot' }));
    const { rerender } = render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'network');
    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-show-tagged-as', 'true');

    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: 'me' }));
    rerender(<CustomFeedFilters variant="sidebar" />);
    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'me');
  });

  it('renders post and profile tags in separate labeled groups', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({ tags: ['bitcoin'], domain_tags: ['bitcoiner', '🔥'], reach: 'wot' }),
    );

    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'tagged_as');
    expect(screen.getByTestId('custom-feed-post-tags')).toHaveTextContent('Filter on Content Tags');
    expect(screen.getByTestId('custom-feed-profile-tags')).toHaveTextContent('Profile Tags');
    expect(screen.getByTestId('readonly-tag-bitcoin')).toBeInTheDocument();
    expect(screen.getByTestId('readonly-tag-bitcoiner')).toBeInTheDocument();
    expect(screen.getByTestId('readonly-tag-🔥')).toBeInTheDocument();
  });

  it('renders profile tags for a legacy Me feed without reinterpreting its reach', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ tags: [], domain_tags: ['bitcoiner'], reach: 'me' }));

    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'me');
    expect(screen.getByTestId('readonly-tag-bitcoiner')).toBeInTheDocument();
  });

  it('maps customFeed sort to filter selectedTab', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ sort: 'popularity' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-selected-tab', 'total_engagement');
  });

  it('maps customFeed layout to filter selectedTab', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ layout: 'wide' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-selected-tab', 'wide');
  });

  it.each(['sidebar', 'drawer'] as const)('shows the saved Cards selection in the %s', (variant) => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ layout: 'cards' }));
    render(<CustomFeedFilters variant={variant} />);
    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-selected-tab', 'cards');
    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-show-cards', 'true');
  });

  it('maps customFeed content to filter selectedTab', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: 'image' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'images');
  });

  it('maps null content to CONTENT.ALL', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: null }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'all');
  });

  // ── Variant-specific Layout ────────────────────────────────────────

  it('wraps FilterLayout and FilterContent in a sticky container for sidebar variant', () => {
    const { container } = render(<CustomFeedFilters variant="sidebar" />);

    const stickyContainer = container.querySelector('.sticky');
    expect(stickyContainer).toBeInTheDocument();
    expect(stickyContainer).toHaveClass('top-[100px]');
    expect(stickyContainer).toHaveClass('flex');
    expect(stickyContainer).toHaveClass('w-full');
    expect(stickyContainer).toHaveClass('flex-col');
    expect(stickyContainer).toHaveClass('gap-6');
    expect(stickyContainer).toHaveClass('self-start');
  });

  it('does not have a sticky container for drawer variant', () => {
    const { container } = render(<CustomFeedFilters variant="drawer" />);

    const stickyContainer = container.querySelector('.sticky');
    expect(stickyContainer).not.toBeInTheDocument();
  });

  // ── All Mapper Combinations ────────────────────────────────────────

  it('maps all reach values correctly', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: 'friends' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'friends');
  });

  it('maps all correctly', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: 'all' }));
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'all');
  });

  it('maps recent to timeline', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ sort: 'recent' }));
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-selected-tab', 'timeline');
  });

  it('maps visual correctly', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ layout: 'visual' }));
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-selected-tab', 'visual');
  });

  it('maps video to videos', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: 'video' }));
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'videos');
  });

  it('maps link to links', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: 'link' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'links');
  });

  it('maps article to long', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: 'article' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'long');
  });

  // ── Zero-value Enum Handling ───────────────────────────────────────
  // The component uses `!== undefined` checks so enum values equal to 0
  // are correctly passed through to the mapper functions.

  it('correctly maps zero-value enum following', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: 'following' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'following');
  });

  it('correctly maps zero-value enum recent', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ sort: 'recent' }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-selected-tab', 'timeline');
  });

  describe('a feed of external resources', () => {
    const resourceFeed = (reach: string) => ({
      id: 'resource-feed',
      name: 'Music',
      tags: ['music'],
      domain_tags: [],
      reach,
      sort: 'recent',
      content: null,
      target: 'resources',
      layout: 'columns',
      created_at: 0,
      updated_at: 0,
    });

    it('shows External resources as its content and its tags as plain tags', () => {
      mockUseCustomFeed.mockReturnValue(resourceFeed('following'));
      render(<CustomFeedFilters variant="sidebar" />);

      expect(screen.getAllByTestId('filter-content')[0]).toHaveAttribute('data-selected-tab', 'resources');
      expect(screen.getByText('Filter on Tags')).toBeInTheDocument();
      // The reaches and the layout it has no counterpart for are not listed, with no note
      expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-hidden-tabs', 'network,tagged_as,me');
      expect(screen.getAllByTestId('filter-layout')[0]).toHaveAttribute('data-show-visual', 'false');
    });

    it('shows a My network feed as My network where Pinakes serves it, Tagged as as All', () => {
      reachSet.served = true;
      mockUseCustomFeed.mockReturnValue(resourceFeed('wot'));
      const { unmount } = render(<CustomFeedFilters variant="sidebar" />);
      expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'network');
      expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-hidden-tabs', 'tagged_as,me');
      unmount();

      mockUseCustomFeed.mockReturnValue({ ...resourceFeed('wot'), domain_tags: ['bitcoiner'] });
      render(<CustomFeedFilters variant="sidebar" />);
      expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'all');
    });

    it('lists every reach and layout for a feed of posts', () => {
      mockUseCustomFeed.mockReturnValue(createMockFeed());
      render(<CustomFeedFilters variant="sidebar" />);

      expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-hidden-tabs', '');
      expect(screen.getAllByTestId('filter-layout')[0]).toHaveAttribute('data-show-visual', 'true');
    });

    it('gives Search’s resource filters in place of Sort once the feed’s saved filters are in the URL', () => {
      mockUseCustomFeed.mockReturnValue({
        ...resourceFeed('following'),
        resource_types: ['MusicAlbum', 'MusicRecording'],
      });
      const { rerender } = render(<CustomFeedFilters variant="sidebar" />);
      expect(screen.queryByTestId('search-resource-filters')).not.toBeInTheDocument();
      expect(screen.queryByTestId('filter-sort')).not.toBeInTheDocument();

      seeded.ready = true;
      rerender(<CustomFeedFilters variant="sidebar" />);
      expect(JSON.parse(screen.getByTestId('search-resource-filters').dataset.feed ?? 'null')).toEqual({
        tags: ['music'],
        reach: 'following',
        sort: 'recent',
        // Searched as saved, never widened to the whole kind
        subKinds: ['MusicAlbum', 'MusicRecording'],
      });
      // The types are the panel's Kind and Type, so no row of their own
      expect(screen.queryByTestId('custom-feed-resource-types')).not.toBeInTheDocument();
    });

    it('shows types of several kinds, which the Kind filter cannot hold, as a read-only row', () => {
      seeded.ready = true;
      mockUseCustomFeed.mockReturnValue({ ...resourceFeed('all'), resource_types: ['Book', 'Event'] });
      render(<CustomFeedFilters variant="sidebar" />);

      expect(screen.getByTestId('custom-feed-resource-types')).toHaveTextContent('Book, Event');
      // A plain value, not a tag
      expect(screen.queryByTestId('readonly-tag-Book')).not.toBeInTheDocument();
      expect(JSON.parse(screen.getByTestId('search-resource-filters').dataset.feed ?? 'null')).toMatchObject({
        types: ['Book', 'Event'],
      });
    });

    it('shows All, with no note, for a stored reach the resource search has none for', () => {
      mockUseCustomFeed.mockReturnValue(resourceFeed('followers'));
      render(<CustomFeedFilters variant="sidebar" />);

      expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'all');
      expect(screen.queryByText(/Not applied/)).not.toBeInTheDocument();
    });
  });
});
