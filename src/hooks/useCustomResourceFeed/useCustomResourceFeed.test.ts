import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickResourceKind, useResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { useSearchResourceQuery } from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { getResourceEventRange } from '@/pipes/resource/resource.search';
import { useCustomResourceFeed, useSeedCustomResourceFeed } from './useCustomResourceFeed';

// The URL Next reports: the address bar's once Next has taken a `history.replaceState` in (`reportUrl`)
const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));
const current = vi.hoisted(() => ({ feed: undefined as FeedModelSchema | undefined }));
vi.mock('@/hooks/useCustomFeed/useCustomFeed', () => ({ useCustomFeed: () => current.feed }));
// The feed's search as the list sends it to Pinakes; the index's types are not read (Pinakes failed)
vi.mock('@/hooks/useResourceSearch/useResourceSearch', () => ({
  useResourceSearch: () => ({ typeFacets: null, loading: false }),
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: () => ({ data: undefined }) }));
vi.mock('@/hooks/useSearchCriteria/useSearchCriteria', () => ({ useSearchCriteria: () => ({ mode: 'none' }) }));
vi.mock('@/hooks/useSearchReach/useSearchReach', () => ({ useSearchReach: () => ({ reach: 'all' }) }));

const FEED: FeedModelSchema = {
  id: 'feed-1',
  name: 'Zürich this week',
  tags: ['concert'],
  domain_tags: [],
  reach: 'following',
  sort: 'recent',
  content: null,
  layout: 'columns',
  target: 'resources',
  resource_types: ['Event'],
  resource_filters: { when: 'week', near: '47.37,8.54', radius: '25', place: 'Zürich Altstadt' },
  created_at: 0,
  updated_at: 0,
};
const RECIPES: FeedModelSchema = {
  ...FEED,
  id: 'feed-2',
  resource_types: ['Recipe'],
  resource_filters: { ingredients: 'crème fraîche,eggs,flour' },
};

/** Opens `path` as the page's URL, as Next reports it. */
const open = (path: string) => {
  window.history.replaceState(null, '', path);
  nav.search = window.location.search;
};
/** Next takes the address bar in, as it does a `history.replaceState`. */
const reportUrl = () => {
  nav.search = window.location.search;
};
const addressBar = () => new URLSearchParams(window.location.search);

/** The feed's page: the list seeds the URL, the panel reads whether it is ready. */
const renderPage = (feed: FeedModelSchema = FEED) =>
  renderHook(() => {
    useSeedCustomResourceFeed(feed);
    return useCustomResourceFeed();
  });

/** The feed's page as the viewer uses it: the list, the panel's filters and the search Pinakes gets. */
const renderFeedPage = (feed: FeedModelSchema = FEED) =>
  renderHook(() => {
    useSeedCustomResourceFeed(feed);
    const { feed: search, isReady } = useCustomResourceFeed();
    return {
      isReady,
      filters: useResourceSearchFilters(),
      query: useSearchResourceQuery({ feed: search ?? undefined }).query,
    };
  });

describe('useSeedCustomResourceFeed and useCustomResourceFeed', () => {
  beforeEach(() => {
    current.feed = FEED;
  });
  afterEach(() => {
    vi.useRealTimers();
    open('/');
  });

  it('opens a feed with its saved types and filters in the URL, and is ready once Next reports them', () => {
    open('/feed/feed-1');
    const { result, rerender } = renderPage();

    expect(window.location.search).toBe('?kind=event&when=week&near=47.37%2C8.54&place=Z%C3%BCrich+Altstadt&radius=25');
    // Written, but not yet the URL Next reports: nothing is searched
    rerender();
    expect(result.current.isReady).toBe(false);

    reportUrl();
    rerender();
    expect(result.current).toEqual({ feed: { tags: ['concert'], reach: 'following', sort: 'recent' }, isReady: true });
  });

  it('is ready however Next spells the URL it reports', () => {
    open('/feed/feed-1');
    const { result, rerender } = renderPage();

    nav.search = '?place=Z%C3%BCrich%20Altstadt&radius=25&near=47.37,8.54&when=week&kind=event';
    rerender();
    expect(result.current.isReady).toBe(true);
  });

  it('seeds a list of ingredients, and is ready once Next reports it', () => {
    current.feed = RECIPES;
    open('/feed/feed-2');
    const { result, rerender } = renderPage(RECIPES);

    expect(addressBar().get('kind')).toBe('recipe');
    expect(addressBar().get('ingredient')).toBe('crème fraîche,eggs,flour');
    expect(result.current.isReady).toBe(false);

    reportUrl();
    rerender();
    expect(result.current.isReady).toBe(true);
  });

  it('keeps a shared link’s filters over the saved ones', () => {
    open('/feed/feed-1?when=today&x=1');
    const { result, rerender } = renderPage();

    const params = addressBar();
    expect(params.get('when')).toBe('today');
    expect(params.get('near')).toBe('47.37,8.54');
    expect(params.get('place')).toBe('Zürich Altstadt');
    expect(params.get('x')).toBe('1');
    expect(result.current.isReady).toBe(false);

    reportUrl();
    rerender();
    expect(result.current.isReady).toBe(true);
    expect(addressBar().get('when')).toBe('today');
  });

  it('waits only for the filters, whatever else the URL repeats', () => {
    open('/feed/feed-1?x=a&x=b');
    const { result, rerender } = renderPage();
    expect(result.current.isReady).toBe(false);

    reportUrl();
    rerender();
    expect(result.current.isReady).toBe(true);
    expect(addressBar().getAll('x')).toEqual(['a', 'b']);
  });

  it('is ready at once when the URL already holds every saved filter', () => {
    open('/feed/feed-1?kind=event&when=week&near=47.37,8.54&radius=25&place=Z%C3%BCrich%20Altstadt');
    const { result } = renderPage();

    expect(result.current.isReady).toBe(true);
  });

  it('leaves the filters the viewer cleared cleared, and seeds them again when the feed opens again', () => {
    open('/feed/feed-1');
    const { result, rerender, unmount } = renderPage();
    reportUrl();
    rerender();
    expect(result.current.isReady).toBe(true);

    act(() => open('/feed/feed-1'));
    rerender();
    expect(window.location.search).toBe('');
    expect(result.current.isReady).toBe(true);

    unmount();
    renderPage();
    expect(addressBar().get('when')).toBe('week');
  });

  it('keeps a saved filter the viewer set back to its default cleared on a reload, and a value set again', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 12, 10), toFake: ['Date'] });
    open('/feed/feed-1');
    const page = renderFeedPage();
    reportUrl();
    page.rerender();
    expect(page.result.current.isReady).toBe(true);

    // When: Upcoming, the default, stays in the URL as empty
    act(() => page.result.current.filters.setFilters({ when: 'upcoming', dateFrom: null, dateTo: null }));
    expect(window.location.search).toBe('?kind=event&when=&near=47.37%2C8.54&place=Z%C3%BCrich+Altstadt&radius=25');

    // A reload (Back, a copied link) opens the same URL: the saved This week does not come back
    reportUrl();
    page.unmount();
    const reloaded = renderFeedPage();
    expect(addressBar().get('when')).toBe('');
    expect(reloaded.result.current.isReady).toBe(true);
    expect(reloaded.result.current.filters.filters.when).toBeNull();
    expect(reloaded.result.current.query).toMatchObject({ types: ['Event'], from: 'now', near: { lat: 47.37 } });
    expect(reloaded.result.current.query).not.toHaveProperty('to');

    act(() => reloaded.result.current.filters.setFilters({ when: 'today' }));
    expect(addressBar().get('when')).toBe('today');
    reportUrl();
    reloaded.unmount();
    expect(renderFeedPage().result.current.query).toMatchObject(getResourceEventRange('today', new Date()));
  });

  it('keeps All kinds after a reload when the viewer cleared the saved kind, with none of its filters', () => {
    open('/feed/feed-1');
    const page = renderFeedPage();
    reportUrl();
    page.rerender();

    const { filters, setFilters } = page.result.current.filters;
    act(() => setFilters(pickResourceKind(filters, null)));
    // The saved 25 km is cleared with the point, as the rest of Where
    const cleared = '?kind=&when=&near=&place=&radius=';
    expect(window.location.search).toBe(cleared);

    reportUrl();
    page.unmount();
    const reloaded = renderFeedPage();
    expect(window.location.search).toBe(cleared);
    expect(reloaded.result.current.isReady).toBe(true);
    expect(reloaded.result.current.filters.filters).toMatchObject({ kind: null, when: null, near: null });
    for (const name of ['types', 'from', 'to', 'near']) expect(reloaded.result.current.query).not.toHaveProperty(name);

    // Picked again, the kind replaces the empty one; its cleared filters stay cleared
    act(() => reloaded.result.current.filters.setFilters({ kind: 'event' }));
    reportUrl();
    reloaded.unmount();
    const again = renderFeedPage();
    expect(window.location.search).toBe('?kind=event&when=&near=&place=&radius=');
    expect(again.result.current.query).toMatchObject({ types: ['Event'], from: 'now' });
    expect(again.result.current.query).not.toHaveProperty('near');
  });

  it('keeps the saved filters a link of another kind left out cleared once the feed’s kind is picked again', () => {
    open('/feed/feed-1?kind=place');
    const page = renderFeedPage();
    expect(window.location.search).toBe('?kind=place&when=&near=47.37%2C8.54&place=Z%C3%BCrich+Altstadt&radius=25');
    reportUrl();
    page.rerender();

    const { filters, setFilters } = page.result.current.filters;
    act(() => setFilters(pickResourceKind(filters, 'event')));
    reportUrl();
    page.unmount();
    const reloaded = renderFeedPage();
    expect(addressBar().get('kind')).toBe('event');
    expect(addressBar().get('when')).toBe('');
    expect(reloaded.result.current.filters.filters.when).toBeNull();
  });

  it('deletes a filter at its default off a custom feed’s page (Search, Home): no empty parameter', () => {
    open('/home?kind=event&when=month');
    const { result } = renderHook(() => useResourceSearchFilters());

    act(() => result.current.setFilters({ when: 'upcoming' }));
    expect(window.location.search).toBe('?kind=event');
    act(() => result.current.setFilters(pickResourceKind(result.current.filters, null)));
    expect(window.location.search).toBe('');
  });

  it('waits for the next feed’s own filters when the page moves to another feed', () => {
    // A feed with nothing saved is ready at once, with an empty URL
    const plain: FeedModelSchema = { ...RECIPES, resource_types: null, resource_filters: null };
    current.feed = plain;
    open('/feed/feed-2');
    const { result, rerender } = renderHook(
      ({ feed }) => {
        useSeedCustomResourceFeed(feed);
        return useCustomResourceFeed();
      },
      { initialProps: { feed: plain } },
    );
    expect(result.current.isReady).toBe(true);

    current.feed = FEED;
    open('/feed/feed-1');
    rerender({ feed: FEED });
    expect(addressBar().get('place')).toBe('Zürich Altstadt');
    expect(result.current.isReady).toBe(false);

    reportUrl();
    rerender({ feed: FEED });
    expect(result.current.isReady).toBe(true);
  });

  it('waits for Next when the page mounts again over a URL it already wrote (Strict Mode)', () => {
    open('/feed/feed-1');
    const first = renderPage();
    expect(first.result.current.isReady).toBe(false);
    first.unmount();

    const { result, rerender } = renderPage();
    expect(addressBar().get('place')).toBe('Zürich Altstadt');
    expect(result.current.isReady).toBe(false);

    reportUrl();
    rerender();
    expect(result.current.isReady).toBe(true);
  });

  it('sends Pinakes the saved filters once Next reports them: this week near Zürich, as saved', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 12, 10), toFake: ['Date'] });
    const zurich: FeedModelSchema = { ...FEED, resource_filters: { ...FEED.resource_filters, radius: '50' } };
    current.feed = zurich;
    open('/feed/feed-1');
    const { result, rerender } = renderHook(() => {
      useSeedCustomResourceFeed(zurich);
      const { feed, isReady } = useCustomResourceFeed();
      return { isReady, query: useSearchResourceQuery({ feed: feed ?? undefined }).query };
    });
    expect(result.current.isReady).toBe(false);

    reportUrl();
    rerender();
    expect(result.current.isReady).toBe(true);
    expect(result.current.query).toEqual({
      input: { kind: 'tags', tags: ['concert'] },
      // Events list soonest first, whatever the feed's own sort
      sort: 'upcoming',
      reach: 'all',
      viewer: null,
      collapse: true,
      types: ['Event'],
      ...getResourceEventRange('week', new Date()),
      near: { lat: 47.37, lon: 8.54 },
      radiusKm: 50,
    });
  });

  it('sends a feed’s saved sub-kinds as saved, never the whole kind, when the index’s types are not read', () => {
    const albums: FeedModelSchema = { ...FEED, id: 'feed-3', resource_types: ['MusicAlbum'], resource_filters: null };
    current.feed = albums;
    open('/feed/feed-3');
    const { result, rerender } = renderHook(() => {
      useSeedCustomResourceFeed(albums);
      const { feed, isReady } = useCustomResourceFeed();
      return { isReady, search: useSearchResourceQuery({ feed: feed ?? undefined }) };
    });
    expect(addressBar().toString()).toBe('kind=music&type=MusicAlbum');

    reportUrl();
    rerender();
    expect(result.current.isReady).toBe(true);
    expect(result.current.search).toMatchObject({ kindsFailed: false, query: { types: ['MusicAlbum'] } });
  });

  it('opens a feed of More kinds as More kinds, and searches the types it saved to leave out', () => {
    const more: FeedModelSchema = {
      ...FEED,
      id: 'feed-4',
      resource_types: null,
      resource_filters: { exclude_types: 'Article,Event' },
    };
    current.feed = more;
    open('/feed/feed-4');
    const { result, rerender } = renderHook(() => {
      useSeedCustomResourceFeed(more);
      const { feed, isReady } = useCustomResourceFeed();
      return { isReady, feed, search: useSearchResourceQuery({ feed: feed ?? undefined }) };
    });
    expect(addressBar().toString()).toBe('kind=more');
    expect(result.current.feed).toMatchObject({ excludeTypes: ['Article', 'Event'] });

    reportUrl();
    rerender();
    expect(result.current.isReady).toBe(true);
    // Never waits on the index's types (not read here)
    expect(result.current.search).toMatchObject({ isPending: false, kindsFailed: false });
    expect(result.current.search.query).toMatchObject({ excludeTypes: ['Article', 'Event'] });
    expect(result.current.search.query).not.toHaveProperty('types');
  });

  it('is no feed search on a post feed', () => {
    current.feed = { ...FEED, target: undefined };
    const { result } = renderHook(() => useCustomResourceFeed());

    expect(result.current).toEqual({ feed: null, isReady: false });
  });
});
