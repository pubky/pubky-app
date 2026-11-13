import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TResourceQuery } from '@/pipes/resource/resource.search';
import { useAuthStore } from '@/stores/auth/auth.store';
import { ResourceController } from './resource';

const mocks = vi.hoisted(() => ({ search: vi.fn(), stream: vi.fn(), cachedFacets: vi.fn() }));

vi.mock('@/application/pinakes/pinakes', () => ({
  PinakesApplication: { searchResources: mocks.search, getCachedSearchFacets: mocks.cachedFacets },
}));
vi.mock('@/application/resource/resource', () => ({ ResourceApplication: { fetchStream: mocks.stream } }));

const card = (uri: string, refs: string[] = [uri]) => ({
  id: uri,
  uri,
  refs,
  status: 'ok',
  type_path: [],
  also_on: [],
  open_in: [],
  collections: 0,
});
const recentTags = (overrides: Partial<TResourceQuery> = {}): TResourceQuery => ({
  input: { kind: 'tags', tags: ['music'] },
  sort: 'recent',
  reach: 'all',
  viewer: null,
  collapse: true,
  ...overrides,
});
const failure = () =>
  Err.server(ServerErrorCode.SERVICE_UNAVAILABLE, 'Pinakes is down', {
    service: ErrorService.Pinakes,
    operation: 'search',
  });

describe('ResourceController.fetchSearchPage', () => {
  beforeEach(() => {
    mocks.search.mockReset();
    mocks.stream.mockReset();
    useAuthStore.setState({ currentUserPubky: 'viewer' });
  });

  it('reads the page from Pinakes, with its rows’ links, next cursor and facets rolled up', async () => {
    mocks.search.mockResolvedValue({
      items: [card('isbn:1', ['https://example.com/book']), card('https://example.com/song')],
      cursor: 'c2',
      reach_truncated: false,
      facets: {
        type: [{ type: 'Book', type_path: ['Thing', 'CreativeWork', 'Book'], count: 3 }],
        tags: [
          { label: 'music', count: 9 },
          { label: 'track', count: 4 },
        ],
      },
    });
    const query = recentTags({ sort: 'activity' });

    const page = await ResourceController.fetchSearchPage({ query, limit: 10, facets: true });

    expect(mocks.search).toHaveBeenCalledWith(query, { limit: 10, cursor: undefined, facets: true, fresh: false });
    expect(page).toEqual({
      source: 'pinakes',
      uris: ['https://example.com/book', 'https://example.com/song'],
      next: { source: 'pinakes', cursor: 'c2' },
      typeFacets: [{ type: 'Book', type_path: ['Thing', 'CreativeWork', 'Book'], count: 3 }],
      relatedTags: ['track'],
      reachTruncated: false,
    });
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('gives the rows’ own cards when asked, every one of a page: a calendar’s occurrences share one link', async () => {
    const occurrence = (uid: string) => ({
      ...card('https://example.com/feed.ics'),
      start: `2026-11-${uid}T00:00:00Z`,
      occurrence: { feed_id: 'feed', feed_uri: 'https://example.com/feed.ics', uid, status: 'scheduled' },
    });
    const items = [occurrence('15'), card('https://example.com/concert'), occurrence('18')];
    mocks.search.mockResolvedValue({ items, cursor: null, reach_truncated: false });

    const page = await ResourceController.fetchSearchPage({ query: recentTags(), limit: 10, withCards: true });

    expect(page.cards).toEqual(items);
    expect(page.uris).toHaveLength(3);
  });

  it('falls back to the resource stream for a first page the stream can answer as asked', async () => {
    mocks.search.mockRejectedValue(failure());
    mocks.stream.mockResolvedValue({ uris: ['https://example.com/a'], reachedEnd: false });

    const page = await ResourceController.fetchSearchPage({ query: recentTags(), limit: 10 });

    expect(mocks.stream).toHaveBeenCalledWith({ tags: ['music'], viewerId: 'viewer', skip: 0, limit: 10 });
    expect(page).toEqual({ source: 'nexus', uris: ['https://example.com/a'], next: { source: 'nexus', skip: 1 } });

    // and keeps paging the stream from there
    mocks.stream.mockResolvedValue({ uris: ['https://example.com/b'], reachedEnd: true });
    await expect(
      ResourceController.fetchSearchPage({ query: recentTags(), cursor: { source: 'nexus', skip: 1 }, limit: 10 }),
    ).resolves.toEqual({ source: 'nexus', uris: ['https://example.com/b'], next: null });
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Popular', recentTags({ sort: 'activity' })],
    ['a reach', recentTags({ reach: 'following', viewer: 'viewer' })],
    ['a type', recentTags({ types: ['MusicRecording'] })],
    ['a text', recentTags({ input: { kind: 'text', text: 'daft punk' } })],
  ])('keeps the failure for a query the stream cannot carry (%s), never an unfiltered list', async (_, query) => {
    mocks.search.mockRejectedValue(failure());

    await expect(ResourceController.fetchSearchPage({ query, limit: 10 })).rejects.toThrow('Pinakes is down');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('keeps the failure of a later Pinakes page', async () => {
    mocks.search.mockRejectedValue(failure());

    await expect(
      ResourceController.fetchSearchPage({
        query: recentTags(),
        cursor: { source: 'pinakes', cursor: 'c2' },
        limit: 10,
      }),
    ).rejects.toThrow('Pinakes is down');
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('ends the list when Pinakes no longer serves a later page, without the stream taking over', async () => {
    mocks.search.mockResolvedValue(null);

    await expect(
      ResourceController.fetchSearchPage({
        query: recentTags(),
        cursor: { source: 'pinakes', cursor: 'c2' },
        limit: 10,
      }),
    ).resolves.toEqual({ source: 'pinakes', uris: [], next: null });
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it('asks Pinakes past its cache when told', async () => {
    mocks.search.mockResolvedValue({ items: [], cursor: null, reach_truncated: false });
    const query = recentTags({ sort: 'activity' });

    await ResourceController.fetchSearchPage({ query, limit: 10, fresh: true });

    expect(mocks.search).toHaveBeenCalledWith(query, { limit: 10, cursor: undefined, facets: false, fresh: true });
  });

  it('without Pinakes, answers from the stream when it can and says so when it cannot', async () => {
    mocks.search.mockResolvedValue(null);
    mocks.stream.mockResolvedValue({ uris: [], reachedEnd: true });

    await expect(ResourceController.fetchSearchPage({ query: recentTags(), limit: 10 })).resolves.toMatchObject({
      source: 'nexus',
    });
    await expect(
      ResourceController.fetchSearchPage({ query: recentTags({ sort: 'trending' }), limit: 10 }),
    ).resolves.toEqual({ source: 'unavailable', uris: [], next: null });
  });
});

describe('ResourceController.getCachedHostFacets', () => {
  it('gives the services a first page already read counted, and nothing for one not read', () => {
    const query = recentTags({ hosts: ['open.spotify.com'], extraFacets: ['host'] });
    const host = [{ host: 'open.spotify.com', site: 'Spotify', count: 3 }];
    mocks.cachedFacets.mockReturnValue({ host });
    expect(ResourceController.getCachedHostFacets(query, 1)).toBe(host);
    expect(mocks.cachedFacets).toHaveBeenCalledWith(query, 1);

    mocks.cachedFacets.mockReturnValue({ type: [] });
    expect(ResourceController.getCachedHostFacets(query, 1)).toBeUndefined();
    mocks.cachedFacets.mockReturnValue(undefined);
    expect(ResourceController.getCachedHostFacets(query, 1)).toBeUndefined();
  });
});

describe('ResourceController.fetchNearbyPlaces', () => {
  const point = { lat: 47.3708689, lon: 8.5418241 };
  const place = (id: string, extra: object = {}) => ({
    ...card(`https://www.openstreetmap.org/node/${id}`),
    id,
    point: { lat: 47.37, lon: 8.54 },
    ...extra,
  });

  beforeEach(() => mocks.search.mockReset());

  it('asks for the 7 nearest places around the point and gives the links of 6, without the place itself', async () => {
    mocks.search.mockResolvedValue({
      items: ['self', 'a', 'b', 'c', 'd', 'e', 'f'].map((id) => place(id)),
      cursor: 'more',
      reach_truncated: false,
    });

    const uris = await ResourceController.fetchNearbyPlaces({ point, self: { id: 'self' } });

    const [query, options] = mocks.search.mock.calls[0];
    expect(query).toMatchObject({ types: ['Place'], sort: 'distance', near: point, radiusKm: 2, viewer: null });
    expect(options).toEqual({ limit: 7 });
    expect(uris).toEqual(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => `https://www.openstreetmap.org/node/${id}`));
  });

  it('gives each place by the link people wrote for it, and none without Pinakes', async () => {
    mocks.search.mockResolvedValue({
      items: [place('a', { uri: 'osm:node/1', refs: ['https://www.openstreetmap.org/node/1'] })],
      reach_truncated: false,
    });
    await expect(ResourceController.fetchNearbyPlaces({ point, self: { id: 'self' } })).resolves.toEqual([
      'https://www.openstreetmap.org/node/1',
    ]);

    mocks.search.mockResolvedValue(null);
    await expect(ResourceController.fetchNearbyPlaces({ point, self: { id: 'self' } })).resolves.toEqual([]);
  });
});
