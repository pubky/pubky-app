import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESOURCE_KINDS } from '@/config/pinakes';
import type { Pubky } from '@/models/models.types';
import {
  buildResourceSearchParams,
  classifyResourceSearchInput,
  getRelatedResourceTags,
  getResourceCategoryLabel,
  getResourceEventRange,
  getResourceFeedTypeOptions,
  getResourceKindOf,
  getResourceKindsTypes,
  getResourceSearchRowUri,
  getResourceServices,
  getResourceServicesQuery,
  getResourceSubKinds,
  getResourceTypeLabel,
  getResourceTypesLabel,
  hasCredentialLink,
  isNexusRepresentable,
  isResolvableLink,
  isResourceTypeName,
  parseResourceIdentifier,
  parseResourceIngredient,
  RESOURCE_SEARCH_MAX_EXCLUDED_TYPES,
  RESOURCE_SEARCH_MAX_TYPES,
  rollUpResourceKinds,
  toResourceFeedTypesValue,
  toResourceSearchReach,
  toResourceSearchSort,
  type TResourceQuery,
} from './resource.search';

const VIEWER = 'hkdrfoddu3rmeucj1mazu4aeg11nxj7uaxybnmots5o9s5hd3t6y' as Pubky;

// Whether the configured Pinakes serves My network (`wot_2`)
const reachSet = vi.hoisted(() => ({ served: false }));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesReachSetServed: () => reachSet.served,
}));

beforeEach(() => {
  reachSet.served = false;
});

const query = (overrides: Partial<TResourceQuery> = {}): TResourceQuery => ({
  input: { kind: 'tags', tags: ['music'] },
  sort: 'activity',
  reach: 'all',
  viewer: null,
  collapse: true,
  ...overrides,
});

describe('classifyResourceSearchInput', () => {
  it.each([
    [
      'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq',
      { kind: 'url', url: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq' },
    ],
    ['  isbn:978-0-262-03384-8 ', { kind: 'key', key: 'isbn:978-0-262-03384-8' }],
    ['ISRC:USQX91300108', { kind: 'key', key: 'isrc:USQX91300108' }],
    ['doi:10.1038/nature14539', { kind: 'key', key: 'doi:10.1038/nature14539' }],
    ['q190115', { kind: 'key', key: 'wikidata:Q190115' }],
    ['tt1375666', { kind: 'key', key: 'imdb:tt1375666' }],
    ['daft punk', { kind: 'text', text: 'daft punk' }],
    ['note:not-an-identifier', { kind: 'text', text: 'note:not-an-identifier' }],
  ])('reads %s', (raw, expected) => {
    expect(classifyResourceSearchInput(raw)).toEqual(expected);
  });
});

describe('isResolvableLink', () => {
  it.each([
    ['https://open.spotify.com/track/1', true],
    ['https://user@open.spotify.com/track/1', false],
    ['https://user:secret@open.spotify.com/track/1', false],
    ['https://:secret@open.spotify.com/track/1', false],
    ['https://x.com/@user', true],
    ['https://mastodon.social/@name', true],
    ['not a link', false],
    ['https://example.invalid/?u=https://alice:secret@other.invalid/', false],
    ['https://ali\tce:secret@example.invalid/a', false],
  ])('%s may be sent: %s', (uri, expected) => {
    expect(isResolvableLink(uri)).toBe(expected);
  });
});

describe('hasCredentialLink', () => {
  it.each([
    ['listen https://user:secret@open.spotify.com/track/1', true],
    ['https://user@open.spotify.com/track/1 jazz', true],
    ['<https://user@host>', true],
    ['daft punk', false],
    ['https://open.spotify.com/track/1?via=a@b', false],
    ['mail alice@example.com', false],
    ['https://x.com/@user', false],
    ['follow https://mastodon.social/@name', false],
    ['doi:https://user:secret@example.com', true],
    ['https://example.com/?u=https://user:secret@bank.com', true],
    ['doi:10.1234/https://a.org/https://user:secret@host', true],
    ['https:user:secret@host', true],
    ['https:/user:secret@host', true],
    ['https:\\\\user:secret@host', true],
    ['https://example.com/?u=https://bank.com/@me', false],
    // A browser drops tabs and line breaks inside a link, which brings its username back together
    ['https://ali\tce:secret@example.invalid/a', true],
    ['https://alice:sec\nret@example.invalid/a', true],
    ['https://alice:secret\r@example.invalid/a', true],
  ])('%s: %s', (text, expected) => {
    expect(hasCredentialLink(text)).toBe(expected);
  });
});

describe('buildResourceSearchParams', () => {
  it('sends tags, one row per thing, the sort and the page, and nothing else', () => {
    expect(buildResourceSearchParams(query(), { limit: 10 })).toEqual({
      tags: 'music',
      sort: 'activity',
      collapse: 'group',
      limit: '10',
    });
  });

  it('narrows to every tag with match=all and takes at most 5 tags', () => {
    expect(
      buildResourceSearchParams(query({ input: { kind: 'tags', tags: ['music', 'track'], match: 'all' } }), {
        limit: 10,
      }),
    ).toMatchObject({ tags: 'music,track', match: 'all' });
    expect(
      buildResourceSearchParams(query({ input: { kind: 'tags', tags: ['a', 'b', 'c', 'd', 'e', 'f'] } }), {
        limit: 10,
      }).tags,
    ).toBe('a,b,c,d,e');
  });

  it('sends a text as q, an identifier as key and a card as related', () => {
    expect(
      buildResourceSearchParams(query({ input: { kind: 'text', text: 'daft punk' } }), { limit: 5 }),
    ).toMatchObject({
      q: 'daft punk',
      sort: 'activity',
    });
    expect(
      buildResourceSearchParams(query({ input: { kind: 'key', key: 'isrc:USQX91300108' } }), { limit: 5 }).key,
    ).toBe('isrc:USQX91300108');
    expect(buildResourceSearchParams(query({ input: { kind: 'related', id: 'abc' } }), { limit: 5 }).related).toBe(
      'abc',
    );
    expect(buildResourceSearchParams(query({ input: { kind: 'all' } }), { limit: 5 })).not.toHaveProperty('tags');
  });

  it('asks for every type without picked types', () => {
    expect(buildResourceSearchParams(query({}), { limit: 5 })).not.toHaveProperty('type');
    expect(buildResourceSearchParams(query({ types: [] }), { limit: 5 })).not.toHaveProperty('type');
  });

  it.each([
    ['activity', { sort: 'activity' }],
    ['recent', { sort: 'recent' }],
    ['trending', { sort: 'trending', window: '7d' }],
    ['upcoming', { sort: 'start', from: 'now' }],
  ] as const)('orders %s', (sort, expected) => {
    expect(buildResourceSearchParams(query({ sort }), { limit: 5 })).toMatchObject(expected);
  });

  it('sends the reach with the viewer, boosts the network in All signed in, and sends no viewer signed out', () => {
    expect(buildResourceSearchParams(query({ reach: 'following', viewer: VIEWER }), { limit: 5 })).toMatchObject({
      reach: 'following',
      viewer: VIEWER,
    });
    const all = buildResourceSearchParams(query({ viewer: VIEWER }), { limit: 5 });
    expect(all).toMatchObject({ boost: 'following', viewer: VIEWER });
    expect(all).not.toHaveProperty('reach');
    const signedOut = buildResourceSearchParams(query({ reach: 'friends' }), { limit: 5 });
    expect(signedOut).not.toHaveProperty('reach');
    expect(signedOut).not.toHaveProperty('viewer');
    expect(signedOut).not.toHaveProperty('boost');
  });

  it('searches and boosts My network where Pinakes serves it', () => {
    reachSet.served = true;
    expect(buildResourceSearchParams(query({ reach: 'wot_2', viewer: VIEWER }), { limit: 5 })).toMatchObject({
      reach: 'wot_2',
      viewer: VIEWER,
    });
    expect(buildResourceSearchParams(query({ viewer: VIEWER }), { limit: 5 })).toMatchObject({
      boost: 'wot_2',
      viewer: VIEWER,
    });
  });

  it('boosts the network only in the activity and trending ranks, which Pinakes boosts', () => {
    for (const sort of ['recent', 'upcoming'] as const) {
      const params = buildResourceSearchParams(query({ sort, viewer: VIEWER }), { limit: 5 });
      expect(params).not.toHaveProperty('boost');
      expect(params).not.toHaveProperty('viewer');
    }
    expect(buildResourceSearchParams(query({ sort: 'trending', viewer: VIEWER }), { limit: 5 }).boost).toBe(
      'following',
    );
  });

  it('sends a related search with no order and no boost of its own: Pinakes ranks it', () => {
    const params = buildResourceSearchParams(
      query({ input: { kind: 'related', id: 'card' }, sort: 'upcoming', viewer: VIEWER, types: ['MusicRecording'] }),
      { limit: 5 },
    );
    expect(params).toEqual({
      related: 'card',
      type: 'MusicRecording',
      collapse: 'group',
      limit: '5',
    });
    expect(
      buildResourceSearchParams(query({ input: { kind: 'related', id: 'card' }, reach: 'following', viewer: VIEWER }), {
        limit: 5,
      }),
    ).toMatchObject({ reach: 'following', viewer: VIEWER });
  });

  it('leaves types out with exclude_type, up to 50', () => {
    expect(buildResourceSearchParams(query({ excludeTypes: ['Event', 'Article'] }), { limit: 5 })).toMatchObject({
      exclude_type: 'Event,Article',
    });
    const many = Array.from({ length: 60 }, (_, i) => `Type${i}`);
    expect(buildResourceSearchParams(query({ excludeTypes: many }), { limit: 5 }).exclude_type.split(',')).toHaveLength(
      RESOURCE_SEARCH_MAX_EXCLUDED_TYPES,
    );
    expect(buildResourceSearchParams(query({ excludeTypes: [] }), { limit: 5 })).not.toHaveProperty('exclude_type');
  });

  it('asks for the facets and the next page when told', () => {
    expect(buildResourceSearchParams(query({ collapse: false }), { limit: 5, cursor: 'c1', facets: true })).toEqual({
      tags: 'music',
      sort: 'activity',
      facet: 'type,tags',
      limit: '5',
      cursor: 'c1',
    });
  });
});

describe('isNexusRepresentable', () => {
  it('holds for every resource or any of some tags, Recent, from everyone', () => {
    expect(isNexusRepresentable(query({ sort: 'recent' }))).toBe(true);
    expect(isNexusRepresentable(query({ sort: 'recent', input: { kind: 'all' }, viewer: VIEWER }))).toBe(true);
  });

  it.each([
    ['another order', { sort: 'activity' as const }],
    ['a reach', { sort: 'recent' as const, reach: 'following' as const }],
    ['a type', { sort: 'recent' as const, types: ['MusicRecording'] }],
    [
      'every tag',
      { sort: 'recent' as const, input: { kind: 'tags' as const, tags: ['a', 'b'], match: 'all' as const } },
    ],
    ['a text', { sort: 'recent' as const, input: { kind: 'text' as const, text: 'daft punk' } }],
    ['an identifier', { sort: 'recent' as const, input: { kind: 'key' as const, key: 'isbn:1' } }],
    ['a type', { sort: 'recent' as const, types: ['Restaurant'] }],
    ['types left out', { sort: 'recent' as const, excludeTypes: ['Event'] }],
    ['an author', { sort: 'recent' as const, author: VIEWER }],
    ['a collection', { sort: 'recent' as const, inCollection: 'pubky://a/pub/social/v1/posts/1' }],
  ])('does not hold with %s', (_, overrides) => {
    expect(isNexusRepresentable(query(overrides))).toBe(false);
  });
});

describe('the rest of the query', () => {
  it('offers the related tags not yet searched', () => {
    expect(
      getRelatedResourceTags(
        [
          { label: 'music', count: 109 },
          { label: 'track', count: 29 },
        ],
        ['music'],
      ),
    ).toEqual(['track']);
  });

  it('shows a row by the first web link people wrote for it, else by its own link', () => {
    expect(getResourceSearchRowUri({ uri: 'isbn:9780262033848', refs: ['https://example.com/book'] })).toBe(
      'https://example.com/book',
    );
    expect(getResourceSearchRowUri({ uri: 'isbn:9780262033848', refs: [] })).toBe('isbn:9780262033848');
  });

  it('maps My network to wot_2 where Pinakes serves it', () => {
    reachSet.served = true;
    expect(['network', 'wot', 'me', 'followers'].map(toResourceSearchReach)).toEqual(['wot_2', 'wot_2', null, null]);
  });

  it('maps a feed’s reach and sort, and leaves out a reach Pinakes has none for', () => {
    // My network has no Pinakes reach without reach sets (wot_2 needs a Nexus that serves them)
    expect(['all', 'network', 'wot', 'following', 'friends', 'me', 'followers'].map(toResourceSearchReach)).toEqual([
      'all',
      null,
      null,
      'following',
      'friends',
      null,
      null,
    ]);
    expect(['recent', 'timeline', 'popularity', 'total_engagement'].map(toResourceSearchSort)).toEqual([
      'recent',
      'recent',
      'activity',
      'activity',
    ]);
  });
});

describe('the types a custom resources feed lists', () => {
  it('offers each kind of the search, then its sub-kinds, each value once and as the feed stores it', () => {
    const options = getResourceFeedTypeOptions();
    expect(options.slice(0, 5)).toEqual([
      {
        value: 'MusicGroup,MusicPlaylist,MusicRecording',
        label: 'Music',
        kind: 'Music',
        kindId: 'music',
        isSubKind: false,
      },
      { value: 'MusicRecording', label: 'Songs', kind: 'Music', kindId: 'music', isSubKind: true },
      { value: 'MusicAlbum', label: 'Albums', kind: 'Music', kindId: 'music', isSubKind: true },
      { value: 'MusicGroup', label: 'Artists', kind: 'Music', kindId: 'music', isSubKind: true },
      { value: 'MusicPlaylist', label: 'Playlists', kind: 'Music', kindId: 'music', isSubKind: true },
    ]);
    expect(options.filter((option) => !option.isSubKind).map((option) => option.label)).toEqual(
      RESOURCE_KINDS.map((kind) => kind.label),
    );
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
    for (const { value } of options) {
      const types = value.split(',');
      expect(types.length).toBeLessThanOrEqual(RESOURCE_SEARCH_MAX_TYPES);
      expect(toResourceFeedTypesValue(types)).toBe(value);
      for (const type of types) expect(isResourceTypeName(type), type).toBe(true);
    }
  });

  it('reads the types of a feed as the kind they make up, else as each type', () => {
    expect(getResourceTypesLabel(['MusicRecording', 'MusicGroup', 'MusicPlaylist'])).toBe('Music');
    expect(getResourceTypesLabel(['Restaurant'])).toBe('Restaurants');
    expect(getResourceTypesLabel(['MusicAlbum', 'MusicRecording'])).toBe('Albums, Songs');
    expect(getResourceTypesLabel(['FoodEstablishment'])).toBe('Food establishment');
    expect(toResourceFeedTypesValue(['Restaurant', 'BarOrPub', 'Restaurant'])).toBe('BarOrPub,Restaurant');
  });
});

describe('buildResourceSearchParams with the search filters', () => {
  it('asks for picked types, at most 10', () => {
    expect(buildResourceSearchParams(query({ types: ['Restaurant', 'CafeOrCoffeeShop'] }), { limit: 5 }).type).toBe(
      'Restaurant,CafeOrCoffeeShop',
    );
    const many = Array.from({ length: 12 }, (_, i) => `Type${i}`);
    expect(buildResourceSearchParams(query({ types: many }), { limit: 5 }).type?.split(',')).toHaveLength(10);
  });

  it('ranks a text by relevance, boosted signed in; Relevance without a text is Popular', () => {
    const text = buildResourceSearchParams(
      query({ input: { kind: 'text', text: 'daft punk' }, sort: 'relevance', viewer: VIEWER }),
      { limit: 5 },
    );
    expect(text).toMatchObject({ q: 'daft punk', sort: 'relevance', boost: 'following', viewer: VIEWER });
    expect(buildResourceSearchParams(query({ sort: 'relevance' }), { limit: 5 }).sort).toBe('activity');
  });

  it('sends the Trending window with Trending only', () => {
    expect(buildResourceSearchParams(query({ sort: 'trending', window: '24h' }), { limit: 5 }).window).toBe('24h');
    expect(buildResourceSearchParams(query({ sort: 'recent', window: '24h' }), { limit: 5 })).not.toHaveProperty(
      'window',
    );
  });

  it('narrows to an author and a collection, but not what is related to a card', () => {
    const narrowed = { author: VIEWER, inCollection: 'pubky://a/pub/social/v1/posts/1' };
    expect(buildResourceSearchParams(query(narrowed), { limit: 5 })).toMatchObject({
      author: VIEWER,
      in_collection: 'pubky://a/pub/social/v1/posts/1',
    });
    const related = buildResourceSearchParams(query({ ...narrowed, input: { kind: 'related', id: 'card' } }), {
      limit: 5,
    });
    expect(related).not.toHaveProperty('author');
    expect(related).not.toHaveProperty('in_collection');
  });
});

describe('resource kinds', () => {
  const facet = (type: string, path: string[], count: number) => ({ type, type_path: ['Thing', ...path], count });
  const FACETS = [
    facet('MusicRecording', ['CreativeWork'], 70),
    facet('MusicAlbum', ['CreativeWork', 'MusicPlaylist'], 25),
    facet('MusicGroup', ['Organization', 'PerformingGroup'], 27),
    facet('MusicEvent', ['Event'], 2),
    facet('Event', [], 112),
    facet('Restaurant', ['Organization', 'Place', 'LocalBusiness', 'FoodEstablishment'], 16),
    facet('CafeOrCoffeeShop', ['Organization', 'Place', 'LocalBusiness', 'FoodEstablishment'], 9),
    facet('Article', ['CreativeWork'], 73),
    facet('NewsArticle', ['CreativeWork', 'Article'], 11),
    facet('ScholarlyArticle', ['CreativeWork', 'Article'], 18),
    facet('WebPage', ['CreativeWork'], 140),
    facet('BitcoinBlock', [], 7),
  ];

  it('puts each type in the first kind with one of its types on the path (no kind: More kinds)', () => {
    expect(getResourceKindOf(FACETS[1])?.id).toBe('music');
    expect(getResourceKindOf(FACETS[3])?.id).toBe('event');
    expect(getResourceKindOf(FACETS[5])?.id).toBe('place');
    expect(getResourceKindOf(FACETS[9])?.id).toBe('paper');
    expect(getResourceKindOf(FACETS[10])).toBeNull();
  });

  it('counts the links a search of each kind finds, in order, with More kinds last', () => {
    expect(rollUpResourceKinds(FACETS)).toEqual([
      { id: 'music', count: 122 },
      { id: 'event', count: 114 },
      { id: 'place', count: 25 },
      { id: 'paper', count: 18 },
      // Pinakes includes subtypes: Article finds the papers too, and the count says so
      { id: 'article', count: 102 },
      { id: 'more', count: 147 },
    ]);
    expect(rollUpResourceKinds([])).toEqual([]);
  });

  it('lists a kind’s sub-kinds most links first, each counting the subtypes a search for it finds', () => {
    expect(getResourceSubKinds('music', FACETS)).toEqual([
      { type: 'MusicRecording', count: 70 },
      { type: 'MusicGroup', count: 27 },
      { type: 'MusicAlbum', count: 25 },
    ]);
    expect(getResourceSubKinds('article', FACETS)).toEqual([
      { type: 'Article', count: 102 },
      { type: 'ScholarlyArticle', count: 18 },
      { type: 'NewsArticle', count: 11 },
    ]);
    expect(getResourceSubKinds('more', FACETS).map(({ type }) => type)).toEqual(['WebPage', 'BitcoinBlock']);
  });

  it('offers no supertype of the kinds as a More kinds type, but counts its links: All types lists them', () => {
    const withSupertypes = [...FACETS, facet('CreativeWork', [], 33), facet('Organization', [], 11)];
    // Picking CreativeWork would find most kinds too
    expect(getResourceSubKinds('more', withSupertypes).map(({ type }) => type)).toEqual(['WebPage', 'BitcoinBlock']);
    // Every link of a type no kind stands for: what leaving out the kinds' types finds
    expect(rollUpResourceKinds(withSupertypes).at(-1)).toEqual({ id: 'more', count: 147 + 33 + 11 });
  });

  it('leaves out every kind’s own types for More kinds, each once, within one search', () => {
    const types = getResourceKindsTypes();
    expect(types).toEqual(expect.arrayContaining(['MusicRecording', 'Event', 'Place', 'Article', 'Product']));
    expect(new Set(types).size).toBe(types.length);
    expect(types.length).toBeLessThanOrEqual(RESOURCE_SEARCH_MAX_EXCLUDED_TYPES);
    // A type of the index no kind stands for is not one of them
    expect(types).not.toContain('WebPage');
  });

  it('reads a type as a chip label and checks type names', () => {
    expect(getResourceTypeLabel('MusicRecording')).toBe('Songs');
    expect(getResourceTypeLabel('CafeOrCoffeeShop')).toBe('Cafés');
    expect(getResourceTypeLabel('BitcoinBlock')).toBe('Bitcoin block');
    expect(getResourceTypeLabel('FAQPage')).toBe('Faq page');
    expect(isResourceTypeName('MusicRecording')).toBe(true);
    expect(isResourceTypeName('music')).toBe(false);
    expect(isResourceTypeName('Music,Recording')).toBe(false);
  });
});

describe("buildResourceSearchParams: a kind's own filters", () => {
  it('sends the date range, the point, the category, service, identifier, jobs and ingredients', () => {
    const params = buildResourceSearchParams(
      query({
        sort: 'distance',
        from: 'now',
        to: '2026-11-15T22:59:59Z',
        near: { lat: 47.37, lon: 8.54 },
        radiusKm: 2,
        category: 'amenity/cafe',
        hosts: ['open.spotify.com', 'www.deezer.com'],
        key: 'isrc:USQX91300108',
        remote: false,
        closed: true,
        ingredients: ['flour', 'eggs', 'salt', 'pepper'],
        extraFacets: ['host', 'category', 'host'],
      }),
      { limit: 5, facets: true },
    );
    expect(params).toMatchObject({
      sort: 'distance',
      from: 'now',
      to: '2026-11-15T22:59:59Z',
      near: '47.37,8.54',
      radius: '2000',
      category: 'amenity/cafe',
      host: 'open.spotify.com,www.deezer.com',
      key: 'isrc:USQX91300108',
      remote: 'false',
      closed: 'true',
      ingredient: 'flour,eggs,salt',
      facet: 'type,tags,host,category',
    });
  });

  it('never sends what cannot apply: Nearest without a point, a second identifier, any of it with a searched link', () => {
    expect(buildResourceSearchParams(query({ sort: 'distance' }), { limit: 5 }).sort).toBe('activity');
    expect(
      buildResourceSearchParams(
        query({ input: { kind: 'key', key: 'isbn:9780262033848' }, key: 'isrc:USQX91300108' }),
        {
          limit: 5,
        },
      ).key,
    ).toBe('isbn:9780262033848');
    const related = buildResourceSearchParams(
      query({
        input: { kind: 'related', id: 'card' },
        to: 'now',
        near: { lat: 1, lon: 2 },
        hosts: ['x.com'],
        closed: true,
      }),
      { limit: 5 },
    );
    expect(Object.keys(related).sort()).toEqual(['collapse', 'limit', 'related']);
    // Upcoming with a range: the range says where it starts
    expect(buildResourceSearchParams(query({ sort: 'upcoming', to: 'now' }), { limit: 5 })).not.toHaveProperty('from');
    expect(buildResourceSearchParams(query({ near: { lat: 1, lon: 2 } }), { limit: 5 }).radius).toBe('10000');
  });

  it('leaves the stream out for any of them', () => {
    const recent = query({ sort: 'recent' });
    expect(isNexusRepresentable(recent)).toBe(true);
    for (const filter of [
      { from: 'now' },
      { to: 'now' },
      { near: { lat: 1, lon: 2 } },
      { category: 'amenity/cafe' },
      { hosts: ['x.com'] },
      { key: 'isrc:USQX91300108' },
      { remote: true },
      { closed: true },
      { ingredients: ['flour'] },
    ]) {
      expect(isNexusRepresentable({ ...recent, ...filter })).toBe(false);
    }
  });
});

describe('parseResourceIdentifier', () => {
  it.each([
    ['USQX91300108', ['isrc', 'upc', 'mbid'], 'isrc:USQX91300108'],
    ['us-qx9-13-00108', ['isrc', 'upc', 'mbid'], 'isrc:USQX91300108'],
    ['isrc:USQX91300108', ['isrc', 'upc', 'mbid'], 'isrc:USQX91300108'],
    ['0602537518357', ['isrc', 'upc', 'mbid'], 'upc:0602537518357'],
    ['B8D2D3A6-6A7F-4F0F-9E4E-3C2D2B1A0F9E', ['isrc', 'upc', 'mbid'], 'mbid:b8d2d3a6-6a7f-4f0f-9e4e-3c2d2b1a0f9e'],
    [
      'https://musicbrainz.org/recording/b8d2d3a6-6a7f-4f0f-9e4e-3c2d2b1a0f9e',
      ['isrc', 'upc', 'mbid'],
      'mbid:b8d2d3a6-6a7f-4f0f-9e4e-3c2d2b1a0f9e',
    ],
    ['978-0-262-03384-8', ['isbn'], 'isbn:9780262033848'],
    ['026203384x', ['isbn'], 'isbn:026203384X'],
    ['10.1038/nature14539', ['doi'], 'doi:10.1038/nature14539'],
    ['https://doi.org/10.1038/nature14539', ['doi'], 'doi:10.1038/nature14539'],
    ['doi:10.1038/nature14539', ['doi'], 'doi:10.1038/nature14539'],
  ] as const)('reads %s', (raw, namespaces, key) => {
    expect(parseResourceIdentifier(raw, namespaces)).toBe(key);
  });

  it.each([
    ['USQX91300108', ['isbn']],
    ['isbn:9780262033848', ['isrc', 'upc', 'mbid']],
    ['https://doi.org/10.1038/x', ['isbn']],
    ['hello', ['isrc', 'upc', 'mbid', 'isbn', 'doi']],
    ['', ['doi']],
    ['https://doi.org/10.1000/%', ['doi']],
  ] as const)('refuses %s for %j', (raw, namespaces) => {
    expect(parseResourceIdentifier(raw, namespaces)).toBeNull();
  });
});

describe('parseResourceIngredient and getResourceCategoryLabel', () => {
  it('reads an ingredient as Pinakes takes it', () => {
    expect(parseResourceIngredient('  Olive   Oil ')).toBe('olive oil');
    expect(parseResourceIngredient('crème fraîche')).toBe('crème fraîche');
    expect(parseResourceIngredient('flour;drop')).toBeNull();
    expect(parseResourceIngredient('-')).toBeNull();
  });

  it('names a category by its value', () => {
    expect(getResourceCategoryLabel('amenity/place_of_worship')).toBe('Place of worship');
    expect(getResourceCategoryLabel('amenity/cafe')).toBe('Cafe');
    expect(getResourceCategoryLabel('Restaurant')).toBe('Restaurant');
  });
});

describe('getResourceEventRange', () => {
  const at = (...parts: [number, number, number, number?, number?]) =>
    new Date(parts[0], parts[1] - 1, parts[2], parts[3] ?? 0, parts[4] ?? 0);
  const utc = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  // Wednesday 11 November 2026, 17:00 local
  const now = at(2026, 11, 11, 17);

  it("spells each choice in the viewer's own days, weeks ending on Sunday", () => {
    expect(getResourceEventRange('upcoming', now)).toEqual({ from: 'now' });
    expect(getResourceEventRange('today', now)).toEqual({ from: 'now', to: utc(new Date(2026, 10, 11, 23, 59, 59)) });
    expect(getResourceEventRange('weekend', now)).toEqual({
      from: utc(at(2026, 11, 14)),
      to: utc(new Date(2026, 10, 15, 23, 59, 59)),
    });
    expect(getResourceEventRange('week', now)).toEqual({ from: 'now', to: utc(new Date(2026, 10, 15, 23, 59, 59)) });
    expect(getResourceEventRange('month', now)).toEqual({ from: 'now', to: utc(new Date(2026, 10, 30, 23, 59, 59)) });
    expect(getResourceEventRange('past', now)).toEqual({ to: 'now' });
    // On a Saturday the weekend has begun
    expect(getResourceEventRange('weekend', at(2026, 11, 14, 10))).toEqual({
      from: 'now',
      to: utc(new Date(2026, 10, 15, 23, 59, 59)),
    });
    // On a Sunday the week ends today
    expect(getResourceEventRange('week', at(2026, 11, 15, 10)).to).toBe(utc(new Date(2026, 10, 15, 23, 59, 59)));
  });

  it('takes the picked days whole, either open, in either order', () => {
    const first = utc(new Date(2026, 10, 20));
    const last = utc(new Date(2026, 10, 22, 23, 59, 59));
    expect(getResourceEventRange('dates', now, { from: '2026-11-20', to: '2026-11-22' })).toEqual({
      from: first,
      to: last,
    });
    expect(getResourceEventRange('dates', now, { from: '2026-11-22', to: '2026-11-20' })).toEqual({
      from: utc(new Date(2026, 10, 20)),
      to: utc(new Date(2026, 10, 22, 23, 59, 59)),
    });
    expect(getResourceEventRange('dates', now, { from: '2026-11-20', to: null })).toEqual({ from: first });
    expect(getResourceEventRange('dates', now, { from: null, to: 'nope' })).toEqual({ from: 'now' });
  });
});

describe('getResourceServices', () => {
  it('lists each service once by name, its hosts together and their links summed, most first', () => {
    expect(
      getResourceServices([
        { host: 'open.spotify.com', site: 'Spotify', count: 12 },
        { host: 'music.amazon.co.uk', site: 'Amazon Music', count: 8 },
        { host: 'www.deezer.com', site: 'Deezer', count: 10 },
        { host: 'music.amazon.com', site: 'amazon music', count: 7 },
        { host: 'example.org', site: '', count: 1 },
      ]),
    ).toEqual([
      { name: 'Amazon Music', hosts: ['music.amazon.co.uk', 'music.amazon.com'], count: 15 },
      { name: 'Spotify', hosts: ['open.spotify.com'], count: 12 },
      { name: 'Deezer', hosts: ['www.deezer.com'], count: 10 },
      { name: 'example.org', hosts: ['example.org'], count: 1 },
    ]);
  });

  it('adds a host the facet does not list as its own service with no links', () => {
    const spotify = { host: 'open.spotify.com', site: 'Spotify', count: 2 };
    expect(getResourceServices([spotify], ['open.spotify.com', 'h1.example.com'])).toEqual([
      { name: 'Spotify', hosts: ['open.spotify.com'], count: 2 },
      { name: 'h1.example.com', hosts: ['h1.example.com'], count: 0 },
    ]);
    expect(getResourceServices(null)).toEqual([]);
  });
});

describe('getResourceServicesQuery', () => {
  it('searches the links on the services, counted per host, for no viewer', () => {
    const params = buildResourceSearchParams(getResourceServicesQuery(['open.spotify.com', 'www.deezer.com']), {
      limit: 1,
      facets: true,
    });
    expect(params).toMatchObject({ host: 'open.spotify.com,www.deezer.com', facet: 'type,tags,host' });
    expect(params).not.toHaveProperty('viewer');
    expect(params).not.toHaveProperty('reach');
  });
});
