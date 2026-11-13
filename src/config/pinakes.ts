import { getPinakesReachSet, getPinakesUrl } from '@/libs/runtime-config/runtime-config';

// Runtime-configurable: read via getters at call time (PUBKY_RUNTIME_PINAKES_URL, unset in dev/test
// unless `.env.local` sets it). See @/libs/runtime-config.
export { getPinakesUrl };

/**
 * True when a Pinakes origin is configured (`PUBKY_RUNTIME_PINAKES_URL`). Unset turns external
 * resource cards off: no Pinakes request is made and links keep the plain link preview.
 */
export function isPinakesConfigured(): boolean {
  return Boolean(getPinakesUrl());
}

/**
 * True when the configured Pinakes answers the `wot_2` reach (`PUBKY_RUNTIME_PINAKES_REACH_SET`):
 * its Nexus serves reach sets, so external resources are searched in My network too. Otherwise My
 * network is not offered for them (Pinakes answers `wot_2` with 501).
 */
export function isPinakesReachSetServed(): boolean {
  return isPinakesConfigured() && getPinakesReachSet();
}

/**
 * Pinakes contract limit: a URI longer than this many bytes is a 400 (`/llms.txt`, Limits).
 * Such a link cannot have a card, so it is answered as "no card" without a request.
 */
export const PINAKES_URI_MAX_BYTES = 2048;

/** Results asked for in one "Similar" (`GET /v1/search?related=`) read. */
export const PINAKES_RELATED_LIMIT = 5;

/**
 * Deadline for one Pinakes request. A card is optional, so a stalled connection must end in the
 * plain link preview instead of a skeleton that never resolves.
 */
export const PINAKES_REQUEST_TIMEOUT_MS = 8000;

/**
 * How long a card's read may take before a post shows the link's own preview instead of the
 * card's skeleton: Pinakes is optional enrichment, a post never waits on it.
 */
export const PINAKES_SLOW_READ_MS = 5_000;

/**
 * How long a resource search page is answered from the cache: a filter flipped back and forth, or
 * a page shown in two places, costs one request of Pinakes' budget (120 a minute per IP).
 */
export const PINAKES_SEARCH_STALE_MS = 30_000;

/** Resource search rows one page asks for. */
export const PINAKES_SEARCH_PAGE_SIZE = 10;

/** How long the resource search waits for its query to settle before it asks Pinakes (ms). */
export const PINAKES_SEARCH_DEBOUNCE_MS = 250;

/**
 * One kind of external resource the search offers: the schema.org types it stands for. Pinakes includes
 * their subtypes, so a kind finds every type with one of its types on the path (Articles & news' `Article`
 * finds the papers too: Pinakes has no way to leave a subtype out).
 */
export type TResourceKind = { id: string; label: string; types: readonly string[] };

/** The kinds of the External resources search, in the order they are offered. */
export const RESOURCE_KINDS: readonly TResourceKind[] = [
  { id: 'music', label: 'Music', types: ['MusicRecording', 'MusicPlaylist', 'MusicGroup'] },
  { id: 'video', label: 'Videos & film', types: ['VideoObject', 'Movie', 'TVSeries', 'TVEpisode'] },
  { id: 'podcast', label: 'Podcasts', types: ['PodcastSeries', 'PodcastEpisode'] },
  { id: 'event', label: 'Events', types: ['Event'] },
  { id: 'place', label: 'Places', types: ['Place'] },
  { id: 'book', label: 'Books', types: ['Book'] },
  { id: 'paper', label: 'Papers & reports', types: ['ScholarlyArticle', 'Report'] },
  { id: 'article', label: 'Articles & news', types: ['Article'] },
  { id: 'software', label: 'Software & apps', types: ['SoftwareApplication', 'SoftwareSourceCode'] },
  { id: 'learning', label: 'Learning', types: ['LearningResource', 'Course'] },
  { id: 'law', label: 'Law', types: ['Legislation'] },
  { id: 'job', label: 'Jobs', types: ['JobPosting'] },
  { id: 'recipe', label: 'Recipes', types: ['Recipe'] },
  { id: 'product', label: 'Products', types: ['Product'] },
];

/** The kind that lists every type of the index no kind above stands for. */
export const RESOURCE_MORE_KINDS = 'more';

/** How a type reads as a sub-kind chip where its own name does not (`MusicRecording` → Songs). */
export const RESOURCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  MusicRecording: 'Songs',
  MusicAlbum: 'Albums',
  MusicGroup: 'Artists',
  MusicPlaylist: 'Playlists',
  VideoObject: 'Videos',
  Movie: 'Films',
  TVSeries: 'TV series',
  TVEpisode: 'TV episodes',
  PodcastSeries: 'Shows',
  PodcastEpisode: 'Episodes',
  MusicEvent: 'Concerts',
  Restaurant: 'Restaurants',
  CafeOrCoffeeShop: 'Cafés',
  BarOrPub: 'Bars',
  Store: 'Stores',
  GroceryStore: 'Grocery stores',
  Museum: 'Museums',
  Hotel: 'Hotels',
  Bakery: 'Bakeries',
  Park: 'Parks',
  City: 'Cities',
  ScholarlyArticle: 'Papers',
  Report: 'Reports',
  NewsArticle: 'News',
  BlogPosting: 'Blog posts',
  DiscussionForumPosting: 'Forum posts',
  SoftwareSourceCode: 'Code',
  MobileApplication: 'Mobile apps',
  WebApplication: 'Web apps',
  VideoGame: 'Games',
  WebPage: 'Web pages',
};

/** A filter section only some kinds have (shown in the filter panel once such a kind is picked). */
export type TResourceKindSection = 'when' | 'where' | 'category' | 'service' | 'identifier' | 'jobs' | 'ingredients';

/** The sections each kind adds to the filter panel; a kind not listed adds none. */
export const RESOURCE_KIND_SECTIONS: Readonly<Record<string, readonly TResourceKindSection[]>> = {
  event: ['when', 'where'],
  place: ['where', 'category'],
  music: ['service', 'identifier'],
  video: ['service', 'identifier'],
  podcast: ['service', 'identifier'],
  book: ['identifier'],
  paper: ['identifier'],
  job: ['jobs'],
  recipe: ['ingredients'],
};

/** An identifier the Identifier box takes (a Pinakes `key=` namespace). */
export type TResourceIdentifier = 'isrc' | 'upc' | 'mbid' | 'isbn' | 'doi';

/** The identifiers each kind's Identifier box takes (Pinakes `key=` namespaces). */
export const RESOURCE_KIND_IDENTIFIERS: Readonly<Record<string, readonly TResourceIdentifier[]>> = {
  music: ['isrc', 'upc', 'mbid'],
  video: ['isrc', 'upc', 'mbid'],
  podcast: ['isrc', 'upc', 'mbid'],
  book: ['isbn'],
  paper: ['doi'],
};

/** The date ranges the Events When section offers; `dates` takes the viewer's own days. */
export const RESOURCE_EVENT_WHEN = ['upcoming', 'today', 'weekend', 'week', 'month', 'past', 'dates'] as const;

/** The distances around a point the Where section offers (km); Pinakes takes up to 200 km. */
export const RESOURCE_SEARCH_RADII_KM = [2, 10, 50, 200] as const;
/** The distance around a point, without one picked (km). */
export const RESOURCE_SEARCH_DEFAULT_RADIUS_KM = 10;
/** Ingredients one recipe search takes. */
export const RESOURCE_SEARCH_MAX_INGREDIENTS = 3;
/** Services and categories the panel lists at once (most links first; a picked one stays listed). */
export const RESOURCE_SEARCH_FACETS_SHOWN = 12;

/** Places a place's page lists under Nearby. */
export const RESOURCE_NEARBY_SHOWN = 6;
/** How far around a place its Nearby looks (km). */
export const RESOURCE_NEARBY_RADIUS_KM = 2;

/** The windows the Trending order offers (Pinakes takes `1h`–`90d`). */
export const RESOURCE_TRENDING_WINDOWS = ['24h', '7d', '30d'] as const;

/**
 * The sub-kinds a custom feed can list instead of a whole kind (the feed dialog's Type), each a
 * schema.org type Pinakes knows; a kind not listed is offered whole only.
 */
export const RESOURCE_FEED_SUB_KINDS: Readonly<Record<string, readonly string[]>> = {
  music: ['MusicRecording', 'MusicAlbum', 'MusicGroup', 'MusicPlaylist'],
  video: ['VideoObject', 'Movie', 'TVSeries', 'TVEpisode'],
  podcast: ['PodcastSeries', 'PodcastEpisode'],
  event: ['MusicEvent'],
  place: [
    'Restaurant',
    'CafeOrCoffeeShop',
    'BarOrPub',
    'Bakery',
    'Store',
    'GroceryStore',
    'Museum',
    'Hotel',
    'Park',
    'City',
  ],
  paper: ['ScholarlyArticle', 'Report'],
  article: ['NewsArticle', 'BlogPosting', 'DiscussionForumPosting'],
  software: ['SoftwareSourceCode', 'MobileApplication', 'WebApplication', 'VideoGame'],
};
