import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import type { UseSearchResourceQueryResult } from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import type { TResourceQuery } from '@/pipes/resource/resource.search';
import type { TPinakesTypeFacet } from '@/services/pinakes/pinakes.types';
import { SearchResourceFilters } from './SearchResourceFilters';

const mocks = vi.hoisted(() => ({ query: vi.fn(), setFilters: vi.fn(), results: vi.fn() }));

vi.mock('@/hooks/useResourceSearch/useResourceSearch', () => ({ useResourceSearch: mocks.results }));
vi.mock('@/hooks/useResourcePlaces/useResourcePlaces', () => ({
  useResourcePlaces: (name: string) => ({
    places: name ? [{ id: 'zh', name: 'Zürich', point: { lat: 47.37444, lon: 8.54111 } }] : [],
    loading: false,
    failed: false,
  }),
}));

vi.mock('@/hooks/useSearchResourceQuery/useSearchResourceQuery', () => ({ useSearchResourceQuery: mocks.query }));
vi.mock('@/hooks/useResourceSearchFilters/useResourceSearchFilters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useResourceSearchFilters/useResourceSearchFilters')>()),
  useResourceSearchFilters: () => ({
    filters: mocks.query().filters,
    setFilters: mocks.setFilters,
  }),
}));

const facet = (type: string, path: string[], count: number): TPinakesTypeFacet => ({
  type,
  type_path: ['Thing', ...path],
  count,
});
const FACETS = [
  facet('MusicRecording', ['CreativeWork'], 70),
  facet('Event', [], 112),
  facet('Restaurant', ['Organization', 'Place', 'LocalBusiness', 'FoodEstablishment'], 16),
  facet('WebPage', ['CreativeWork'], 140),
];
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
const radios = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole('radio')
    .map((radio) => `${radio.getAttribute('aria-label')}${radio.getAttribute('aria-checked') === 'true' ? ' *' : ''}`);

describe('SearchResourceFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockReturnValue(queryResult());
    mocks.results.mockReturnValue({ hostFacets: null, categoryFacets: null });
  });

  it('offers every kind the search finds with its links, More kinds last, and asks for the kinds', () => {
    render(<SearchResourceFilters />);

    expect(mocks.query).toHaveBeenCalledWith({ withKinds: true });
    expect(radios('filter-resource-kind-radiogroup')).toEqual([
      'All kinds *',
      'Music, 70',
      'Events, 112',
      'Places, 16',
      'More kinds, 140',
    ]);
  });

  it('picks a kind into the URL, dropping the sub-kinds of the last one, and All kinds clears it', () => {
    mocks.query.mockReturnValue(queryResult('kind=music&type=MusicRecording'));
    render(<SearchResourceFilters />);

    fireEvent.click(screen.getByRole('radio', { name: 'Events, 112' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ kind: 'event', types: [] });
    fireEvent.click(screen.getByRole('radio', { name: 'All kinds' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ kind: null, types: [] });
  });

  it('keeps a picked kind the search finds none of', () => {
    mocks.query.mockReturnValue(queryResult('kind=recipe'));
    render(<SearchResourceFilters />);

    expect(radios('filter-resource-kind-radiogroup')).toContain('Recipes *');
  });

  it('offers the orders of the search and the Trending window once Trending is picked', () => {
    render(<SearchResourceFilters />);
    expect(radios('filter-resource-sort-radiogroup')).toEqual(['Popular *', 'Trending', 'Recent']);
    expect(screen.queryByTestId('filter-resource-window-radiogroup')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Trending' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ sort: 'trending' });
  });

  it('offers Relevance for a text and Upcoming for Events, as the search says', () => {
    mocks.query.mockReturnValue(
      queryResult('sort=trending&window=24h', {
        sort: 'trending',
        sorts: ['relevance', 'activity', 'trending', 'recent', 'upcoming'],
      }),
    );
    render(<SearchResourceFilters />);

    expect(radios('filter-resource-sort-radiogroup')).toEqual([
      'Relevance',
      'Popular',
      'Trending *',
      'Recent',
      'Upcoming',
    ]);
    expect(radios('filter-resource-window-radiogroup')).toEqual(['Last 24 hours *', 'Last 7 days', 'Last 30 days']);
    fireEvent.click(screen.getByRole('radio', { name: 'Last 30 days' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ window: '30d' });
    // The default order is left out of the URL
    fireEvent.click(screen.getByRole('radio', { name: 'Popular' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ sort: null });
  });

  it('shows no order for what is related to a searched link: Pinakes ranks it', () => {
    mocks.query.mockReturnValue(queryResult('', { sorts: [], url: 'https://example.com' }));
    render(<SearchResourceFilters />);

    expect(screen.queryByTestId('filter-resource-sort-radiogroup')).not.toBeInTheDocument();
  });

  it('offers Any or All tags for 2 or 3 searched tags, and leaves the section out where only one applies', () => {
    render(<SearchResourceFilters />);
    expect(screen.queryByTestId('filter-resource-match-radiogroup')).not.toBeInTheDocument();
    mocks.query.mockReturnValue(queryResult('match=all', { searchedTags: ['music', 'jazz'], canMatchAll: true }));
    const { unmount } = render(<SearchResourceFilters />);
    expect(radios('filter-resource-match-radiogroup')).toEqual(['Any tag', 'All tags *']);
    fireEvent.click(screen.getByRole('radio', { name: 'Any tag' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ match: 'any' });
    unmount();

    // More than 3 tags: only Any applies (a carried match=all is not used), with no note
    mocks.query.mockReturnValue(queryResult('match=all', { searchedTags: ['a', 'b', 'c', 'd'], canMatchAll: false }));
    const { unmount: unmountMany } = render(<SearchResourceFilters />);
    expect(screen.queryByTestId('filter-resource-match-radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByText(/works with up to 3 tags/)).not.toBeInTheDocument();
    unmountMany();

    // Related tags narrowing the search: every tag matches, with no note
    mocks.query.mockReturnValue(
      queryResult('and=jazz', { searchedTags: ['music', 'live'], canMatchAll: true, narrowTags: ['jazz'] }),
    );
    render(<SearchResourceFilters />);
    expect(screen.queryByTestId('filter-resource-match-radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByText(/Related tags make/)).not.toBeInTheDocument();
  });

  describe('Type', () => {
    const MUSIC_FACETS = [
      facet('MusicRecording', ['CreativeWork'], 70),
      facet('MusicAlbum', ['CreativeWork', 'MusicPlaylist'], 25),
      facet('MusicGroup', ['Organization', 'PerformingGroup'], 27),
    ];
    const rows = () =>
      within(screen.getByTestId('search-resource-kinds'))
        .getAllByRole('button')
        .map(
          (row) => `${row.getAttribute('aria-label') ?? row.textContent}${row.dataset.selected === 'true' ? ' *' : ''}`,
        );

    it('shows no type before a kind is picked', () => {
      render(<SearchResourceFilters />);
      expect(screen.queryByTestId('filter-resource-type')).not.toBeInTheDocument();
    });

    it('lists the picked kind’s sub-kinds with their links in the panel’s rows, not as tags', () => {
      mocks.query.mockReturnValue(queryResult('kind=music&type=MusicGroup', { typeFacets: MUSIC_FACETS }));
      render(<SearchResourceFilters />);

      expect(rows()).toEqual(['All types', 'Songs, 70 links', 'Artists, 27 links *', 'Albums, 25 links']);
      expect(screen.getByTestId('resource-type-MusicGroup')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('resource-type-MusicGroup')).toHaveAttribute('data-slot', 'filter-item');
      expect(within(screen.getByTestId('filter-resource-type')).queryByTestId('post-tag')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-type-MusicRecording')).toHaveTextContent('Songs70');
    });

    it('picks several into the URL, and All types clears them', () => {
      mocks.query.mockReturnValue(queryResult('kind=music&type=MusicGroup', { typeFacets: MUSIC_FACETS }));
      render(<SearchResourceFilters />);

      fireEvent.click(screen.getByTestId('resource-type-MusicRecording'));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ types: ['MusicGroup', 'MusicRecording'] });
      fireEvent.click(screen.getByTestId('resource-type-MusicGroup'));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ types: [] });
      fireEvent.click(screen.getByTestId('resource-type-all'));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ types: [] });
    });

    it('takes no more types than one search takes', () => {
      const types = Array.from({ length: 11 }, (_, index) => `Type${index}`);
      mocks.query.mockReturnValue(
        queryResult(`kind=more&type=${types.slice(0, 10).join(',')}`, {
          typeFacets: types.map((type) => facet(type, ['CreativeWork'], 1)),
        }),
      );
      render(<SearchResourceFilters />);

      const last = screen.getByTestId('resource-type-Type10');
      expect(last).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(last);
      expect(mocks.setFilters).not.toHaveBeenCalled();
    });

    it('offers All types under More kinds however many types it holds, picked by default', () => {
      const typeFacets = Array.from({ length: 30 }, (_, index) => facet(`Type${index}`, ['CreativeWork'], 30 - index));
      mocks.query.mockReturnValue(queryResult('kind=more', { typeFacets }));
      const { unmount } = render(<SearchResourceFilters />);
      expect(screen.getByTestId('resource-type-all')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Type0, 30 links' })).toBeInTheDocument();
      unmount();

      mocks.query.mockReturnValue(queryResult('kind=more&type=Type0', { typeFacets }));
      render(<SearchResourceFilters />);
      expect(screen.getByTestId('resource-type-all')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('resource-type-Type0')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByTestId('resource-type-all'));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ types: [] });
    });

    it('keeps a custom feed’s saved sub-kinds offered when the search finds none of them, or its types failed', () => {
      const feed = { tags: ['music'], reach: 'all', sort: 'recent', subKinds: ['MusicAlbum'] };
      const songs = [facet('MusicRecording', ['CreativeWork'], 70)];
      mocks.query.mockReturnValue(queryResult('kind=music&type=MusicAlbum', { typeFacets: songs }));
      const { unmount } = render(<SearchResourceFilters feed={feed} />);
      expect(rows()).toEqual(['All types', 'Songs, 70 links', 'Albums, 0 links *']);
      unmount();

      // The kinds failed: the saved sub-kind is still the Type that filters the list
      mocks.query.mockReturnValue(queryResult('kind=music&type=MusicAlbum', { typeFacets: null }));
      const { unmount: unmountFailed } = render(<SearchResourceFilters feed={feed} />);
      expect(rows()).toEqual(['All types', 'Albums, 0 links *']);
      unmountFailed();

      // Unticked, it can be picked again
      mocks.query.mockReturnValue(queryResult('kind=music', { typeFacets: songs }));
      const { unmount: unmountCleared } = render(<SearchResourceFilters feed={feed} />);
      expect(rows()).toEqual(['All types *', 'Songs, 70 links', 'Albums, 0 links']);
      fireEvent.click(screen.getByTestId('resource-type-MusicAlbum'));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ types: ['MusicAlbum'] });
      unmountCleared();

      // Not under another kind
      mocks.query.mockReturnValue(queryResult('kind=event', { typeFacets: null }));
      render(<SearchResourceFilters feed={feed} />);
      expect(screen.queryByTestId('filter-resource-type')).not.toBeInTheDocument();
    });

    it('shows the types picked on a custom feed of sub-kinds under any kind, though the search finds none', () => {
      const feed = { tags: ['music'], reach: 'all', sort: 'recent', subKinds: ['MusicAlbum'] };
      mocks.query.mockReturnValue(queryResult('kind=event&type=MusicEvent', { typeFacets: null }));
      render(<SearchResourceFilters feed={feed} />);
      expect(rows()).toEqual(['All types', 'Concerts, 0 links *']);
    });

    it('offers only the types the search finds on Search and Home', () => {
      mocks.query.mockReturnValue(
        queryResult('kind=music&type=MusicAlbum', { typeFacets: [facet('MusicRecording', ['CreativeWork'], 70)] }),
      );
      const { unmount } = render(<SearchResourceFilters />);
      expect(rows()).toEqual(['All types', 'Songs, 70 links']);
      unmount();

      render(<SearchResourceFilters feed={{ tags: ['music'], reach: 'all', sort: 'recent' }} />);
      expect(rows()).toEqual(['All types', 'Songs, 70 links']);
    });

    it('offers All types under More kinds with its types', () => {
      mocks.query.mockReturnValue(queryResult('kind=more'));
      render(<SearchResourceFilters />);
      expect(screen.getByTestId('resource-type-all')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Web pages, 140 links' })).toBeInTheDocument();
    });
  });

  it('lists one row per thing by default, or every link', () => {
    render(<SearchResourceFilters />);
    expect(radios('filter-resource-rows-radiogroup')).toEqual(['One per thing *', 'Every link']);
    fireEvent.click(screen.getByRole('radio', { name: 'Every link' }));
    expect(mocks.setFilters).toHaveBeenLastCalledWith({ collapse: false });
  });

  describe("a kind's own sections", () => {
    it('offers Events When and Where, writes a range into the URL and opens the dates for Dates', () => {
      mocks.query.mockReturnValue(queryResult('kind=event', { sections: ['when', 'where'] }));
      const { rerender } = render(<SearchResourceFilters />);

      expect(radios('filter-resource-when-radiogroup')).toEqual([
        'Upcoming *',
        'Today',
        'This weekend',
        'This week',
        'This month',
        'Past',
        'Dates',
      ]);
      expect(radios('filter-resource-where-radiogroup')).toEqual(['Anywhere *', 'Near me', 'Near a place']);
      // Nothing to read services or categories from: no extra read
      expect(mocks.results).toHaveBeenLastCalledWith(null, { facets: true });
      fireEvent.click(screen.getByRole('radio', { name: 'This week' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ when: 'week', dateFrom: null, dateTo: null });

      mocks.query.mockReturnValue(
        queryResult('kind=event&when=dates&from=2026-11-20', { sections: ['when', 'where'] }),
      );
      rerender(<SearchResourceFilters />);
      fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-11-22' } });
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ dateTo: '2026-11-22' });
      expect(screen.getByLabelText('First day')).toHaveValue('2026-11-20');
    });

    it('finds a place by name for Where, then offers the distance', () => {
      mocks.query.mockReturnValue(queryResult('kind=place', { sections: ['where', 'category'] }));
      const { rerender } = render(<SearchResourceFilters />);

      fireEvent.click(screen.getByRole('radio', { name: 'Near a place' }));
      fireEvent.change(screen.getByLabelText('Find a place'), { target: { value: 'zur' } });
      fireEvent.click(screen.getByRole('button', { name: 'Zürich' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ near: { lat: 47.37444, lon: 8.54111 }, place: 'Zürich' });

      mocks.query.mockReturnValue(
        queryResult('kind=place&near=47.37444,8.54111&place=Z%C3%BCrich', { sections: ['where', 'category'] }),
      );
      rerender(<SearchResourceFilters />);
      expect(radios('filter-resource-where-radiogroup')).toContain('Near a place *');
      expect(radios('filter-resource-radius-radiogroup')).toEqual([
        'Within 2 km',
        'Within 10 km *',
        'Within 50 km',
        'Within 200 km',
      ]);
      fireEvent.click(screen.getByRole('radio', { name: 'Within 50 km' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ radius: 50 });
      // The picked place is the panel's own removable row, not a tag chip
      expect(screen.getByTestId('search-resource-place')).toHaveAttribute('data-slot', 'filter-item');
      expect(screen.queryByTestId('post-tag')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Remove Zürich' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ near: null, place: null, radius: null });
    });

    it("asks for the viewer's location only on Near me, kept to about a kilometre", () => {
      const getCurrentPosition = vi.fn((done: PositionCallback) =>
        done({ coords: { latitude: 47.376877, longitude: 8.538444 } } as GeolocationPosition),
      );
      Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
      mocks.query.mockReturnValue(queryResult('kind=place', { sections: ['where', 'category'] }));
      render(<SearchResourceFilters />);

      expect(getCurrentPosition).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('radio', { name: 'Near me' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ near: { lat: 47.38, lon: 8.54 }, place: null });
    });

    it("lists the result's categories and services with their links, the picked one kept", () => {
      mocks.results.mockReturnValue({
        hostFacets: [{ host: 'open.spotify.com', site: 'Spotify', count: 12 }],
        categoryFacets: [
          { category: 'amenity/cafe', count: 2 },
          { category: 'amenity/place_of_worship', count: 2 },
        ],
      });
      const query: TResourceQuery = {
        input: { kind: 'all' },
        sort: 'activity',
        reach: 'all',
        viewer: null,
        collapse: true,
      };
      mocks.query.mockReturnValue(
        queryResult('kind=place&category=leisure/park', { sections: ['where', 'category'], query }),
      );
      const { rerender } = render(<SearchResourceFilters />);
      // The categories are counted by the tab's own read; no service read for Places
      expect(mocks.results).toHaveBeenCalledWith(query, { facets: true });
      expect(mocks.results).toHaveBeenLastCalledWith(null, { facets: true });
      expect(radios('filter-resource-category-radiogroup')).toEqual([
        'Any category',
        'Cafe, 2',
        'Place of worship, 2',
        'Park, 0 *',
      ]);
      fireEvent.click(screen.getByRole('radio', { name: 'Any category' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ category: null });

      mocks.query.mockReturnValue(queryResult('kind=music', { sections: ['service', 'identifier'], query }));
      rerender(<SearchResourceFilters />);
      // With none picked the services are read with the tab's very query (one key, one request)
      expect(JSON.stringify(mocks.results.mock.lastCall)).toBe(JSON.stringify([query, { facets: true }]));
      expect(screen.getByTestId('resource-service-any')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Spotify, 12 links' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ hosts: ['open.spotify.com'] });
    });

    it('turns services on and off as the Type rows do, each keeping its count from the search without them', () => {
      mocks.results.mockReturnValue({
        hostFacets: [
          { host: 'musicbrainz.org', site: 'MusicBrainz', count: 32 },
          { host: 'open.spotify.com', site: 'Spotify', count: 12 },
          { host: 'www.deezer.com', site: 'Deezer', count: 10 },
        ],
        categoryFacets: null,
      });
      const base: TResourceQuery = {
        input: { kind: 'all' },
        sort: 'activity',
        reach: 'all',
        viewer: null,
        collapse: true,
      };
      const query: TResourceQuery = { ...base, hosts: ['open.spotify.com', 'www.deezer.com'] };
      mocks.query.mockReturnValue(
        queryResult('kind=music&service=open.spotify.com,www.deezer.com', {
          sections: ['service', 'identifier'],
          query,
        }),
      );
      render(<SearchResourceFilters />);

      // The services are read from the same search without the picked ones; no category read
      expect(mocks.results).toHaveBeenCalledWith(base, { facets: true });
      expect(mocks.results).toHaveBeenCalledWith(null, { facets: true });
      expect(mocks.results).not.toHaveBeenCalledWith(query, expect.anything());
      const pressed = (id: string) => screen.getByTestId(id).getAttribute('aria-pressed');
      expect(pressed('resource-service-any')).toBe('false');
      expect(pressed('resource-service-musicbrainz.org')).toBe('false');
      expect(pressed('resource-service-open.spotify.com')).toBe('true');
      expect(pressed('resource-service-www.deezer.com')).toBe('true');
      expect(screen.getByTestId('resource-service-www.deezer.com')).toHaveTextContent('Deezer10');
      expect(
        within(screen.getByTestId('resource-service-open.spotify.com')).getByTestId('filter-item-check'),
      ).toBeInTheDocument();
      expect(within(screen.getByTestId('filter-resource-service')).queryByTestId('post-tag')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('resource-service-open.spotify.com'));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ hosts: ['www.deezer.com'] });
      fireEvent.click(screen.getByTestId('resource-service-musicbrainz.org'));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({
        hosts: ['open.spotify.com', 'www.deezer.com', 'musicbrainz.org'],
      });
      fireEvent.click(screen.getByTestId('resource-service-any'));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ hosts: [] });
    });

    it('lists a service on several hosts once, with its own icon, and turns all its hosts on and off', () => {
      mocks.results.mockReturnValue({
        hostFacets: [
          { host: 'open.spotify.com', site: 'Spotify', count: 12 },
          { host: 'music.amazon.co.uk', site: 'Amazon Music', count: 1 },
          { host: 'music.amazon.com', site: 'Amazon Music', count: 1 },
        ],
        categoryFacets: null,
      });
      mocks.query.mockReturnValue(queryResult('kind=music', { sections: ['service'] }));
      const { unmount } = render(<SearchResourceFilters />);

      const section = screen.getByTestId('filter-resource-service');
      expect(within(section).getAllByText('Amazon Music')).toHaveLength(1);
      const amazon = screen.getByRole('button', { name: 'Amazon Music, 2 links' });
      // The service's own icon, as the cards show it (Amazon Music's names its own address)
      expect(within(amazon).getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        expect.stringContaining('media-amazon.com'),
      );
      expect(
        within(screen.getByTestId('resource-service-open.spotify.com')).getByTestId('resource-source-favicon'),
      ).toHaveAttribute('src', 'https://open.spotify.com/favicon.ico');
      fireEvent.click(amazon);
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ hosts: ['music.amazon.co.uk', 'music.amazon.com'] });
      unmount();

      // One of its hosts on (a link shared before): the row is on, and turns both off
      const query: TResourceQuery = {
        input: { kind: 'all' },
        sort: 'activity',
        reach: 'all',
        viewer: null,
        collapse: true,
        hosts: ['music.amazon.com', 'open.spotify.com'],
      };
      mocks.query.mockReturnValue(
        queryResult('kind=music&service=music.amazon.com,open.spotify.com', { sections: ['service'], query }),
      );
      render(<SearchResourceFilters />);
      expect(screen.getByRole('button', { name: 'Amazon Music, 2 links' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Amazon Music, 2 links' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ hosts: ['open.spotify.com'] });
    });

    it('waits for the services read before naming the picked ones', () => {
      mocks.results.mockReturnValue({ hostFacets: null, categoryFacets: null, loading: true });
      mocks.query.mockReturnValue(
        queryResult('kind=music&service=music.amazon.com,open.spotify.com', { sections: ['service'] }),
      );
      render(<SearchResourceFilters />);

      expect(
        within(screen.getByTestId('filter-resource-service')).queryByText(/amazon|spotify/),
      ).not.toBeInTheDocument();
      expect(screen.getAllByTestId('resource-service-name-skeleton')).toHaveLength(2);
    });

    it('waits for the search’s types too, before its services are read at all', () => {
      mocks.results.mockReturnValue({ hostFacets: null, categoryFacets: null, loading: false });
      mocks.query.mockReturnValue(
        queryResult('kind=music&type=MusicAlbum&service=music.amazon.com', { sections: ['service'], isPending: true }),
      );
      render(<SearchResourceFilters />);

      expect(within(screen.getByTestId('filter-resource-service')).queryByText(/amazon/)).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-service-name-skeleton')).toBeInTheDocument();
    });

    it('takes as many of a service’s hosts as fit', () => {
      mocks.results.mockReturnValue({
        hostFacets: [
          { host: 'music.amazon.co.uk', site: 'Amazon Music', count: 1 },
          { host: 'music.amazon.com', site: 'Amazon Music', count: 1 },
        ],
        categoryFacets: null,
      });
      const hosts = Array.from({ length: 9 }, (_, i) => `h${i}.example.com`);
      mocks.query.mockReturnValue(
        queryResult(`kind=music&service=${hosts.join(',')}`, {
          sections: ['service'],
          query: { input: { kind: 'all' }, sort: 'activity', reach: 'all', viewer: null, collapse: true, hosts },
        }),
      );
      render(<SearchResourceFilters />);

      const amazon = screen.getByRole('button', { name: 'Amazon Music, 2 links' });
      expect(amazon).not.toHaveAttribute('aria-disabled');
      fireEvent.click(amazon);
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ hosts: [...hosts, 'music.amazon.co.uk'] });
    });

    it('keeps a picked service the search does not list, and takes no eleventh', () => {
      mocks.results.mockReturnValue({
        hostFacets: [{ host: 'open.spotify.com', site: 'Spotify', count: 12 }],
        categoryFacets: null,
      });
      const hosts = Array.from({ length: 10 }, (_, i) => `h${i}.example.com`);
      mocks.query.mockReturnValue(
        queryResult(`kind=music&service=${hosts.join(',')}`, {
          sections: ['service'],
          query: { input: { kind: 'all' }, sort: 'activity', reach: 'all', viewer: null, collapse: true, hosts },
        }),
      );
      render(<SearchResourceFilters />);

      expect(screen.getByTestId('resource-service-h9.example.com')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('resource-service-h9.example.com')).toHaveTextContent('h9.example.com0');
      const spotify = screen.getByTestId('resource-service-open.spotify.com');
      expect(spotify).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(spotify);
      expect(mocks.setFilters).not.toHaveBeenCalled();
    });

    it('takes an identifier the kind reads, and says when it is none', () => {
      mocks.query.mockReturnValue(queryResult('kind=book', { sections: ['identifier'] }));
      render(<SearchResourceFilters />);

      const box = screen.getByLabelText('Identifier: ISBN');
      fireEvent.change(box, { target: { value: 'USQX91300108' } });
      fireEvent.submit(box);
      expect(mocks.setFilters).not.toHaveBeenCalled();
      expect(box).toHaveAccessibleDescription('Not a valid ISBN.');
      expect(box).toHaveAttribute('aria-invalid', 'true');
      fireEvent.change(box, { target: { value: '978-0-262-03384-8' } });
      fireEvent.submit(box);
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ key: 'isbn:9780262033848' });
    });

    it('shows a picked identifier as the panel’s removable row', () => {
      mocks.query.mockReturnValue(queryResult('kind=book&id=isbn:9780262033848', { sections: ['identifier'] }));
      render(<SearchResourceFilters />);

      const row = screen.getByRole('button', { name: 'Remove isbn:9780262033848' });
      expect(row).toHaveAttribute('data-slot', 'filter-item');
      expect(row).toHaveAttribute('data-testid', 'search-resource-identifier');
      fireEvent.click(row);
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ key: null });
    });

    it('offers Jobs Remote and closed postings, and up to 3 recipe ingredients', () => {
      mocks.query.mockReturnValue(queryResult('kind=job&remote=yes', { sections: ['jobs'] }));
      const { rerender } = render(<SearchResourceFilters />);
      expect(radios('filter-resource-remote-radiogroup')).toEqual(['Any', 'Remote *', 'On site']);
      fireEvent.click(screen.getByRole('radio', { name: 'Include closed' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ closed: true });

      mocks.query.mockReturnValue(queryResult('kind=recipe&ingredient=flour', { sections: ['ingredients'] }));
      rerender(<SearchResourceFilters />);
      const box = screen.getByLabelText('Add an ingredient');
      fireEvent.change(box, { target: { value: '  Olive   Oil ' } });
      fireEvent.submit(box);
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ ingredients: ['flour', 'olive oil'] });
      expect(screen.getByRole('button', { name: 'Remove flour' })).toHaveAttribute('data-slot', 'filter-item');
      fireEvent.click(screen.getByRole('button', { name: 'Remove flour' }));
      expect(mocks.setFilters).toHaveBeenLastCalledWith({ ingredients: [] });
    });
  });
});
