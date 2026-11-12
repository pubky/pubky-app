import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { CONTENT } from '@/stores/home/home.types';
import { Search } from './Search';

const { mockUseIsMobile, mockUseSearchCriteria, mockHomeState, mockLayoutResolution, mockResourceFilters } = vi.hoisted(
  () => ({
    mockUseIsMobile: vi.fn(() => false),
    mockUseSearchCriteria: vi.fn((): SearchCriteria => ({ mode: 'tags', tags: ['pubky'] })),
    mockHomeState: { content: 'all', setContent: vi.fn() },
    mockLayoutResolution: { isVisualActive: false },
    mockResourceFilters: { hasFilters: false, isFiltersSearch: false, clearFilters: vi.fn() },
  }),
);

vi.mock('@/hooks/useResourceSearchFilters/useResourceSearchFilters', () => ({
  useResourceSearchFilters: () => mockResourceFilters,
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/hooks/useSearchCriteria/useSearchCriteria', () => ({
  useSearchCriteria: () => mockUseSearchCriteria(),
}));

vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: () => mockLayoutResolution,
}));

vi.mock('@/stores/home/home.store', () => ({
  useHomeStore: (selector: (state: typeof mockHomeState) => unknown) => selector(mockHomeState),
}));

vi.mock('@/organisms/Collections/SearchCollections/SearchCollections', () => ({
  SearchCollections: () => <div data-testid="search-collections">SearchCollections</div>,
}));

vi.mock('@/organisms/SearchPeople/SearchPeople', () => ({
  SearchPeople: () => <div data-testid="search-people">SearchPeople</div>,
}));

vi.mock('@/organisms/SearchResources/SearchResourceResults', () => ({
  SearchResourceResults: ({ layout }: { layout: string }) => (
    <div data-testid="search-resource-results" data-layout={layout} />
  ),
}));
vi.mock('@/organisms/SearchResources/SearchResources', () => ({
  SearchResources: () => <div data-testid="search-resources">SearchResources</div>,
}));

vi.mock('@/organisms/SearchContentTags/SearchContentTags', () => ({
  SearchContentTags: () => <div data-testid="search-content-tags">SearchContentTags</div>,
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
    mockResourceFilters.hasFilters = false;
    mockResourceFilters.isFiltersSearch = false;
  });

  it('opens the External resources tab for a search shared with its filters', () => {
    mockResourceFilters.hasFilters = true;
    render(<Search />);
    expect(mockHomeState.setContent).toHaveBeenCalledWith(CONTENT.RESOURCES);
  });

  it('leaves the Content alone for a plain search', () => {
    render(<Search />);
    expect(mockHomeState.setContent).not.toHaveBeenCalled();
  });

  it('drops the External resources filters when another Content is picked', () => {
    mockResourceFilters.hasFilters = true;
    mockHomeState.content = CONTENT.RESOURCES;
    const { rerender } = render(<Search />);
    expect(mockResourceFilters.clearFilters).not.toHaveBeenCalled();

    mockHomeState.content = CONTENT.LINKS;
    rerender(<Search />);
    expect(mockResourceFilters.clearFilters).toHaveBeenCalledTimes(1);
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

  it('renders the External resources section between Collections and Posts in the default view', () => {
    render(<Search />);

    const collections = screen.getByTestId('search-collections');
    const resources = screen.getByTestId('search-resources');
    const postsHeading = screen.getByRole('heading', { name: 'Posts' });
    expect(collections.compareDocumentPosition(resources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resources.compareDocumentPosition(postsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders only the resources feed under its heading for the External resources filter', () => {
    mockHomeState.content = CONTENT.RESOURCES;

    render(<Search />);

    expect(screen.getByRole('heading', { name: 'External resources', level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'search');
    expect(screen.queryByTestId('search-people')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-collections')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-resources')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Posts' })).not.toBeInTheDocument();
  });

  it('shows the External resources tab for a full-text search too, under the Tags pivot', () => {
    mockHomeState.content = CONTENT.RESOURCES;
    mockUseSearchCriteria.mockReturnValue({ mode: 'content', query: 'daft punk' });

    render(<Search />);

    expect(screen.getByRole('heading', { name: 'External resources', level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'search');
    expect(screen.getByTestId('search-content-tags')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Posts' })).not.toBeInTheDocument();
  });

  it('shows the External resources section in a full-text search of All, above Posts', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'content', query: 'daft punk' });

    render(<Search />);

    const resources = screen.getByTestId('search-resources');
    const postsHeading = screen.getByRole('heading', { name: 'Posts' });
    expect(resources.compareDocumentPosition(postsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
  });

  it('shows external resources only for a link no post search takes', () => {
    mockUseSearchCriteria.mockReturnValue({
      mode: 'resource',
      query: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq',
      input: { kind: 'url', url: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq' },
    });

    const { rerender } = render(<Search />);
    expect(screen.getByTestId('search-resources')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-invalid-query')).not.toBeInTheDocument();

    mockHomeState.content = CONTENT.RESOURCES;
    rerender(<Search />);
    expect(screen.getByRole('heading', { name: 'External resources', level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'search');
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
    // A full-text query shows the Tags pivot row above its feed — People and
    // Collections stay tag-driven
    expect(screen.getByTestId('search-content-tags')).toBeInTheDocument();
    expect(screen.queryByTestId('search-people')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-collections')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Posts', level: 2 })).toBeInTheDocument();
  });

  it('renders the Tags pivot row above the Posts heading and full-text feed', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'content', query: 'bitcoin wallet' });

    render(<Search />);

    const tagsRow = screen.getByTestId('search-content-tags');
    const postsHeading = screen.getByRole('heading', { name: 'Posts', level: 2 });
    const feed = screen.getByTestId('timeline-feed');
    expect(tagsRow.compareDocumentPosition(postsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(postsHeading.compareDocumentPosition(feed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('mounts the Tags pivot row only for full-text results', () => {
    render(<Search />);
    expect(screen.queryByTestId('search-content-tags')).not.toBeInTheDocument();

    mockUseSearchCriteria.mockReturnValue({ mode: 'none' });
    render(<Search />);
    expect(screen.queryByTestId('search-content-tags')).not.toBeInTheDocument();
  });

  it('lists external resources for filters alone (the links a user shared), with no text or tags', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'none' });
    mockResourceFilters.hasFilters = true;
    mockResourceFilters.isFiltersSearch = true;
    mockHomeState.content = CONTENT.RESOURCES;

    render(<Search />);

    expect(screen.getByRole('heading', { name: 'External resources', level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'search');
    expect(screen.queryByTestId('search-empty-state')).not.toBeInTheDocument();
  });

  it('lists filters alone in columns while the Visual layout is picked, with no note', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'none' });
    mockResourceFilters.hasFilters = true;
    mockResourceFilters.isFiltersSearch = true;
    mockLayoutResolution.isVisualActive = true;

    render(<Search />);

    expect(screen.getByRole('heading', { name: 'External resources', level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId('search-resource-results')).toHaveAttribute('data-layout', 'columns');
    expect(screen.queryByText(/Visual layout/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
  });

  it('keeps the empty state for filters that narrow nothing on their own', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'none' });
    mockResourceFilters.hasFilters = true;
    mockHomeState.content = CONTENT.RESOURCES;

    render(<Search />);

    expect(screen.getByTestId('search-empty-state')).toBeInTheDocument();
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
    // Never autofocus here: focusing opens the suggestions dropdown (z-50)
    // over the alert that explains why there are no results.
    expect(screen.getByTestId('search-input')).toHaveAttribute('data-auto-focus', 'false');
  });

  it('autofocuses the input only when there is nothing in the bar to cover', () => {
    mockUseSearchCriteria.mockReturnValue({ mode: 'none' });
    const { unmount } = render(<Search />);
    expect(screen.getByTestId('search-input')).toHaveAttribute('data-auto-focus', 'true');
    unmount();

    // Mobile tag search keeps the refine-focus behavior.
    mockUseIsMobile.mockReturnValue(true);
    mockUseSearchCriteria.mockReturnValue({ mode: 'tags', tags: ['pubky'] });
    render(<Search />);
    expect(screen.getByTestId('search-input')).toHaveAttribute('data-auto-focus', 'true');
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
