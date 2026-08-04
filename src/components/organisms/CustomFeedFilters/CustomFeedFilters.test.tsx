import { render, screen } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { CustomFeedFilters } from './CustomFeedFilters';

// Mock hooks
const mockUseCustomFeed = vi.fn();
vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => ({
  useCustomFeed: () => mockUseCustomFeed(),
}));

// Mock store constants
vi.mock('@/stores/home/home.types', () => ({
  REACH: {
    ALL: 'all',
    NETWORK: 'network',
    FOLLOWING: 'following',
    FRIENDS: 'friends',
    ME: 'me',
  },
  SORT: {
    TIMELINE: 'timeline',
    ENGAGEMENT: 'total_engagement',
  },
  LAYOUT: {
    COLUMNS: 'columns',
    WIDE: 'wide',
    VISUAL: 'visual',
  },
  CONTENT: {
    ALL: 'all',
    SHORT: 'short',
    LONG: 'long',
    IMAGES: 'images',
    VIDEOS: 'videos',
    LINKS: 'links',
    FILES: 'files',
  },
}));

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
    }: {
      selectedTab?: string;
      defaultSelectedTab?: string;
      disabled?: boolean;
    }) => (
      <div
        data-testid="filter-layout"
        data-selected-tab={selectedTab ?? ''}
        data-default-selected-tab={defaultSelectedTab ?? ''}
        data-disabled={disabled}
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
    }: {
      selectedTab?: string;
      defaultSelectedTab?: string;
      disabled?: boolean;
      showTaggedAs?: boolean;
    }) => (
      <div
        data-testid="filter-reach"
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
  reach: PubkyAppFeedReach.All,
  sort: PubkyAppFeedSort.Recent,
  content: PubkyAppPostKind.Short,
  layout: PubkyAppFeedLayout.Columns,
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
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: PubkyAppFeedReach.Following }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'following');
  });

  it('maps My network and Me reach values and exposes the standalone read-only options', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: PubkyAppFeedReach.Wot }));
    const { rerender } = render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'network');
    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-show-tagged-as', 'true');

    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: PubkyAppFeedReach.Me }));
    rerender(<CustomFeedFilters variant="sidebar" />);
    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'me');
  });

  it('renders post and profile tags in separate labeled groups', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({ tags: ['bitcoin'], domain_tags: ['bitcoiner', '🔥'], reach: PubkyAppFeedReach.Wot }),
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
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({ tags: [], domain_tags: ['bitcoiner'], reach: PubkyAppFeedReach.Me }),
    );

    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'me');
    expect(screen.getByTestId('readonly-tag-bitcoiner')).toBeInTheDocument();
  });

  it('maps customFeed sort to filter selectedTab', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ sort: PubkyAppFeedSort.Popularity }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-selected-tab', 'total_engagement');
  });

  it('maps customFeed layout to filter selectedTab', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ layout: PubkyAppFeedLayout.Wide }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-selected-tab', 'wide');
  });

  it('maps customFeed content to filter selectedTab', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: PubkyAppPostKind.Image }));
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
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: PubkyAppFeedReach.Friends }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'friends');
  });

  it('maps PubkyAppFeedReach.All correctly', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: PubkyAppFeedReach.All }));
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'all');
  });

  it('maps PubkyAppFeedSort.Recent to timeline', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ sort: PubkyAppFeedSort.Recent }));
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-selected-tab', 'timeline');
  });

  it('maps PubkyAppFeedLayout.Visual correctly', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ layout: PubkyAppFeedLayout.Visual }));
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-selected-tab', 'visual');
  });

  it('maps PubkyAppPostKind.Video to videos', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: PubkyAppPostKind.Video }));
    render(<CustomFeedFilters variant="drawer" />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'videos');
  });

  it('maps PubkyAppPostKind.Link to links', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: PubkyAppPostKind.Link }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'links');
  });

  it('maps PubkyAppPostKind.Long to long', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: PubkyAppPostKind.Long }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-content')).toHaveAttribute('data-selected-tab', 'long');
  });

  // ── Zero-value Enum Handling ───────────────────────────────────────
  // The component uses `!== undefined` checks so enum values equal to 0
  // are correctly passed through to the mapper functions.

  it('correctly maps zero-value enum PubkyAppFeedReach.Following', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ reach: PubkyAppFeedReach.Following }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'following');
  });

  it('correctly maps zero-value enum PubkyAppFeedSort.Recent', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ sort: PubkyAppFeedSort.Recent }));
    render(<CustomFeedFilters variant="sidebar" />);

    expect(screen.getByTestId('filter-sort')).toHaveAttribute('data-selected-tab', 'timeline');
  });
});

describe('CustomFeedFilters - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCustomFeed.mockReturnValue(undefined);
  });

  it('matches snapshot for sidebar variant without custom feed', () => {
    const { container } = render(<CustomFeedFilters variant="sidebar" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for drawer variant without custom feed', () => {
    const { container } = render(<CustomFeedFilters variant="drawer" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for sidebar variant with custom feed', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.Following,
        sort: PubkyAppFeedSort.Popularity,
        layout: PubkyAppFeedLayout.Wide,
        content: PubkyAppPostKind.Image,
      }),
    );
    const { container } = render(<CustomFeedFilters variant="sidebar" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for drawer variant with custom feed', () => {
    mockUseCustomFeed.mockReturnValue(
      createMockFeed({
        reach: PubkyAppFeedReach.Friends,
        sort: PubkyAppFeedSort.Recent,
        layout: PubkyAppFeedLayout.Columns,
        content: PubkyAppPostKind.Long,
      }),
    );
    const { container } = render(<CustomFeedFilters variant="drawer" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for sidebar variant with null content', () => {
    mockUseCustomFeed.mockReturnValue(createMockFeed({ content: null }));
    const { container } = render(<CustomFeedFilters variant="sidebar" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
