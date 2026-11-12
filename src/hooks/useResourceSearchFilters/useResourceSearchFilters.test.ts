import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCustomResourceFeedStore } from '@/stores/customResourceFeed/customResourceFeed.store';
import {
  clearResourceSearchFilters,
  getResourceSearchUrl,
  hasResourceSearchFilters,
  isResourceFiltersSearch,
  parseResourceSearchFilters,
  pickResourceKind,
  useResourceSearchFilters,
  writeResourceSearchFilters,
} from './useResourceSearchFilters';

const PK = 'hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y';
const COLLECTION = `pubky://${PK}/pub/social/v1/posts/0035ZRTMYFEZ2`;

/** The kind-only filters at their defaults. */
const NO_KIND_FILTERS = {
  when: null,
  dateFrom: null,
  dateTo: null,
  near: null,
  place: null,
  radius: null,
  category: null,
  hosts: [],
  key: null,
  remote: null,
  closed: false,
  ingredients: [],
};

const mocks = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.params }));

describe('parseResourceSearchFilters', () => {
  it('reads every filter the URL spells', () => {
    const params = new URLSearchParams({
      tags: 'music',
      kind: 'music',
      type: 'MusicRecording,MusicAlbum',
      sort: 'trending',
      window: '24h',
      match: 'all',
      rows: 'links',
      by: `pubky${PK}`,
      in: COLLECTION,
      and: 'Track,artist',
    });
    expect(parseResourceSearchFilters(params)).toEqual({
      kind: 'music',
      types: ['MusicRecording', 'MusicAlbum'],
      sort: 'trending',
      window: '24h',
      match: 'all',
      collapse: false,
      author: PK,
      inCollection: COLLECTION,
      narrowTags: ['track', 'artist'],
      ...NO_KIND_FILTERS,
    });
  });

  it('reads a plain search as no filter, and More kinds as a kind', () => {
    expect(parseResourceSearchFilters(new URLSearchParams('tags=music'))).toEqual({
      kind: null,
      types: [],
      sort: null,
      window: '7d',
      match: 'any',
      collapse: true,
      author: null,
      inCollection: null,
      narrowTags: [],
      ...NO_KIND_FILTERS,
    });
    expect(parseResourceSearchFilters(null).kind).toBeNull();
    expect(parseResourceSearchFilters(new URLSearchParams('kind=more')).kind).toBe('more');
  });

  it('drops what Pinakes would refuse or what names nothing known', () => {
    const many = Array.from({ length: 12 }, (_, i) => `Type${i}`).join(',');
    const filters = parseResourceSearchFilters(
      new URLSearchParams({
        kind: 'spaceships',
        type: `${many},bad type,lower`,
        sort: 'start',
        window: '90d',
        by: 'not-a-key',
        in: 'https://example.com/list',
        and: 'a,b,c',
      }),
    );
    expect(filters).toMatchObject({
      kind: null,
      sort: null,
      window: '7d',
      author: null,
      inCollection: null,
      narrowTags: ['a', 'b'],
    });
    expect(filters.types).toHaveLength(10);
    for (const uri of [
      'pubky://',
      `pubky://${PK}`,
      'pubky://short/pub/social/v1/posts/1',
      `pubky://${PK}/pub/social/v1/tags/1`,
    ]) {
      expect(parseResourceSearchFilters(new URLSearchParams({ in: uri })).inCollection).toBeNull();
    }
    expect(filters.types.every((type) => /^Type\d+$/.test(type))).toBe(true);
  });

  it('spells Popular as popular', () => {
    expect(parseResourceSearchFilters(new URLSearchParams('sort=popular')).sort).toBe('activity');
    expect(parseResourceSearchFilters(new URLSearchParams('sort=activity')).sort).toBeNull();
  });
});

describe('writeResourceSearchFilters', () => {
  it('writes the filters and leaves defaults out, keeping the search itself', () => {
    const params = new URLSearchParams('q=daft+punk&kind=music&type=MusicGroup');
    const written = writeResourceSearchFilters(params, {
      kind: 'event',
      types: [],
      sort: 'activity',
      window: '7d',
      match: 'any',
      collapse: false,
      author: PK,
      narrowTags: [],
    });
    expect(written.toString()).toBe(`q=daft+punk&kind=event&sort=popular&rows=links&by=${PK}`);
    expect(
      writeResourceSearchFilters(written, { kind: null, sort: null, collapse: true, author: null }).toString(),
    ).toBe('q=daft+punk');
    // The input is not changed
    expect(params.toString()).toBe('q=daft+punk&kind=music&type=MusicGroup');
  });

  it('round-trips through the parser', () => {
    const written = writeResourceSearchFilters(new URLSearchParams('tags=music,track'), {
      types: ['MusicRecording'],
      sort: 'trending',
      window: '30d',
      match: 'all',
      inCollection: COLLECTION,
    });
    expect(parseResourceSearchFilters(written)).toMatchObject({
      types: ['MusicRecording'],
      sort: 'trending',
      window: '30d',
      match: 'all',
      inCollection: COLLECTION,
    });
  });

  it('says whether a URL has filters, and clears them all', () => {
    const params = new URLSearchParams('tags=music&kind=music&rows=links');
    expect(hasResourceSearchFilters(params)).toBe(true);
    expect(hasResourceSearchFilters(new URLSearchParams('tags=music'))).toBe(false);
    // A filter read as not set does not open the tab
    expect(hasResourceSearchFilters(new URLSearchParams('q=daft&kind=unknown&in=nope'))).toBe(false);
    expect(hasResourceSearchFilters(new URLSearchParams('q=daft&sort=popular'))).toBe(true);
    expect(clearResourceSearchFilters(params).toString()).toBe('tags=music');
  });

  it('keeps the parameters `keepEmpty` names as empty at their default, and writes a value over one', () => {
    const params = new URLSearchParams('tags=concert&kind=event&when=month&near=47.37%2C8.54&sort=recent');
    const keepEmpty = ['kind', 'when', 'near'];
    const cleared = writeResourceSearchFilters(params, { when: 'upcoming', sort: null }, { keepEmpty });
    expect(cleared.toString()).toBe('tags=concert&kind=event&when=&near=47.37%2C8.54');
    expect(writeResourceSearchFilters(cleared, { when: 'today' }, { keepEmpty }).get('when')).toBe('today');
    // A named parameter not in the patch is left as it is
    expect(writeResourceSearchFilters(cleared, { collapse: false }, { keepEmpty }).get('near')).toBe('47.37,8.54');
    expect(clearResourceSearchFilters(params, { keepEmpty }).toString()).toBe('tags=concert&kind=&when=&near=');
  });

  it('reads every empty parameter as its default', () => {
    const names = [
      'kind',
      'type',
      'sort',
      'window',
      'match',
      'rows',
      'by',
      'in',
      'and',
      'when',
      'from',
      'to',
      'near',
      'place',
      'radius',
      'category',
      'service',
      'id',
      'remote',
      'closed',
      'ingredient',
    ];
    const params = new URLSearchParams(names.map((name) => [name, '']));
    expect(parseResourceSearchFilters(params)).toEqual(parseResourceSearchFilters(null));
    expect(hasResourceSearchFilters(params)).toBe(false);
    // Empty days with When = Dates read as no day picked
    expect(parseResourceSearchFilters(new URLSearchParams('when=dates&from=&to='))).toMatchObject({
      when: 'dates',
      dateFrom: null,
      dateTo: null,
    });
  });
});

describe('useResourceSearchFilters', () => {
  let replace: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    window.history.replaceState(null, '', '/search?tags=music&kind=music');
    mocks.params = new URLSearchParams('tags=music&kind=music');
    replace = vi.spyOn(window.history, 'replaceState');
  });
  afterEach(() => replace.mockRestore());

  it('reads the URL and replaces the history entry with each change', () => {
    const { result } = renderHook(() => useResourceSearchFilters());
    expect(result.current.filters.kind).toBe('music');
    expect(result.current.hasFilters).toBe(true);

    result.current.setFilters({ types: ['MusicGroup'] });
    // A null state: Next adds its own and keeps useSearchParams in step
    expect(replace).toHaveBeenLastCalledWith(null, '', '/search?tags=music&kind=music&type=MusicGroup');
    // Two changes in one event both stay: each starts from the live URL
    result.current.setFilters({ sort: 'recent' });
    expect(window.location.search).toBe('?tags=music&kind=music&type=MusicGroup&sort=recent');

    result.current.clearFilters();
    expect(window.location.search).toBe('?tags=music');
  });

  it('keeps the filters an open custom feed saved as empty once cleared, and deletes the others', () => {
    window.history.replaceState(null, '', '/feed/feed-1?kind=event&when=month&sort=recent');
    useCustomResourceFeedStore.getState().ready('feed-1', ['kind', 'when']);
    const { result } = renderHook(() => useResourceSearchFilters());

    result.current.setFilters({ when: 'upcoming', sort: null });
    expect(window.location.search).toBe('?kind=event&when=');
    result.current.clearFilters();
    expect(window.location.search).toBe('?kind=&when=');

    // Leaving the feed's page: Search and Home delete a filter at its default
    useCustomResourceFeedStore.getState().reset();
    window.history.replaceState(null, '', '/search?tags=music&kind=event&when=month');
    result.current.setFilters({ when: 'upcoming' });
    expect(window.location.search).toBe('?tags=music&kind=event');
    result.current.clearFilters();
    expect(window.location.search).toBe('?tags=music');
  });
});

describe('the kind-only filters', () => {
  it('reads them from the URL', () => {
    const params = new URLSearchParams({
      kind: 'event',
      when: 'dates',
      from: '2026-11-20',
      to: '2026-11-22',
      near: '47.374444444,8.541111',
      place: 'Zürich',
      radius: '50',
      category: 'amenity/cafe',
      service: 'Open.Spotify.com, www.deezer.com,open.spotify.com,not a host',
      id: 'isrc:USQX91300108',
      remote: 'yes',
      closed: '1',
      ingredient: 'Flour, olive oil,flour,eggs,salt',
    });
    expect(parseResourceSearchFilters(params)).toMatchObject({
      when: 'dates',
      dateFrom: '2026-11-20',
      dateTo: '2026-11-22',
      near: { lat: 47.37444, lon: 8.54111 },
      place: 'Zürich',
      radius: 50,
      category: 'amenity/cafe',
      hosts: ['open.spotify.com', 'www.deezer.com'],
      key: 'isrc:USQX91300108',
      remote: 'yes',
      closed: true,
      ingredients: ['flour', 'olive oil', 'eggs'],
    });
  });

  it('drops what Pinakes would refuse, and what has no meaning alone', () => {
    const filters = parseResourceSearchFilters(
      new URLSearchParams({
        when: 'soon',
        from: '2026-13-40',
        near: '95,8',
        place: 'Nowhere',
        radius: '3',
        category: ' spaces',
        service: 'not a host',
        id: 'isbn:978-0-262-03384-8',
        remote: 'maybe',
        closed: 'true',
        ingredient: 'flour;drop',
      }),
    );
    expect(filters).toMatchObject(NO_KIND_FILTERS);
    // Days only with Dates, a place name and a distance only with a point, the default distance left out
    expect(parseResourceSearchFilters(new URLSearchParams('from=2026-11-20&place=Zürich&radius=50'))).toMatchObject({
      dateFrom: null,
      place: null,
      radius: null,
    });
    expect(parseResourceSearchFilters(new URLSearchParams('near=47.37,8.54&radius=10')).radius).toBeNull();
    // Days that do not exist are not rolled over
    for (const day of ['2026-02-31', '2026-13-01', '2026-04-31']) {
      expect(parseResourceSearchFilters(new URLSearchParams({ when: 'dates', from: day })).dateFrom).toBeNull();
    }
    expect(parseResourceSearchFilters(new URLSearchParams('when=dates&from=2028-02-29')).dateFrom).toBe('2028-02-29');
    expect(hasResourceSearchFilters(new URLSearchParams('when=upcoming'))).toBe(false);
    expect(hasResourceSearchFilters(new URLSearchParams('when=past'))).toBe(true);
  });

  it('keeps any whole distance the specs take (1 to 200 km), not only the panel’s, and writes it back', () => {
    const read = (radius: string) =>
      parseResourceSearchFilters(new URLSearchParams({ near: '47.37,8.54', radius })).radius;
    // Another client's 25 km, and the specs' bounds
    expect(read('25')).toBe(25);
    expect(read('1')).toBe(1);
    expect(read('200')).toBe(200);
    for (const refused of ['0', '201', '2.5', '-5', 'x', '']) expect(read(refused)).toBeNull();

    const written = writeResourceSearchFilters(new URLSearchParams('near=47.37,8.54'), { radius: 25 });
    expect(written.get('radius')).toBe('25');
    expect(parseResourceSearchFilters(written).radius).toBe(25);
  });

  it('cuts a long place name in code points, as the specs count it, never through a surrogate pair', () => {
    const read = (place: string) =>
      parseResourceSearchFilters(new URLSearchParams({ near: '47.37,8.54', place })).place;
    // 119 letters and an emoji (two UTF-16 units, one code point) are 120 code points: kept whole
    expect(read(`${'a'.repeat(119)}🏔`)).toBe(`${'a'.repeat(119)}🏔`);
    // An emoji past the 120th code point is left out whole, not cut in half
    const cut = read(`${'a'.repeat(120)}🏔`);
    expect(cut).toBe('a'.repeat(120));
    expect([...read('🏔'.repeat(121))!]).toEqual(Array(120).fill('🏔'));
  });

  it('writes them, defaults left out, and reads them back', () => {
    const written = writeResourceSearchFilters(new URLSearchParams('tags=jazz'), {
      kind: 'event',
      when: 'week',
      near: { lat: 47.374444, lon: 8.541111 },
      place: 'Zürich',
      radius: 10,
      hosts: ['open.spotify.com', 'www.deezer.com'],
      key: 'isbn:9780262033848',
      remote: 'no',
      closed: true,
      ingredients: ['flour', 'olive oil'],
    });
    expect(written.toString()).toBe(
      'tags=jazz&kind=event&when=week&near=47.37444%2C8.54111&place=Z%C3%BCrich&service=open.spotify.com%2Cwww.deezer.com&id=isbn%3A9780262033848&remote=no&closed=1&ingredient=flour%2Colive+oil',
    );
    expect(parseResourceSearchFilters(written)).toMatchObject({
      when: 'week',
      place: 'Zürich',
      hosts: ['open.spotify.com', 'www.deezer.com'],
      remote: 'no',
    });
    // A link shared with one service still reads
    expect(parseResourceSearchFilters(new URLSearchParams('service=open.spotify.com')).hosts).toEqual([
      'open.spotify.com',
    ]);
    // Pinakes takes 10
    const eleven = Array.from({ length: 11 }, (_, i) => `h${i}.example.com`).join(',');
    expect(parseResourceSearchFilters(new URLSearchParams({ service: eleven })).hosts).toHaveLength(10);
    expect(
      writeResourceSearchFilters(written, { when: 'upcoming', near: null, place: null, closed: false }).toString(),
    ).not.toMatch(/when=|near=|place=|closed=/);
    expect(clearResourceSearchFilters(written).toString()).toBe('tags=jazz');
  });

  it('clears the filters set for a section the new kind lacks, keeping a section both have', () => {
    const pick = (search: string, kind: string | null) =>
      pickResourceKind(parseResourceSearchFilters(new URLSearchParams(search)), kind);
    expect(pick('kind=event&when=past&near=47.37,8.54&radius=50', 'place')).toEqual({
      kind: 'place',
      types: [],
      when: null,
    });
    expect(pick('kind=place&near=47.37,8.54&place=Z&category=amenity/cafe', null)).toEqual({
      kind: null,
      types: [],
      near: null,
      place: null,
      category: null,
    });
    // Music and Videos take the same identifiers, Books another one
    expect(pick('kind=music&service=x.com&id=isrc:USQX91300108', 'video')).toEqual({ kind: 'video', types: [] });
    expect(pick('kind=music&service=x.com&id=isrc:USQX91300108', 'book')).toEqual({
      kind: 'book',
      types: [],
      hosts: [],
      key: null,
    });
    expect(pick('', 'job')).toEqual({ kind: 'job', types: [] });
    // A filter the old kind did not apply (left in the URL) does not come into effect with the new one
    expect(pick('service=open.spotify.com&remote=yes', 'music')).toEqual({
      kind: 'music',
      types: [],
      hosts: [],
      remote: null,
    });
    expect(pick('kind=book&service=open.spotify.com', 'music')).toEqual({ kind: 'music', types: [], hosts: [] });
  });
});

describe('isResourceFiltersSearch', () => {
  it('takes who shared or which collection as a search of their own, nothing else', () => {
    const read = (search: string) => isResourceFiltersSearch(parseResourceSearchFilters(new URLSearchParams(search)));
    expect(read(`by=${PK}`)).toBe(true);
    expect(read(`in=${encodeURIComponent(COLLECTION)}`)).toBe(true);
    for (const search of ['', 'kind=event', 'when=past', 'sort=recent', 'rows=links', 'closed=1']) {
      expect(read(search)).toBe(false);
    }
  });
});

describe('getResourceSearchUrl', () => {
  it('spells a search of filters alone: the links a user shared, a collection holds', () => {
    expect(getResourceSearchUrl({ author: PK })).toBe(`/search?by=${PK}`);
    expect(getResourceSearchUrl({ inCollection: COLLECTION })).toBe(`/search?in=${encodeURIComponent(COLLECTION)}`);
    expect(
      parseResourceSearchFilters(new URL(getResourceSearchUrl({ inCollection: COLLECTION }), 'https://x').searchParams)
        .inCollection,
    ).toBe(COLLECTION);
  });
});
