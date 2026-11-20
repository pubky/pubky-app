import { describe, expect, it } from 'vitest';
import { ROWS_ITEMS } from '@/organisms/SearchResources/SearchResourceFilters';
import { POSTINGS_ITEMS, WHEN_ITEMS } from '@/organisms/SearchResources/SearchResourceKindFilters';
import { getFeedResourceFilterRows } from './CustomFeedDialog.utils';

const labels = (filters: Parameters<typeof getFeedResourceFilterRows>[0]) =>
  getFeedResourceFilterRows(filters).map(({ name, label }) => ({ name, label }));

describe('getFeedResourceFilterRows', () => {
  it('reads a feed of every type but the kinds’ as the Kind More kinds', () => {
    expect(labels({ exclude_types: 'Article,Event', rows: 'links' })).toEqual([
      { name: 'exclude_types', label: 'Kind: More kinds' },
      { name: 'rows', label: 'Rows: Every link' },
    ]);
  });

  it('reads each saved filter as Search’s filter panel labels it', () => {
    expect(
      labels({
        when: 'week',
        near: '47.37,8.54',
        radius: '50',
        place: 'Zürich',
        sort: 'trending',
        window: '24h',
        rows: 'links',
      }),
    ).toEqual([
      { name: 'when', label: 'When: This week' },
      { name: 'near', label: 'Where: Zürich · Within 50 km' },
      { name: 'sort', label: 'Sort: Trending · Last 24 hours' },
      { name: 'rows', label: 'Rows: Every link' },
    ]);
    expect(labels({ remote: 'no', closed: 'yes' })).toEqual([
      { name: 'remote', label: 'Remote: On site' },
      { name: 'closed', label: 'Postings: Include closed' },
    ]);
    expect(labels({ remote: 'yes', sort: 'trending' })).toEqual([
      { name: 'remote', label: 'Remote: Remote' },
      { name: 'sort', label: 'Sort: Trending · Last 7 days' },
    ]);
  });

  it('reads days, a point and the other values with the row they belong to', () => {
    expect(
      labels({
        from: '2026-11-01',
        to: '2026-11-30',
        near: '47.37,8.54',
        category: 'amenity/place_of_worship',
        host: 'open.spotify.com,www.deezer.com',
        key: 'isbn:9780140328721',
        ingredients: 'chickpeas,lemon',
        sort: 'nearest',
      }),
    ).toEqual([
      { name: 'from', label: 'When: 2026-11-01 – 2026-11-30' },
      { name: 'near', label: 'Where: 47.37,8.54 · Within 10 km' },
      { name: 'category', label: 'Category: Place of worship' },
      { name: 'host', label: 'Service: open.spotify.com, www.deezer.com' },
      { name: 'key', label: 'Identifier: isbn:9780140328721' },
      { name: 'ingredients', label: 'Ingredients: chickpeas, lemon' },
      { name: 'sort', label: 'Sort: Nearest' },
    ]);
    expect(labels({ to: '2026-11-30' })).toEqual([{ name: 'to', label: 'When: Until 2026-11-30' }]);
    expect(labels({ when: 'past', sort: 'upcoming' })).toEqual([
      { name: 'when', label: 'When: Past' },
      { name: 'sort', label: 'Sort: Upcoming' },
    ]);
    expect(labels(null)).toEqual([]);
  });

  it('names the saved services as the Service filter does, each once, a host it does not name as itself', () => {
    const facets = [
      { host: 'open.spotify.com', site: 'Spotify', count: 27 },
      { host: 'music.amazon.co.uk', site: 'Amazon Music', count: 1 },
      { host: 'music.amazon.com', site: 'Amazon Music', count: 1 },
    ];
    const filters = { host: 'music.amazon.co.uk,music.amazon.com,open.spotify.com,www.deezer.com' };
    expect(getFeedResourceFilterRows(filters, facets).map(({ name, label }) => ({ name, label }))).toEqual([
      { name: 'host', label: 'Service: Amazon Music, Spotify, www.deezer.com' },
    ]);
  });

  it('reads the Service row as loading while the names are read, never as its hosts', () => {
    const filters = { host: 'music.amazon.com,open.spotify.com', rows: 'links' };
    expect(getFeedResourceFilterRows(filters, null, true)).toEqual([
      { name: 'host', label: 'Service:', icon: expect.anything(), isLoading: true },
      expect.objectContaining({ name: 'rows', label: 'Rows: Every link' }),
    ]);
    // Answered: the names; failed: the hosts
    const facets = [
      { host: 'music.amazon.com', site: 'Amazon Music', count: 1 },
      { host: 'open.spotify.com', site: 'Spotify', count: 2 },
    ];
    expect(getFeedResourceFilterRows(filters, facets, false)[0]).toMatchObject({
      label: 'Service: Amazon Music, Spotify',
    });
    expect(getFeedResourceFilterRows(filters, null, false)[0]).not.toHaveProperty('isLoading');
    expect(getFeedResourceFilterRows(filters, null, false)[0].label).toBe(
      'Service: music.amazon.com, open.spotify.com',
    );
  });

  it('names the services a read named while the others are read, never as their hosts', () => {
    const filters = { host: 'music.amazon.com,bandcamp.com,music.amazon.co.uk' };
    const facets = [
      { host: 'music.amazon.com', site: 'Amazon Music', count: 1 },
      { host: 'music.amazon.co.uk', site: 'Amazon Music', count: 1 },
    ];
    expect(getFeedResourceFilterRows(filters, facets, true)).toEqual([
      { name: 'host', label: 'Service: Amazon Music', icon: expect.anything(), isLoading: true },
    ]);
  });

  it('gives each row its Search option’s icon', () => {
    const [when, closed, rows] = getFeedResourceFilterRows({ when: 'week', closed: 'yes', rows: 'links' });
    expect(when?.icon).toBe(WHEN_ITEMS.find((item) => item.key === 'week')?.icon);
    expect(closed?.icon).toBe(POSTINGS_ITEMS.find((item) => item.key === 'closed')?.icon);
    expect(rows?.icon).toBe(ROWS_ITEMS.find((item) => item.key === 'links')?.icon);
  });
});
