import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { CustomFeedFilters } from './CustomFeedFilters';

// Mock hooks
const mockUseCustomFeed = vi.fn();
vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => ({
  useCustomFeed: () => mockUseCustomFeed(),
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
      showCards,
    }: {
      selectedTab?: string;
      defaultSelectedTab?: string;
      disabled?: boolean;
      showCards?: boolean;
    }) => (
      <div
        data-testid="filter-layout"
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
});
