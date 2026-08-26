import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchCriteria } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { CONTENT } from '@/stores/home/home.types';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { Search } from './Search';

const { mockUseIsMobile, mockUseSearchCriteria, mockHomeState, mockLayoutResolution } = vi.hoisted(() => ({
  mockUseIsMobile: vi.fn(() => false),
  mockUseSearchCriteria: vi.fn((): SearchCriteria => ({ mode: 'tags', tags: ['pubky'] })),
  mockHomeState: { content: 'all' },
  mockLayoutResolution: { isVisualActive: false },
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/useSearchStreamId/useSearchStreamId', () => ({
  useSearchCriteria: () => mockUseSearchCriteria(),
}));

vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: () => mockLayoutResolution,
}));

vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: (selector: (state: { content: string }) => unknown) => selector(mockHomeState),
}));

vi.mock('@/organisms/Collections/SearchCollections/SearchCollections', () => ({
  SearchCollections: () => <div data-testid="search-collections">SearchCollections</div>,
}));

vi.mock('@/organisms/SearchPeople/SearchPeople', () => ({
  SearchPeople: () => <div data-testid="search-people">SearchPeople</div>,
}));

vi.mock('@/organisms/SearchInput/SearchInput', () => ({
  SearchInput: ({ autoFocus }: { autoFocus?: boolean }) => (
    <div data-auto-focus={String(Boolean(autoFocus))} data-testid="search-input">
      SearchInput
    </div>
  ),
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
    mockUseSearchCriteria.mockReturnValue({ mode: 'tags', tags: ['pubky'] });
    mockHomeState.content = CONTENT.ALL;
    mockLayoutResolution.isVisualActive = false;
  });

  it('renders TimelineFeed with SEARCH variant when tags are present', () => {
    render(<Search />);

    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'search');
  });

  it('renders the People and Collections sections and Posts heading in the default view', () => {
    render(<Search />);

    expect(screen.getByTestId('search-people')).toBeInTheDocument();
    expect(screen.getByTestId('search-collections')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Posts' })).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
  });

  it('renders the People section above the Collections section', () => {
    render(<Search />);

    const people = screen.getByTestId('search-people');
    const collections = screen.getByTestId('search-collections');
    expect(people.compareDocumentPosition(collections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the bare feed when the content filter is not All', () => {
    mockHomeState.content = CONTENT.COLLECTIONS;

    render(<Search />);

    expect(screen.queryByTestId('search-people')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-collections')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Posts' })).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
  });

  it('renders the bare feed when visual layout is active', () => {
    mockLayoutResolution.isVisualActive = true;

    render(<Search />);

    expect(screen.queryByTestId('search-people')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-collections')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Posts' })).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
  });

  it('renders full-text results and keeps the mobile input collapsed when q is present', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'content', query: 'bitcoin wallet' });

    render(<Search />);

    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
    expect(screen.getByTestId('search-input')).toHaveAttribute('data-auto-focus', 'false');
    // People and Collections are tag-driven, so a full-text query shows the feed alone
    expect(screen.queryByTestId('search-people')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-collections')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Posts' })).not.toBeInTheDocument();
  });

  it('renders the empty state when no search criteria are present', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'none' });

    render(<Search />);

    expect(screen.getByTestId('search-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-people')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-collections')).not.toBeInTheDocument();
  });

  it('explains an invalid query alongside the empty state instead of showing results', () => {
    mockUseSearchCriteria.mockReturnValue({
      mode: 'invalid',
      message: 'Search can contain up to 4 terms',
      query: 'one two three four five',
    });

    render(<Search />);

    const invalidQuery = screen.getByTestId('search-invalid-query');
    expect(invalidQuery).toHaveTextContent('Search can contain up to 4 terms');
    expect(screen.getByRole('alert')).toBe(invalidQuery);
    expect(screen.getByTestId('search-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
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
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
    mockUseSearchCriteria.mockReturnValue({ mode: 'tags', tags: ['pubky'] });
    mockHomeState.content = CONTENT.ALL;
    mockLayoutResolution.isVisualActive = false;
  });

  it('matches snapshot with tags present', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'tags', tags: ['pubky'] });
    const { container } = render(<Search />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with tags present and a non-All content filter', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'tags', tags: ['pubky'] });
    mockHomeState.content = CONTENT.COLLECTIONS;
    const { container } = render(<Search />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with no tags', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'none' });
    const { container } = render(<Search />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with full-text results', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'content', query: 'bitcoin wallet' });
    const { container } = render(<Search />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with an invalid query', () => {
    mockUseSearchCriteria.mockReturnValue({
      mode: 'invalid',
      message: 'Search can contain up to 4 terms',
      query: 'one two three four five',
    });
    const { container } = render(<Search />);
    expect(container).toMatchSnapshot();
  });
});

describe('Search - Mobile Snapshots', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(true);
    mockUseSearchCriteria.mockReturnValue({ mode: 'tags', tags: ['pubky'] });
    mockHomeState.content = CONTENT.ALL;
    mockLayoutResolution.isVisualActive = false;
    setMobileViewport();
  });
  afterEach(() => {
    resetViewport();
  });
  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<Search />);
    expect(container).toMatchSnapshot();
  });
});
