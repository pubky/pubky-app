import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Search } from './Search';

const mockUseLayoutReset = vi.fn();
const mockUseIsMobile = vi.fn(() => false);
const mockUseSearchTags = vi.fn(() => ['pubky']);

vi.mock('@/hooks', () => ({
  useLayoutReset: () => mockUseLayoutReset(),
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/useSearchStreamId', () => ({
  useSearchTags: () => mockUseSearchTags(),
}));

vi.mock('@/organisms', () => ({
  DialogWelcome: () => <div data-testid="dialog-welcome">DialogWelcome</div>,
  ContentLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="content-layout">{children}</div>,
  HomeFeedSidebar: () => <div data-testid="home-feed-sidebar">HomeFeedSidebar</div>,
  HomeFeedRightSidebar: () => <div data-testid="home-feed-right-sidebar">HomeFeedRightSidebar</div>,
  HomeFeedDrawer: () => <div data-testid="home-feed-drawer">HomeFeedDrawer</div>,
  HomeFeedRightDrawer: () => <div data-testid="home-feed-right-drawer">HomeFeedRightDrawer</div>,
  HomeFeedDrawerMobile: () => <div data-testid="home-feed-drawer-mobile">HomeFeedDrawerMobile</div>,
  SearchInput: () => <div data-testid="search-input">SearchInput</div>,
  TimelineFeed: () => <div data-testid="timeline-feed">TimelineFeed</div>,
}));

vi.mock('@/molecules', () => ({
  SearchHeader: () => <div data-testid="search-header">SearchHeader</div>,
  SearchEmptyState: () => <div data-testid="search-empty-state">SearchEmptyState</div>,
}));

vi.mock('@/atoms', () => ({
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
}));

describe('Search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsMobile.mockReturnValue(false);
    mockUseSearchTags.mockReturnValue(['pubky']);
  });

  it('restores the unsupported wide layout on mount', () => {
    render(<Search />);

    expect(mockUseLayoutReset).toHaveBeenCalled();
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
