import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import {
  parseResourceSearchFilters,
  type TResourceSearchFilters,
} from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import type { SearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { buildResourceSearchParams, getResourceKindsTypes } from '@/pipes/resource/resource.search';
import type { TPinakesTypeFacet } from '@/services/pinakes/pinakes.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { REACH } from '@/stores/home/home.types';
import {
  canNarrowTags,
  getResourceSearchDefaultSort,
  getResourceSearchSorts,
  useSearchResourceQuery,
} from './useSearchResourceQuery';

const mocks = vi.hoisted(() => ({
  criteria: vi.fn((): SearchCriteria => ({ mode: 'tags', tags: ['music'] })),
  reach: { value: 'all' as string },
  card: vi.fn((_uri: string | null) => ({ data: undefined as { id: string } | undefined })),
  filters: { value: {} as Partial<TResourceSearchFilters> },
  kinds: vi.fn(),
}));

vi.mock('@/hooks/useSearchCriteria/useSearchCriteria', () => ({ useSearchCriteria: mocks.criteria }));
// Whether the configured Pinakes serves My network (`wot_2`); off unless a case turns it on
const reachSet = vi.hoisted(() => ({ served: false }));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesReachSetServed: () => reachSet.served,
}));
vi.mock('@/hooks/useSearchReach/useSearchReach', () => ({ useSearchReach: () => ({ reach: mocks.reach.value }) }));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: mocks.card }));
vi.mock('@/hooks/useResourceSearch/useResourceSearch', () => ({ useResourceSearch: mocks.kinds }));
vi.mock('@/hooks/useResourceSearchFilters/useResourceSearchFilters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useResourceSearchFilters/useResourceSearchFilters')>()),
  useResourceSearchFilters: () => ({ filters: mocks.filters.value }),
}));

const facet = (type: string, path: string[], count: number): TPinakesTypeFacet => ({
  type,
  type_path: ['Thing', ...path],
  count,
});
const FACETS = [
  facet('MusicRecording', ['CreativeWork'], 70),
  facet('Event', [], 112),
  facet('Article', ['CreativeWork'], 73),
  facet('NewsArticle', ['CreativeWork', 'Article'], 11),
  facet('ScholarlyArticle', ['CreativeWork', 'Article'], 18),
  facet('Restaurant', ['Organization', 'Place', 'LocalBusiness', 'FoodEstablishment'], 16),
];
const kindsRead = (overrides: Partial<UseResourceSearchResult> = {}) => ({
  typeFacets: null,
  loading: false,
  ...overrides,
});
const withFilters = (search: string) => {
  mocks.filters.value = parseResourceSearchFilters(new URLSearchParams(search));
};
const run = (options?: Parameters<typeof useSearchResourceQuery>[0]) =>
  renderHook(() => useSearchResourceQuery(options)).result.current;

describe('useSearchResourceQuery', () => {
  beforeEach(() => {
    mocks.criteria.mockReturnValue({ mode: 'tags', tags: ['music'] });
    mocks.reach.value = REACH.ALL;
    mocks.card.mockReturnValue({ data: undefined });
    mocks.kinds.mockReturnValue(kindsRead());
    withFilters('');
    useAuthStore.setState({ currentUserPubky: null });
  });

  it('searches the tags, one row per thing, Popular by default, from everyone signed out', () => {
    mocks.reach.value = REACH.FOLLOWING;
    const current = run();

    expect(current.query).toEqual({
      input: { kind: 'tags', tags: ['music'] },
      sort: 'activity',
      reach: 'all',
      viewer: null,
      collapse: true,
    });
    expect(current).toMatchObject({ url: null, isReachIgnored: false, isPending: false, sort: 'activity' });
    expect(current.sorts).toEqual(['activity', 'trending', 'recent']);
    // No kind picked and no kinds asked for: no extra read
    expect(mocks.kinds).toHaveBeenLastCalledWith(null, { limit: 1, facets: true });
  });

  it('applies the Search reach signed in, and narrows a tag search with every picked tag', () => {
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    mocks.reach.value = REACH.FRIENDS;
    withFilters('and=track');

    expect(run().query).toMatchObject({
      input: { kind: 'tags', tags: ['music', 'track'], match: 'all' },
      reach: 'friends',
      viewer: 'viewer',
    });
  });

  it('matches all of 2 or 3 searched tags when asked, never more', () => {
    withFilters('match=all');
    mocks.criteria.mockReturnValue({ mode: 'tags', tags: ['music', 'jazz'] });
    expect(run()).toMatchObject({ query: { input: { tags: ['music', 'jazz'], match: 'all' } }, canMatchAll: true });

    mocks.criteria.mockReturnValue({ mode: 'tags', tags: ['a', 'b', 'c', 'd'] });
    const four = run();
    expect(four.query?.input).toEqual({ kind: 'tags', tags: ['a', 'b', 'c', 'd'] });
    expect(four.canMatchAll).toBe(false);
  });

  it('searches a text as text, by relevance by default, and an identifier by key', () => {
    mocks.criteria.mockReturnValue({ mode: 'content', query: 'daft punk' });
    const text = run();
    expect(text.query).toMatchObject({ input: { kind: 'text', text: 'daft punk' }, sort: 'relevance' });
    expect(text.sorts).toEqual(['relevance', 'activity', 'trending', 'recent']);

    mocks.criteria.mockReturnValue({ mode: 'content', query: 'isbn:9780262033848' });
    expect(run().query).toMatchObject({ input: { kind: 'key', key: 'isbn:9780262033848' }, sort: 'activity' });
  });

  it('puts a searched link first and lists what is related to its card once read, with no order to pick', () => {
    const url = 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq';
    mocks.criteria.mockReturnValue({ mode: 'resource', query: url, input: { kind: 'url', url } });

    const { result, rerender } = renderHook(() => useSearchResourceQuery());
    expect(mocks.card).toHaveBeenLastCalledWith(url);
    expect(result.current).toMatchObject({ query: null, url, isPending: false, sorts: [] });

    mocks.card.mockReturnValue({ data: { id: 'card1' } });
    rerender();
    expect(result.current.query?.input).toEqual({ kind: 'related', id: 'card1' });
  });

  it.each(['https://user:secret@open.spotify.com/track/1', 'https://user@open.spotify.com/track/1'])(
    'never sends %s, a link with credentials: no card read, nothing related, no text',
    (url) => {
      mocks.card.mockReturnValue({ data: { id: 'card1' } });
      for (const criteria of [
        { mode: 'resource', query: url, input: { kind: 'url', url } },
        { mode: 'content', query: url },
      ] satisfies SearchCriteria[]) {
        mocks.criteria.mockReturnValue(criteria);
        const current = run({ withKinds: true });

        expect(mocks.card).toHaveBeenLastCalledWith(null);
        expect(current).toMatchObject({ query: null, url: null, isPending: false, sorts: [], sections: [] });
        expect(mocks.kinds).toHaveBeenLastCalledWith(null, { limit: 1, facets: true });
        expect(mocks.card.mock.calls.flat()).not.toContain(url);
      }

      // Nor in a text
      mocks.criteria.mockReturnValue({ mode: 'content', query: `listen ${url}` });
      expect(run()).toMatchObject({ query: null, url: null });
      expect(mocks.kinds).toHaveBeenLastCalledWith(null, { limit: 1, facets: true });
    },
  );

  it.each([
    'doi:10.1234/https://user:secret@example.com',
    'doi:https://user:secret@example.com',
    'doi:10.1234/https://a.org/https://user:secret@example.com',
  ])('never sends %s, an identifier holding a link with credentials, as key=', (query) => {
    mocks.criteria.mockReturnValue({ mode: 'content', query });
    expect(run({ withKinds: true })).toMatchObject({ query: null, url: null });
    expect(mocks.kinds).toHaveBeenLastCalledWith(null, { limit: 1, facets: true });
  });

  it('never reads the card of a link holding another link with credentials', () => {
    const url = 'https://example.com/?u=https://user:secret@bank.com';
    mocks.criteria.mockReturnValue({ mode: 'resource', query: url, input: { kind: 'url', url } });
    expect(run()).toMatchObject({ query: null, url: null });
    expect(mocks.card).toHaveBeenLastCalledWith(null);
  });

  it('never sends a tag holding a link with credentials, searched or narrowing', () => {
    const tag = 'https://user:secret@example.com';
    mocks.criteria.mockReturnValue({ mode: 'tags', tags: ['music', tag] });
    expect(run({ withKinds: true }).query).toBeNull();
    expect(mocks.kinds).toHaveBeenLastCalledWith(null, { limit: 1, facets: true });

    mocks.criteria.mockReturnValue({ mode: 'tags', tags: ['music'] });
    withFilters(`and=${encodeURIComponent(tag)}`);
    expect(run().query).toBeNull();
  });

  it('never sends an Identifier or a category holding a link with credentials', () => {
    const id = 'doi:10.1234/https://user:secret@example.com';
    withFilters(`kind=paper&id=${encodeURIComponent(id)}`);
    expect(mocks.filters.value.key).toBe(id);
    expect(run().query).toBeNull();

    withFilters(`kind=place&category=${encodeURIComponent('https://user:secret@example.com')}`);
    expect(run().query).toBeNull();

    // A link without credentials still goes out
    withFilters(`kind=paper&id=${encodeURIComponent('doi:10.1234/https://example.com/@user')}`);
    expect(run().query).toMatchObject({ key: 'doi:10.1234/https://example.com/@user' });
  });

  it('never sends an order the search cannot apply: Relevance needs a text, Upcoming Events', () => {
    withFilters('sort=relevance');
    expect(run().sort).toBe('activity');
    withFilters('sort=upcoming');
    expect(run().sort).toBe('activity');

    withFilters('kind=event&sort=upcoming');
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: FACETS }));
    expect(run()).toMatchObject({ sort: 'upcoming', query: { sort: 'upcoming', types: ['Event'] } });
    expect(getResourceSearchSorts({ kind: 'all' }, 'event')).toContain('upcoming');
  });

  it('sends the Trending window with Trending only, and the rows, author and collection', () => {
    withFilters(
      `sort=trending&window=30d&rows=links&by=${'a'.repeat(52)}&in=pubky://${'a'.repeat(52)}/pub/social/v1/posts/1`,
    );
    expect(run().query).toMatchObject({
      sort: 'trending',
      window: '30d',
      collapse: false,
      author: 'a'.repeat(52),
      inCollection: `pubky://${'a'.repeat(52)}/pub/social/v1/posts/1`,
    });
    withFilters('window=30d');
    expect(run().query).not.toHaveProperty('window');
  });

  it('searches a kind by its own types at once, Articles & news included (Pinakes has no exclusion)', () => {
    withFilters('kind=article');
    expect(run()).toMatchObject({ isPending: false, query: { types: ['Article'] } });
    withFilters('kind=music');
    expect(run().query?.types).toEqual(['MusicRecording', 'MusicPlaylist', 'MusicGroup']);
  });

  it('waits for the index’s types to check picked sub-kinds, and searches only those it has', () => {
    withFilters('kind=place&type=Restaurant,Unknown');
    mocks.kinds.mockReturnValue(kindsRead({ loading: true }));
    expect(run()).toMatchObject({ query: null, isPending: true });
    // The kinds read is the same search of every type, one row, in no order of its own
    expect(mocks.kinds.mock.lastCall?.[0]).toMatchObject({
      input: { kind: 'tags', tags: ['music'] },
      sort: 'recent',
      collapse: false,
    });
    expect(mocks.kinds.mock.lastCall?.[0]).not.toHaveProperty('types');
    expect(mocks.kinds.mock.lastCall?.[1]).toEqual({ limit: 1, facets: true });

    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: FACETS }));
    expect(run().query?.types).toEqual(['Restaurant']);

    // Pinakes did not answer the kinds read: picked sub-kinds are never widened nor sent as spelled
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: null, loading: false }));
    expect(run()).toMatchObject({ isPending: false, query: null, kindsFailed: true });
    // A kind alone is searched by its own types all the same
    withFilters('kind=place');
    expect(run()).toMatchObject({ kindsFailed: false, query: { types: ['Place'] } });
  });

  it('searches More kinds’ All types as every type but the kinds’, without waiting for the index’s types', () => {
    withFilters('kind=more');
    const others = Array.from({ length: 30 }, (_, i) => facet(`Other${i}`, [], 1));
    for (const read of [
      kindsRead({ typeFacets: [...FACETS, ...others] }),
      kindsRead({ typeFacets: null, loading: true }),
      kindsRead({ typeFacets: null, loading: false }),
    ]) {
      mocks.kinds.mockReturnValue(read);
      const current = run();
      expect(current).toMatchObject({ isPending: false, kindsFailed: false });
      expect(current.query?.excludeTypes).toEqual(getResourceKindsTypes());
      expect(current.query).not.toHaveProperty('types');
    }
    // Nothing waits on the kinds read for it
    expect(mocks.kinds).toHaveBeenLastCalledWith(null, { limit: 1, facets: true });
  });

  it('searches a picked More kinds type as itself, and More kinds whole when the index has none of it', () => {
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: [...FACETS, facet('WebPage', ['CreativeWork'], 3)] }));
    withFilters('kind=more&type=WebPage');
    expect(run().query).toMatchObject({ types: ['WebPage'] });
    expect(run().query).not.toHaveProperty('excludeTypes');
    withFilters('kind=more&type=Dataset');
    expect(run().query?.excludeTypes).toEqual(getResourceKindsTypes());
    // The index's types could not be read: a picked type has nothing to search, with the read's retry
    const retry = vi.fn();
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: null, loading: false, retry }));
    const failed = run();
    expect(failed).toMatchObject({ query: null, kindsFailed: true });
    failed.retryKinds();
    expect(retry).toHaveBeenCalled();
  });

  it('searches a custom feed of More kinds with the types it saved to leave out', () => {
    withFilters('kind=more');
    const feed = { tags: [], reach: REACH.ALL, sort: 'recent', excludeTypes: ['Article', 'Event'] };
    expect(run({ feed }).query).toMatchObject({ input: { kind: 'all' }, excludeTypes: ['Article', 'Event'] });
    // A feed of sub-kinds switched to More kinds with a type the index lacks: More kinds whole
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: FACETS }));
    withFilters('kind=more&type=Dataset');
    expect(
      run({ feed: { tags: [], reach: REACH.ALL, sort: 'recent', subKinds: ['MusicAlbum'] } }).query?.excludeTypes,
    ).toEqual(getResourceKindsTypes());
    // Another kind picked on its panel: that kind's types
    withFilters('kind=event');
    expect(run({ feed }).query).toMatchObject({ types: ['Event'] });
    expect(run({ feed }).query).not.toHaveProperty('excludeTypes');
  });

  it('reads the kinds once per search, whatever the order, the rows or the kind picked', () => {
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: FACETS }));
    const current = run({ withKinds: true });
    expect(current.typeFacets).toBe(FACETS);
    expect(current.query).not.toHaveProperty('types');
    const first = mocks.kinds.mock.lastCall;
    expect(first?.[1]).toEqual({ limit: 1, facets: true });
    for (const search of ['sort=trending&window=24h', 'rows=links', 'kind=music', 'kind=place&type=Restaurant']) {
      withFilters(search);
      run({ withKinds: true });
      expect(mocks.kinds.mock.lastCall).toEqual(first);
    }
  });

  it('leaves the URL filters out for the All tab’s section', () => {
    withFilters('kind=music&sort=recent&rows=links');
    const current = run({ withFilters: false });
    expect(current.query).toMatchObject({ sort: 'activity', collapse: true });
    expect(current.query).not.toHaveProperty('types');
  });

  it('allows narrowing while fewer than 3 tags match', () => {
    expect(canNarrowTags(1, 1)).toBe(true);
    expect(canNarrowTags(2, 1)).toBe(false);
  });

  it('searches My network as everyone, which Pinakes has no reach for yet, and at most 5 tags', () => {
    useAuthStore.setState({ currentUserPubky: 'viewer' });
    mocks.reach.value = REACH.NETWORK;
    mocks.criteria.mockReturnValue({ mode: 'tags', tags: ['a', 'b', 'c', 'd', 'e', 'f'] });

    const current = run();
    expect(current.query).toMatchObject({ input: { kind: 'tags', tags: ['a', 'b', 'c', 'd', 'e'] }, reach: 'all' });
    expect(current.isReachIgnored).toBe(true);
  });

  it('reads nothing without a search or a filter', () => {
    mocks.criteria.mockReturnValue({ mode: 'none' });
    withFilters('');
    expect(run()).toMatchObject({ query: null, url: null, isReachIgnored: false, isPending: false });
    expect(mocks.kinds.mock.lastCall?.[0]).toBeNull();
    // A kind alone is no search either
    withFilters('kind=music');
    expect(run().query).toBeNull();
  });

  describe("a kind's own filters", () => {
    beforeEach(() => {
      mocks.kinds.mockReturnValue(kindsRead({ typeFacets: FACETS }));
    });

    it('searches Events from now on, soonest first, and a When range from now to its end', () => {
      withFilters('kind=event');
      expect(run()).toMatchObject({
        sections: ['when', 'where'],
        sort: 'upcoming',
        defaultSort: 'upcoming',
        query: { sort: 'upcoming', types: ['Event'], from: 'now' },
      });

      withFilters('kind=event&when=today');
      const today = run().query;
      expect(today?.from).toBe('now');
      expect(new Date(today?.to ?? '').getDate()).toBe(new Date().getDate());

      // Past events: no Upcoming, Popular first, up to now
      withFilters('kind=event&when=past&sort=upcoming');
      expect(run()).toMatchObject({ sort: 'activity', query: { sort: 'activity', to: 'now' } });
      expect(run().sorts).not.toContain('upcoming');
      expect(run().query?.from).toBeUndefined();
    });

    it('searches around a point, Nearest first for Places, and counts their categories', () => {
      withFilters('kind=place&near=47.37,8.54&radius=50&category=amenity/cafe');
      expect(run()).toMatchObject({
        sort: 'distance',
        sorts: ['activity', 'trending', 'recent', 'distance'],
        query: {
          sort: 'distance',
          near: { lat: 47.37, lon: 8.54 },
          radiusKm: 50,
          category: 'amenity/cafe',
          extraFacets: ['category'],
        },
      });
      // Events around a point: Nearest is offered, Upcoming stays first
      withFilters('kind=event&near=47.37,8.54');
      expect(run()).toMatchObject({ sort: 'upcoming', query: { near: { lat: 47.37, lon: 8.54 } } });
      expect(run().sorts).toContain('distance');
      expect(getResourceSearchDefaultSort(['activity', 'distance'], 'event')).toBe('activity');
    });

    it('searches within a distance no option stands for (another client’s 25 km), not the default', () => {
      withFilters('kind=place&near=47.37,8.54&radius=25');
      const { query } = run();
      expect(query).toMatchObject({ near: { lat: 47.37, lon: 8.54 }, radiusKm: 25 });
      expect(query && buildResourceSearchParams(query, { limit: 20 })).toMatchObject({
        near: '47.37,8.54',
        radius: '25000',
      });
    });

    it("sends a filter only with a kind that has its section, an identifier only in the kind's namespaces", () => {
      // Picked in any order, searched sorted (as a saved feed keeps them)
      withFilters('kind=music&service=www.deezer.com,open.spotify.com&id=isrc:USQX91300108&remote=yes&near=47.37,8.54');
      const music = run().query;
      expect(music).toMatchObject({
        hosts: ['open.spotify.com', 'www.deezer.com'],
        key: 'isrc:USQX91300108',
        extraFacets: ['host'],
      });
      expect(music).not.toHaveProperty('remote');
      expect(music).not.toHaveProperty('near');

      withFilters('kind=book&id=isrc:USQX91300108');
      expect(run().query).not.toHaveProperty('key');
      withFilters('id=isbn:9780262033848&service=open.spotify.com');
      expect(run().query).not.toHaveProperty('key');
      expect(run().query).not.toHaveProperty('hosts');

      withFilters('kind=job&remote=no&closed=1');
      expect(run().query).toMatchObject({ remote: false, closed: true });
      withFilters('kind=recipe&ingredient=flour,eggs');
      expect(run().query).toMatchObject({ ingredients: ['flour', 'eggs'] });
    });

    it('takes no filter of a kind with a searched link', () => {
      mocks.criteria.mockReturnValue({ mode: 'content', query: 'https://example.com/event' });
      mocks.card.mockReturnValue({ data: { id: 'card1' } });
      withFilters('kind=event&when=past');
      const current = run();
      expect(current.sections).toEqual([]);
      expect(current.query).not.toHaveProperty('to');
    });

    it('offers no Identifier when the box searches one', () => {
      mocks.criteria.mockReturnValue({
        mode: 'resource',
        query: 'isbn:9780262033848',
        input: { kind: 'key', key: 'isbn:9780262033848' },
      });
      withFilters('kind=book&id=isbn:9780306406157');
      expect(run().sections).toEqual([]);
      withFilters('kind=music');
      expect(run().sections).toEqual(['service']);
    });
  });

  describe('filters alone', () => {
    it('searches every resource the filters narrow to, with no text or tags', () => {
      mocks.criteria.mockReturnValue({ mode: 'none' });
      withFilters('by=hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y');
      expect(run()).toMatchObject({
        isFiltersOnly: true,
        query: {
          input: { kind: 'all' },
          author: 'hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y',
          sort: 'activity',
        },
      });
      // Narrowed further by a kind and its own filters
      withFilters('by=hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y&kind=event&when=week');
      expect(run().query).toMatchObject({ input: { kind: 'all' }, types: ['Event'], sort: 'upcoming', from: 'now' });

      withFilters('');
      expect(run()).toMatchObject({ isFiltersOnly: false, query: null });
      // An order, a kind without a view of its own, or a kind's own filter without its kind, narrows
      // nothing on its own
      for (const search of [
        'kind=music',
        'when=past',
        'closed=1',
        'match=all',
        'rows=links',
        'service=open.spotify.com',
      ]) {
        withFilters(search);
        expect(run()).toMatchObject({ isFiltersOnly: false, query: null });
      }
      // The All tab's section searches the box only
      withFilters('kind=event');
      expect(run({ withFilters: false })).toMatchObject({ isFiltersOnly: false, query: null });
    });

    it('lists Events alone as the coming events, soonest first, and Places alone as places', () => {
      mocks.criteria.mockReturnValue({ mode: 'none' });
      withFilters('kind=event');
      expect(run()).toMatchObject({
        isFiltersOnly: true,
        query: { input: { kind: 'all' }, types: ['Event'], sort: 'upcoming', from: 'now' },
      });
      expect(run().query).not.toHaveProperty('to');

      withFilters('kind=event&when=past');
      expect(run().query).toMatchObject({ input: { kind: 'all' }, types: ['Event'], to: 'now' });

      withFilters('kind=place');
      expect(run()).toMatchObject({
        isFiltersOnly: true,
        query: { input: { kind: 'all' }, types: ['Place'], sort: 'activity' },
      });
    });
  });
});

describe('useSearchResourceQuery with a feed', () => {
  afterEach(() => {
    reachSet.served = false;
  });
  beforeEach(() => {
    // What the box asked for is not the feed's search
    mocks.criteria.mockReturnValue({ mode: 'content', query: 'bitcoin' });
    mocks.reach.value = REACH.ALL;
    mocks.card.mockReturnValue({ data: undefined });
    mocks.kinds.mockReturnValue(kindsRead());
    withFilters('');
    useAuthStore.setState({ currentUserPubky: 'viewer' as never });
  });

  it("searches every resource in the feed's reach, its sort the order without one picked", () => {
    const current = run({ withKinds: true, feed: { tags: [], reach: REACH.FOLLOWING, sort: 'popularity' } });

    expect(current.query).toEqual({
      input: { kind: 'all' },
      sort: 'activity',
      reach: 'following',
      viewer: 'viewer',
      collapse: true,
    });
    expect(current.url).toBeNull();
    expect(current.sorts).toEqual(['activity', 'trending', 'recent']);
    expect(run({ feed: { tags: [], reach: REACH.ALL, sort: 'recent' } }).query?.sort).toBe('recent');
  });

  it("applies the URL's filters, the kind's own included, but no Shared by, In a collection or tag match", () => {
    withFilters(
      'kind=event&when=week&near=47.37,8.54&sort=trending&window=24h&rows=links&by=' + 'a'.repeat(52) + '&match=all',
    );
    const current = run({ feed: { tags: ['music', 'jazz'], reach: REACH.ALL, sort: 'recent' } });

    expect(current.query).toMatchObject({
      input: { kind: 'tags', tags: ['music', 'jazz'] },
      sort: 'trending',
      window: '24h',
      collapse: false,
      near: { lat: 47.37, lon: 8.54 },
      types: ['Event'],
    });
    expect(current.query).not.toHaveProperty('author');
    expect(current.canMatchAll).toBe(false);
    expect(current.sections).toEqual(expect.arrayContaining(['when', 'where']));
    expect(current.sorts).toEqual(expect.arrayContaining(['upcoming', 'distance']));
  });

  it('keeps Upcoming the order of events and Nearest of places around a point, whatever the feed sorts by', () => {
    withFilters('kind=event');
    expect(run({ feed: { tags: [], reach: REACH.ALL, sort: 'popularity' } }).query?.sort).toBe('upcoming');
    withFilters('kind=place&near=47.37,8.54');
    expect(run({ feed: { tags: [], reach: REACH.ALL, sort: 'recent' } }).query?.sort).toBe('distance');
  });

  it.each([
    [true, 'wot_2', false],
    [false, 'all', true],
  ])('searches a feed in My network where served (%s) as %s', (served, reach, ignored) => {
    reachSet.served = served;
    const current = run({ feed: { tags: [], reach: REACH.NETWORK, sort: 'timeline' } });

    expect(current.query).toMatchObject({ reach, viewer: 'viewer', sort: 'recent' });
    expect(current.isReachIgnored).toBe(ignored);
  });

  it('sends a custom feed’s types of several kinds while no Kind is picked, and drops them once one is', () => {
    const feed = { tags: [], reach: REACH.ALL, sort: 'recent', types: ['Event', 'MusicAlbum'] };
    expect(run({ feed }).query).toMatchObject({ input: { kind: 'all' }, types: ['Event', 'MusicAlbum'] });
    // No read of the index's types for them
    expect(mocks.kinds).toHaveBeenLastCalledWith(null, { limit: 1, facets: true });

    withFilters('kind=place');
    expect(run({ feed }).query?.types).toEqual(['Place']);
  });

  it('searches a custom feed’s saved sub-kinds as saved, without waiting for the index’s types', () => {
    const feed = { tags: [], reach: REACH.ALL, sort: 'recent', subKinds: ['MusicAlbum'] };
    withFilters('kind=music&type=MusicAlbum');
    // The index's types are still read (or failed): the feed lists what it saved all the same
    mocks.kinds.mockReturnValue(kindsRead({ loading: true }));
    expect(run({ feed })).toMatchObject({ isPending: false, query: { types: ['MusicAlbum'] } });
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: null, loading: false }));
    expect(run({ feed })).toMatchObject({ kindsFailed: false, query: { types: ['MusicAlbum'] } });
    // FACETS has no MusicAlbum: still the Albums, never the whole of Music
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: FACETS }));
    expect(run({ feed }).query?.types).toEqual(['MusicAlbum']);
    expect(mocks.kinds).toHaveBeenLastCalledWith(null, { limit: 1, facets: true });
  });

  it('never widens a custom feed’s picked sub-kinds the index has none of to the whole kind', () => {
    mocks.kinds.mockReturnValue(kindsRead({ typeFacets: FACETS }));
    withFilters('kind=music&type=MusicAlbum');
    // Picked on the panel of a feed of Playlists: the index's types decide, and none of them is listed
    const current = run({ feed: { tags: [], reach: REACH.ALL, sort: 'recent', subKinds: ['MusicPlaylist'] } });
    expect(current).toMatchObject({ query: null, isPending: false, kindsFailed: false });
    // Home's External resources and Search still fall back to the kind
    const music = ['MusicRecording', 'MusicPlaylist', 'MusicGroup'];
    expect(run({ feed: { tags: [], reach: REACH.ALL, sort: 'recent' } }).query?.types).toEqual(music);
    mocks.criteria.mockReturnValue({ mode: 'tags', tags: ['music'] });
    expect(run().query?.types).toEqual(music);
  });

  it('searches a feed from everyone signed out', () => {
    useAuthStore.setState({ currentUserPubky: null });
    const current = run({ feed: { tags: [], reach: REACH.FOLLOWING, sort: 'timeline' } });

    expect(current.query).toMatchObject({ input: { kind: 'all' }, reach: 'all', viewer: null });
  });
});
