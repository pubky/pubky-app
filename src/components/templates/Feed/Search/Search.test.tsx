import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Search } from './Search';

const mockUseIsMobile = vi.fn(() => false);
const mockUseSearchTags = vi.fn(() => ['pubky']);

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/useSearchStreamId/useSearchStreamId', () => ({
  useSearchTags: () => mockUseSearchTags(),
}));

vi.mock('@/organisms/SearchInput/SearchInput', () => ({
  SearchInput: () => <div data-testid="search-input">SearchInput</div>,
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({ variant }: { variant: string }) => (
    <div data-testid="timeline-feed" data-variant={variant}>
      TimelineFeed
    </div>
  ),
}));

vi.mock('@/molecules/SearchEmptyState/SearchEmptyState', () => ({
  SearchEmptyState: () => <div data-testid="search-empty-state">SearchEmptyState</div>,
}));

vi.mock('@/molecules/SearchHeader/SearchHeader', () => ({
  SearchHeader: () => <div data-testid="search-header">SearchHeader</div>,
}));

vi.mock('@/atoms/Container/Container', () => ({
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

  it('renders TimelineFeed with SEARCH variant when tags are present', () => {
    render(<Search />);

    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'search');
  });

  it('renders search results header when tags are present', () => {
    render(<Search />);

    expect(screen.getByTestId('search-header')).toBeInTheDocument();
    expect(screen.queryByTestId('search-empty-state')).not.toBeInTheDocument();
  });

  it('renders the empty state when no tags are present', () => {
    mockUseSearchTags.mockReturnValue([]);

    render(<Search />);

    expect(screen.getByTestId('search-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-header')).not.toBeInTheDocument();
  });

  it('renders the mobile SearchInput', () => {
    render(<Search />);

    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });

  it('does not render a ContentLayout shell (hoisted into (feeds)/layout.tsx)', () => {
    render(<Search />);
    expect(screen.queryByTestId('content-layout')).not.toBeInTheDocument();
  });

  it('does not render DialogWelcome (removed as stray import)', () => {
    render(<Search />);
    expect(screen.queryByTestId('dialog-welcome')).not.toBeInTheDocument();
  });
});

describe('Search - Snapshots', () => {
  it('matches snapshot with tags present', () => {
    mockUseSearchTags.mockReturnValue(['pubky']);
    const { container } = render(<Search />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with no tags', () => {
    mockUseSearchTags.mockReturnValue([]);
    const { container } = render(<Search />);
    expect(container).toMatchSnapshot();
  });
});
