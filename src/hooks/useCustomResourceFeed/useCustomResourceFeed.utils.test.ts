import { describe, expect, it } from 'vitest';
import { parseResourceSearchFilters } from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { getResourceKindsTypes, toResourceFeedTypesValue } from '@/pipes/resource/resource.search';
import {
  keepFeedResourceFilters,
  mergeFeedResourceParams,
  parseFeedResourceFilters,
  removeFeedResourceFilter,
  toFeedResourceFilters,
  toFeedResourceParams,
} from './useCustomResourceFeed.utils';

const EVENT_TYPES = ['Event'];

describe('a resources feed’s saved filters and the URL', () => {
  it('saves More kinds’ All types as every type but the kinds’, and opens it as More kinds again', () => {
    const kinds = toResourceFeedTypesValue(getResourceKindsTypes());
    const more = toFeedResourceFilters(parseResourceSearchFilters(new URLSearchParams('kind=more&rows=links')));
    expect(more).toEqual({ rows: 'links', exclude_types: kinds });
    // Stored as the specs keep it: sorted by code point, each once
    expect(kinds.split(',')).toEqual([...new Set(kinds.split(','))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    // A picked type of More kinds is the feed's type: no exclusion
    expect(toFeedResourceFilters(parseResourceSearchFilters(new URLSearchParams('kind=more&type=WebPage')))).toBeNull();
    // Every type that leaves some out reads as More kinds, whichever types it saved
    expect(toFeedResourceParams(null, { exclude_types: 'Article,Event' }).toString()).toBe('kind=more');
    expect(toFeedResourceParams([], { exclude_types: kinds, rows: 'links' }).toString()).toBe('kind=more&rows=links');
    expect(toFeedResourceFilters(parseFeedResourceFilters(null, more))).toEqual(more);
    // Another Type in the dialog drops it, as picking another Kind does; removing its row is every type
    expect(keepFeedResourceFilters(more, null, ['Event'])).toEqual({ rows: 'links' });
    expect(removeFeedResourceFilter(more, 'exclude_types')).toEqual({ rows: 'links' });
  });

  it('opens a saved feed with its types as Kind and Type and its filters as the panel spells them', () => {
    const params = toFeedResourceParams(EVENT_TYPES, {
      when: 'week',
      near: '47.37,8.54',
      radius: '10',
      place: 'Zürich',
      sort: 'nearest',
    });

    expect(params.toString()).toBe('kind=event&when=week&near=47.37%2C8.54&radius=10&place=Z%C3%BCrich&sort=nearest');
    expect(toFeedResourceParams(['MusicAlbum'], null).toString()).toBe('kind=music&type=MusicAlbum');
    expect(
      toFeedResourceParams(null, { from: '2026-11-01', to: '2026-11-30', closed: 'yes', rows: 'links' }).toString(),
    ).toBe('when=dates&from=2026-11-01&to=2026-11-30&closed=1&rows=links');
  });

  it('saves what the panel shows, in the specs’ spelling, and reads it back the same', () => {
    const saved = {
      when: 'week',
      near: '47.37,8.54',
      radius: '50',
      place: 'Zürich',
      sort: 'trending',
      window: '24h',
      rows: 'links',
    };
    expect(toFeedResourceFilters(parseFeedResourceFilters(['Event'], saved))).toEqual(saved);
    // A distance another client saved that the panel offers no option for (1 to 200 km) is kept
    const otherClient = { near: '47.37,8.54', radius: '25' };
    expect(toFeedResourceFilters(parseFeedResourceFilters(['Place'], otherClient))).toEqual(otherClient);
    const place = { near: '47.37,8.54', category: 'amenity/cafe', sort: 'nearest' };
    expect(toFeedResourceFilters(parseFeedResourceFilters(['Place'], place))).toEqual(place);
    expect(toFeedResourceFilters(parseFeedResourceFilters(['Book'], { key: 'isbn:9780140328721' }))).toEqual({
      key: 'isbn:9780140328721',
    });
    expect(toFeedResourceFilters(parseFeedResourceFilters(['JobPosting'], { remote: 'no', closed: 'yes' }))).toEqual({
      remote: 'no',
      closed: 'yes',
    });
    expect(toFeedResourceFilters(parseFeedResourceFilters(['Recipe'], { ingredients: 'lemon,chickpeas' }))).toEqual({
      ingredients: 'lemon,chickpeas',
    });
    // Several services, saved sorted; one saved by an earlier build reads as a list of one
    const services = { host: 'open.spotify.com,www.deezer.com' };
    expect(toFeedResourceFilters(parseFeedResourceFilters(['MusicRecording'], services))).toEqual(services);
    expect(parseFeedResourceFilters(['MusicRecording'], { host: 'open.spotify.com' }).hosts).toEqual([
      'open.spotify.com',
    ]);
    expect(
      toFeedResourceFilters(
        parseResourceSearchFilters(new URLSearchParams('kind=music&service=www.deezer.com,open.spotify.com')),
      ),
    ).toEqual(services);
  });

  it('leaves out what a feed keeps elsewhere or the specs take no other way', () => {
    // Kind and sub-kinds are the feed's types, Popular and Recent its own sort, the default radius none
    const panel = parseResourceSearchFilters(
      new URLSearchParams('kind=event&type=MusicEvent&sort=popular&near=47.37,8.54&radius=10&category=a,b'),
    );
    expect(toFeedResourceFilters(panel)).toEqual({ near: '47.37,8.54' });
    expect(toFeedResourceFilters(parseResourceSearchFilters(null))).toBeNull();
    // Days picked in either order are one range, first day first
    const days = parseResourceSearchFilters(new URLSearchParams('kind=event&when=dates&from=2026-11-30&to=2026-11-01'));
    expect(toFeedResourceFilters(days)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    // Nearest needs a point
    expect(
      toFeedResourceFilters(parseResourceSearchFilters(new URLSearchParams('kind=place&sort=nearest'))),
    ).toBeNull();
  });

  it('saves only the filters the kind applies, as the search does', () => {
    const read = (search: string) => toFeedResourceFilters(parseResourceSearchFilters(new URLSearchParams(search)));
    // A shared Home link with When and no Kind: Home searches no window, so the feed saves none
    expect(read('when=week')).toBeNull();
    expect(read('when=week&rows=links')).toEqual({ rows: 'links' });
    // Upcoming picked on Events, then Places: Places has no Upcoming
    expect(read('kind=place&sort=upcoming&near=47.37,8.54')).toEqual({ near: '47.37,8.54' });
    // Nearest only where the kind has Where, and Upcoming not for past events
    expect(read('kind=music&near=47.37,8.54&sort=nearest')).toBeNull();
    expect(read('kind=event&when=past&sort=upcoming')).toEqual({ when: 'past' });
    expect(read('kind=event&sort=upcoming')).toEqual({ sort: 'upcoming' });
    // An identifier only in a namespace the kind takes
    expect(read('kind=book&id=doi:10.1000/182')).toBeNull();
    // Trending is every kind's
    expect(read('sort=trending&window=24h')).toEqual({ sort: 'trending', window: '24h' });
  });

  it('keeps a place name as the specs count it, in code points, and a trimmed category', () => {
    const place = parseResourceSearchFilters(new URLSearchParams('kind=place&near=47.37,8.54'));
    // 120 code points (240 UTF-16 units) is a valid name; 121 is not
    expect(toFeedResourceFilters({ ...place, place: '🎵'.repeat(120) })?.place).toBe('🎵'.repeat(120));
    expect(toFeedResourceFilters({ ...place, place: '🎵'.repeat(121) })?.place).toBeUndefined();
    expect(toFeedResourceFilters({ ...place, category: 'amenity/cafe ' })?.category).toBeUndefined();
  });

  it('puts a shared link’s filters over the feed’s, and a Kind in the link brings its own sub-kinds', () => {
    const saved = toFeedResourceParams(['MusicEvent'], { when: 'week', near: '47.37,8.54' });
    expect(saved.get('kind')).toBe('event');

    const merged = mergeFeedResourceParams(saved, new URLSearchParams('when=today&q=x'));
    expect(merged.toString()).toBe('kind=event&type=MusicEvent&when=today&near=47.37%2C8.54');
    expect(mergeFeedResourceParams(saved, new URLSearchParams('kind=place')).get('type')).toBe('');
    // A link to another kind takes none of the saved filters only the feed's kind has: they are empty
    expect(mergeFeedResourceParams(saved, new URLSearchParams('kind=recipe&ingredient=eggs')).toString()).toBe(
      'kind=recipe&type=&when=&near=&ingredient=eggs',
    );
    expect(mergeFeedResourceParams(saved, new URLSearchParams('kind=place')).toString()).toBe(
      'kind=place&type=&when=&near=47.37%2C8.54',
    );
    // A feed's several services open as the Service picks; a link's own services win
    const music = toFeedResourceParams(['MusicRecording'], { host: 'open.spotify.com,www.deezer.com' });
    expect(mergeFeedResourceParams(music, new URLSearchParams('q=x')).get('service')).toBe(
      'open.spotify.com,www.deezer.com',
    );
    expect(mergeFeedResourceParams(music, new URLSearchParams('service=tidal.com')).get('service')).toBe('tidal.com');
  });

  it('keeps a saved filter the URL holds as empty cleared, and an empty Kind as All kinds without the kind’s own', () => {
    const saved = toFeedResourceParams(['MusicEvent'], { when: 'week', near: '47.37,8.54', rows: 'links' });

    expect(mergeFeedResourceParams(saved, new URLSearchParams('when=')).toString()).toBe(
      'kind=event&type=MusicEvent&rows=links&when=&near=47.37%2C8.54',
    );
    // All kinds: no saved Type, When or Where comes back; a filter every kind has stays
    expect(mergeFeedResourceParams(saved, new URLSearchParams('kind=&type=&when=&near=')).toString()).toBe(
      'kind=&type=&rows=links&when=&near=',
    );
    expect(mergeFeedResourceParams(saved, new URLSearchParams('kind=')).toString()).toBe(
      'kind=&type=&rows=links&when=&near=',
    );
  });

  it('drops the filters of a kind’s own when the Type becomes another kind', () => {
    const filters = { when: 'week', near: '47.37,8.54', rows: 'links' };
    expect(keepFeedResourceFilters(filters, ['Event'], ['Place'])).toEqual({ near: '47.37,8.54', rows: 'links' });
    expect(keepFeedResourceFilters(filters, ['Event'], null)).toEqual({ rows: 'links' });
    expect(keepFeedResourceFilters(filters, ['Event'], ['MusicEvent'])).toEqual(filters);
    expect(keepFeedResourceFilters(null, ['Event'], null)).toBeNull();
    // Music and Videos both have Service: the services stay; Books have none: they go
    const services = { host: 'open.spotify.com,www.youtube.com' };
    expect(keepFeedResourceFilters(services, ['MusicRecording'], ['VideoObject'])).toEqual(services);
    expect(keepFeedResourceFilters(services, ['MusicRecording'], ['Book'])).toBeNull();
    // Upcoming is Events' own: a Type of Places drops it
    expect(keepFeedResourceFilters({ sort: 'upcoming', near: '47.37,8.54' }, ['Event'], ['Place'])).toEqual({
      near: '47.37,8.54',
    });
  });

  it('removes a row with what reads with it', () => {
    const filters = {
      from: '2026-11-01',
      to: '2026-11-30',
      near: '47.37,8.54',
      radius: '10',
      place: 'Zürich',
      host: 'open.spotify.com',
      ingredients: 'chickpeas,lemon',
      sort: 'nearest',
    };
    expect(removeFeedResourceFilter(filters, 'near')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
      host: 'open.spotify.com',
      ingredients: 'chickpeas,lemon',
    });
    expect(removeFeedResourceFilter({ when: 'week' }, 'when')).toBeNull();
  });
});
