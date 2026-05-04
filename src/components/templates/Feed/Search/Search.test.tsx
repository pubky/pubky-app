import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Search } from './Search';

const mockUseIsMobile = vi.fn(() => false);
const mockUseSearchTags = vi.fn(() => ['pubky']);

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/useSearchStreamId/useSearchStreamId', () => ({
  useSearchTags: () => mockUseSearchTags(),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => {
  return {
    ContentLayout: ({ children, feedVariant }: { children: React.ReactNode; feedVariant?: string }) => (
      <div data-testid="content-layout" data-feed-variant={feedVariant}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/organisms/DialogWelcome/DialogWelcome', () => {
  return {
    DialogWelcome: () => <div data-testid="dialog-welcome">DialogWelcome</div>,
  };
});

vi.mock('@/organisms/FeedRightSidebar/FeedRightSidebar', () => {
  return {
    HomeFeedRightSidebar: () => <div data-testid="home-feed-right-sidebar">HomeFeedRightSidebar</div>,
    HomeFeedRightDrawer: () => <div data-testid="home-feed-right-drawer">HomeFeedRightDrawer</div>,
  };
});

vi.mock('@/organisms/HomeFeedSidebar/HomeFeedSidebar', () => {
  return {
    HomeFeedSidebar: () => <div data-testid="home-feed-sidebar">HomeFeedSidebar</div>,
    HomeFeedDrawer: () => <div data-testid="home-feed-drawer">HomeFeedDrawer</div>,
    HomeFeedDrawerMobile: () => <div data-testid="home-feed-drawer-mobile">HomeFeedDrawerMobile</div>,
  };
});

vi.mock('@/organisms/SearchInput/SearchInput', () => {
  return {
    SearchInput: () => <div data-testid="search-input">SearchInput</div>,
  };
});

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => {
  return {
    TimelineFeed: () => <div data-testid="timeline-feed">TimelineFeed</div>,
  };
});

vi.mock('@/molecules/SearchEmptyState/SearchEmptyState', () => {
  return {
    SearchEmptyState: () => <div data-testid="search-empty-state">SearchEmptyState</div>,
  };
});

vi.mock('@/molecules/SearchHeader/SearchHeader', () => {
  return {
    SearchHeader: () => <div data-testid="search-header">SearchHeader</div>,
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      overrideDefaults: _overrideDefaults,
      ...props
    }: {
      children: React.ReactNode;
      overrideDefaults?: boolean;
      [key: string]: unknown;
    }) => (
      <div data-testid="container" {...props}>
        {children}
      </div>
    ),
  };
});

describe('Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    mockUseSearchTags.mockReturnValue(['pubky']);
  });

  it('passes SEARCH feedVariant to ContentLayout', () => {
    render(<Search />);

    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-feed-variant', 'search');
  });

  it('renders search results when tags are present', () => {
    render(<Search />);

    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
    expect(screen.getByTestId('search-header')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
  });

  it('renders the empty state when no tags are present', () => {
    mockUseSearchTags.mockReturnValue([]);

    render(<Search />);

    expect(screen.getByTestId('search-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
  });
});
