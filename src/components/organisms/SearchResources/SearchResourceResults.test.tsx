import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import { parseResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import type { SearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import type { UseSearchResourceQueryResult } from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import type { TResourceQuery } from '@/pipes/resource/resource.search';
import type { TPinakesTypeFacet } from '@/services/pinakes/pinakes.types';
import { LAYOUT } from '@/stores/home/home.types';
import { SearchResourceResults } from './SearchResourceResults';

const PK = 'hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  query: vi.fn(),
  feed: vi.fn(),
  setFilters: vi.fn(),
  criteria: vi.fn((): SearchCriteria => ({ mode: 'tags', tags: ['music'] })),
  addTagToSearch: vi.fn(),
  user: { name: undefined as string | undefined },
}));

vi.mock('@/hooks/useResourceSearch/useResourceSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useResourceSearch/useResourceSearch')>()),
  useResourceSearch: mocks.search,
}));
vi.mock('@/hooks/useSearchResourceQuery/useSearchResourceQuery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSearchResourceQuery/useSearchResourceQuery')>()),
  useSearchResourceQuery: mocks.query,
}));
vi.mock('@/hooks/useResourceSearchFilters/useResourceSearchFilters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useResourceSearchFilters/useResourceSearchFilters')>()),
  useResourceSearchFilters: () => ({ setFilters: mocks.setFilters }),
}));
vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: () => ({ userDetails: mocks.user.name ? { name: mocks.user.name } : undefined, isLoading: false }),
}));
vi.mock('@/hooks/useSearchCriteria/useSearchCriteria', () => ({ useSearchCriteria: mocks.criteria }));
vi.mock('@/hooks/useTagSearch/useTagSearch', () => ({
  useTagSearch: () => ({ addTagToSearch: mocks.addTagToSearch }),
}));
vi.mock('@/organisms/Timeline/Feed/ResourceTimelineFeed/ResourceTimelineFeed', () => ({
  ResourceTimelineFeed: ({
    children,
    leadingItem,
    search,
    emptyState,
  }: {
    children?: React.ReactNode;
    leadingItem?: React.ReactNode;
    search: UseResourceSearchResult;
    emptyState?: React.ReactElement<{ title?: string; subtitle?: string }>;
  }) => {
    mocks.feed({ search, emptyState });
    return (
      <div data-testid="resource-feed" data-loading={String(search.loading)}>
        {children}
        {leadingItem}
      </div>
    );
  },
}));

const facet = (type: string, path: string[], count: number): TPinakesTypeFacet => ({
  type,
  type_path: ['Thing', ...path],
  count,
});
const FACETS = [
  facet('MusicRecording', ['CreativeWork'], 70),
  facet('MusicAlbum', ['CreativeWork', 'MusicPlaylist'], 25),
  facet('MusicGroup', ['Organization', 'PerformingGroup'], 27),
  facet('WebPage', ['CreativeWork'], 140),
];

const searchResult = (overrides: Partial<UseResourceSearchResult> = {}): UseResourceSearchResult => ({
  uris: [],
  typeFacets: null,
  relatedTags: ['track', 'artist'],
  hostFacets: null,
  categoryFacets: null,
  source: 'pinakes',
  unavailable: false,
  reachTruncated: false,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(async () => {}),
  retry: vi.fn(),
  ...overrides,
});
const queryResult = (
  search = '',
  overrides: Partial<UseSearchResourceQueryResult> = {},
): UseSearchResourceQueryResult => ({
  query: null,
  isPending: false,
  kindsFailed: false,
  retryKinds: vi.fn(),
  kindsUnavailable: false,
  url: null,
  isReachIgnored: false,
  filters: parseResourceSearchFilters(new URLSearchParams(search)),
  sort: 'activity',
  defaultSort: 'activity',
  sorts: ['activity', 'trending', 'recent'],
  searchedTags: ['music'],
  canMatchAll: false,
  narrowTags: [],
  typeFacets: FACETS,
  sections: [],
  isFiltersOnly: false,
  ...overrides,
});

describe('SearchResourceResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.name = undefined;
    mocks.criteria.mockReturnValue({ mode: 'tags', tags: ['music'] });
    mocks.query.mockReturnValue(queryResult());
    mocks.search.mockReturnValue(searchResult());
  });

  it('asks for the kinds and the facets of the result; the sub-kinds are in the filter panel', () => {
    mocks.query.mockReturnValue(queryResult('kind=music&type=MusicGroup'));
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    expect(mocks.query).toHaveBeenCalledWith({ withKinds: true });
    expect(mocks.search).toHaveBeenCalledWith(null, { facets: true });
    expect(screen.queryByTestId('resource-type-MusicGroup')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-resource-active-filters')).not.toBeInTheDocument();
  });

  it('is loading, not empty, while a picked kind waits for the index’s types', () => {
    mocks.query.mockReturnValue(queryResult('kind=article', { isPending: true, typeFacets: null }));
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    expect(screen.getByTestId('resource-feed')).toHaveAttribute('data-loading', 'true');
  });

  it('lists More kinds’ results with no empty state of its own: an empty search reads as any other', () => {
    const query: TResourceQuery = {
      input: { kind: 'tags', tags: ['music'] },
      sort: 'activity',
      reach: 'all',
      viewer: null,
      collapse: true,
      excludeTypes: ['Event'],
    };
    mocks.query.mockReturnValue(queryResult('kind=more', { query }));
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    expect(mocks.search).toHaveBeenCalledWith(query, { facets: true });
    expect(mocks.feed.mock.lastCall?.[0].emptyState.props).toEqual({ isCollections: false, isResources: true });
  });

  it('shows the failure, with a retry of the kinds read, when a picked type cannot read the index’s types', () => {
    const retryKinds = vi.fn();
    mocks.query.mockReturnValue(
      queryResult('kind=more&type=WebPage', { kindsFailed: true, retryKinds, typeFacets: null }),
    );
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    expect(mocks.feed.mock.lastCall?.[0].search).toMatchObject({
      error: 'Searching external resources is not available right now.',
      retry: retryKinds,
      unavailable: false,
    });
  });

  it('shows who the links were shared by and the collection, each removable', () => {
    mocks.user.name = 'Gil';
    mocks.query.mockReturnValue(queryResult(`by=${PK}&in=pubky://${PK}/pub/social/v1/posts/1`));
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    // The app's secondary pill buttons (not tag chips): pressing one removes its filter
    const author = screen.getByTestId('search-resource-author');
    expect(author).toHaveTextContent('Shared by Gil');
    expect(author).not.toHaveAttribute('data-cy', 'post-tag');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Shared by Gil' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ author: null });

    expect(screen.getByTestId('search-resource-collection')).toHaveTextContent('In a collection');
    fireEvent.click(screen.getByRole('button', { name: 'Remove In a collection' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ inCollection: null });
  });

  it('shows no author or collection for what is related to a searched link: they do not apply', () => {
    mocks.query.mockReturnValue(
      queryResult(`by=${PK}&in=pubky://${PK}/pub/social/v1/posts/1`, { url: 'https://example.com/song', sorts: [] }),
    );
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    expect(screen.queryByTestId('search-resource-author')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-resource-collection')).not.toBeInTheDocument();
  });

  it('narrows a tag search by a related tag into the URL, every tag matching, at most 3 tags in all', () => {
    const { rerender } = render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    fireEvent.click(within(screen.getByTestId('search-resource-related-tags')).getByText('track'));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ narrowTags: ['track'] });

    mocks.query.mockReturnValue(queryResult('and=track', { narrowTags: ['track'] }));
    rerender(<SearchResourceResults layout={LAYOUT.COLUMNS} />);
    fireEvent.click(within(screen.getByTestId('search-resource-related-tags')).getByText('artist'));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ narrowTags: ['track', 'artist'] });
    expect(mocks.addTagToSearch).not.toHaveBeenCalled();
  });

  it('turns a related tag of a text search into a tag search', () => {
    mocks.criteria.mockReturnValue({ mode: 'content', query: 'daft punk' });
    mocks.query.mockReturnValue(queryResult('', { searchedTags: [] }));
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    fireEvent.click(within(screen.getByTestId('search-resource-related-tags')).getByText('track'));

    expect(mocks.addTagToSearch).toHaveBeenCalledWith('track', { addToRecent: true });
  });

  it('says when only part of a large network was searched', () => {
    mocks.search.mockReturnValue(searchResult({ reachTruncated: true }));
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    expect(screen.getByTestId('search-resource-reach-truncated')).toHaveTextContent(
      'Your network is large: these come from part of it.',
    );
  });

  it('says when the resource stream answered because search is down', () => {
    mocks.search.mockReturnValue(searchResult({ source: 'nexus', relatedTags: [] }));
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    expect(screen.getByTestId('search-resource-fallback-note')).toHaveTextContent(
      'Search is unavailable right now: showing the latest tagged resources.',
    );
  });

  it('puts a searched link’s card first', () => {
    mocks.query.mockReturnValue(queryResult('', { url: 'https://example.com/song', sorts: [] }));
    render(<SearchResourceResults layout={LAYOUT.COLUMNS} />);

    expect(screen.getByTestId('search-resource-top')).toBeInTheDocument();
  });

  it('lists a feed’s External resources with the panel’s filters, under the feed’s own children, with no Search controls', () => {
    const feed = { tags: [], reach: 'following', sort: 'timeline' };
    mocks.query.mockReturnValue(queryResult('', { searchedTags: [] }));
    mocks.search.mockReturnValue(searchResult({ reachTruncated: true, source: 'nexus' }));
    render(
      <SearchResourceResults layout={LAYOUT.COLUMNS} feed={feed}>
        <div data-testid="composer" />
      </SearchResourceResults>,
    );

    expect(mocks.query).toHaveBeenCalledWith({ withKinds: true, feed });
    expect(screen.getByTestId('resource-feed')).toContainElement(screen.getByTestId('composer'));
    // No related tags, notes or Search entry points on a feed, and the feed's own empty state
    expect(screen.queryByTestId('search-resource-controls')).not.toBeInTheDocument();
    expect(screen.queryByText('track')).not.toBeInTheDocument();
    expect(mocks.feed).toHaveBeenLastCalledWith(expect.objectContaining({ emptyState: undefined }));
  });
});
