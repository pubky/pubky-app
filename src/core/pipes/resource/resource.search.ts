import {
  isPinakesReachSetServed,
  type RESOURCE_EVENT_WHEN,
  RESOURCE_FEED_SUB_KINDS,
  RESOURCE_KINDS,
  RESOURCE_MORE_KINDS,
  RESOURCE_SEARCH_DEFAULT_RADIUS_KM,
  RESOURCE_SEARCH_MAX_INGREDIENTS,
  RESOURCE_TRENDING_WINDOWS,
  RESOURCE_TYPE_LABELS,
  type TResourceIdentifier,
  type TResourceKind,
} from '@/config/pinakes';
import type { Pubky } from '@/models/models.types';
import type {
  TPinakesCard,
  TPinakesHostFacet,
  TPinakesTagFacet,
  TPinakesTypeFacet,
} from '@/services/pinakes/pinakes.types';

/**
 * The orders a resource search offers; `relevance` ranks how well a text matches (a text search only),
 * `upcoming` lists events by their start, soonest first (from now on, unless a date range says
 * otherwise), `distance` the nearest to a point first (a search around a point only).
 */
export type TResourceSearchSort = 'relevance' | 'activity' | 'trending' | 'recent' | 'upcoming' | 'distance';

/** A date range of the Events When section. */
export type TResourceEventWhen = (typeof RESOURCE_EVENT_WHEN)[number];

/** A point on the map (degrees). */
export type TResourcePoint = { lat: number; lon: number };

/** The counts a resource search can read besides types and tags. */
export type TResourceExtraFacet = 'host' | 'category';

/** How far back the Trending order counts references. */
export type TResourceTrendingWindow = (typeof RESOURCE_TRENDING_WINDOWS)[number];

/**
 * Whose references rank a resource: everyone's, or the viewer's network (Pinakes `reach`); `wot_2`
 * is My network, two steps of the follow graph, where the configured Pinakes serves it.
 */
export type TResourceSearchReach = 'all' | 'following' | 'friends' | 'wot_2';

/** What a resource search looks for. */
export type TResourceSearchInput =
  | { kind: 'all' }
  /** Resources tagged with any of `tags` (`match: 'all'`: with every one, at most 3). */
  | { kind: 'tags'; tags: readonly string[]; match?: 'all' }
  | { kind: 'text'; text: string }
  /** Every resource carrying one identifier (`isbn:…`, `isrc:…`, `wikidata:Q…`). */
  | { kind: 'key'; key: string }
  /** Resources related to one Pinakes card (`card.id`). */
  | { kind: 'related'; id: string };

export type TResourceQuery = {
  input: TResourceSearchInput;
  sort: TResourceSearchSort;
  reach: TResourceSearchReach;
  /** The signed-in viewer, for `reach` and for the network boost of All; `null` signed out. */
  viewer: Pubky | null;
  /** One row per thing (`collapse=group`): its other services show under Also on. */
  collapse: boolean;
  /** schema.org types to search (up to 10; Pinakes includes their subtypes); none for every type. */
  types?: readonly string[];
  /**
   * schema.org types to leave out, each with its subtypes (up to 50, Pinakes `exclude_type`): More kinds'
   * All types leaves out the kinds' own types. Pinakes then lists only links that have a type.
   */
  excludeTypes?: readonly string[];
  /** The window of the Trending order; the default one without. */
  window?: TResourceTrendingWindow;
  /** Only links this user shared (Pinakes `author`). */
  author?: Pubky | null;
  /** Only the links one collection holds: the collection post's URI (Pinakes `in_collection`). */
  inCollection?: string | null;
  /** Events starting from / up to (RFC 3339, or Pinakes' relative `now`). */
  from?: string;
  to?: string;
  /** Only what lies within `radiusKm` of this point. */
  near?: TResourcePoint;
  radiusKm?: number;
  /** One category (OpenStreetMap's `amenity/cafe`, as Pinakes `category=` takes it). */
  category?: string;
  /** Services, any of them: the links' hosts (`open.spotify.com`), up to 10. */
  hosts?: readonly string[];
  /** One identifier the resources carry (`isrc:…`, `isbn:…`), besides what the box searches. */
  key?: string;
  /** Job postings that may (`true`) or may not (`false`) be done remotely. */
  remote?: boolean;
  /** Also job postings past their closing date. */
  closed?: boolean;
  /** Recipes with every one of these ingredients (up to 3). */
  ingredients?: readonly string[];
  /** Also count these over the whole result, with `facets`. */
  extraFacets?: readonly TResourceExtraFacet[];
};

/** Tags one Pinakes search takes; `match=all` takes 3. */
export const RESOURCE_SEARCH_MAX_TAGS = 5;
export const RESOURCE_SEARCH_MAX_MATCH_ALL_TAGS = 3;
/** Types one Pinakes search takes (and a custom feed lists). */
export const RESOURCE_SEARCH_MAX_TYPES = 10;
/** Types one Pinakes search leaves out (`exclude_type`). */
export const RESOURCE_SEARCH_MAX_EXCLUDED_TYPES = 50;
/** Hosts one Pinakes search takes (and a custom feed keeps). */
export const RESOURCE_SEARCH_MAX_HOSTS = 10;
/** The window of the Trending order, without one picked. */
export const RESOURCE_SEARCH_TRENDING_WINDOW: TResourceTrendingWindow = '7d';

/** The identifier namespaces Pinakes `key=` reads (its `/llms.txt`), as typed: `isbn:978…`. */
const KEY_NAMESPACES = ['mbid', 'wikidata', 'isrc', 'upc', 'gtin', 'isbn', 'imdb', 'podcast', 'osm', 'doi'];
const KEY_PATTERN = new RegExp(`^(${KEY_NAMESPACES.join('|')}):\\S+$`, 'i');
const WIKIDATA_ID = /^Q\d+$/i;
const IMDB_ID = /^tt\d{7,8}$/i;

/**
 * What a search box input asks for: a web link (its card first), an identifier Pinakes reads with
 * `key=` (a bare Wikidata or IMDb id is spelled with its namespace), else text.
 */
export function classifyResourceSearchInput(
  raw: string,
): { kind: 'url'; url: string } | { kind: 'key'; key: string } | { kind: 'text'; text: string } {
  const value = raw.trim();
  if (/^https?:\/\/\S+$/i.test(value)) return { kind: 'url', url: value };
  if (KEY_PATTERN.test(value)) {
    const colon = value.indexOf(':');
    return { kind: 'key', key: `${value.slice(0, colon).toLowerCase()}${value.slice(colon)}` };
  }
  if (WIKIDATA_ID.test(value)) return { kind: 'key', key: `wikidata:${value.toUpperCase()}` };
  if (IMDB_ID.test(value)) return { kind: 'key', key: `imdb:${value.toLowerCase()}` };
  return { kind: 'text', text: value };
}

/**
 * Whether a link may be sent to Pinakes: it parses and carries no username or password, nor holds
 * another link that does (`hasCredentialLink`).
 */
export function isResolvableLink(uri: string): boolean {
  try {
    const url = new URL(uri);
    return !url.username && !url.password && !hasCredentialLink(uri);
  } catch {
    return false;
  }
}

/** Where a link starts: `scheme://`, or `http:`/`https:` with fewer or back slashes, as a browser reads them. */
const LINK_START = /[a-z][a-z\d+.-]*:\/\/|https?:[/\\]*/i;

/**
 * Whether a text holds the start of a link (`https:`, `scheme://`): while one is typed, what follows
 * may still become its username and password (`https://user:password` before the `@`).
 */
export function hasLinkStart(text: string): boolean {
  // A browser drops tabs and line breaks inside a link, as in `hasCredentialLink`
  return LINK_START.test(text.replace(/[\t\n\r]/g, ''));
}

/**
 * Whether a text holds a link that carries a username or password (`https://user:password@…`), also
 * where the rest of it does not parse (`<https://user@host>`) or it sits inside another link
 * (`https://host/?u=https://user@…`): such a text is never sent.
 */
export function hasCredentialLink(text: string): boolean {
  // A browser drops tabs and line breaks inside a link (`https://ali<tab>ce:pw@…` is `alice:pw@…`)
  return text
    .replace(/[\t\n\r]/g, '')
    .split(/\s+/)
    .some((token) => {
      const [, ...links] = token.split(LINK_START);
      return links.some((rest, index) => {
        // A username or password ends in `@` before the link's path, query or fragment; in a link held in
        // another link's query, `&` ends it too (the outer link's next parameter: `?url=https://a.org&text=@me`)
        const inQuery = /\?[^#]*$/.test(links.slice(0, index).join(''));
        return rest.split(inQuery ? /[/?#\\&]/ : /[/?#\\]/, 1)[0].includes('@');
      });
    });
}

/**
 * The `GET /v1/search` parameters of `query`: only what Pinakes applies, so a control the query
 * cannot carry is never sent. Facets (type and tags) come in the same request as the rows.
 */
export function buildResourceSearchParams(
  query: TResourceQuery,
  { limit, cursor, facets = false }: { limit: number; cursor?: string | null; facets?: boolean },
): Record<string, string> {
  const params: Record<string, string> = {};
  const { input } = query;
  if (input.kind === 'tags') {
    params.tags = input.tags.slice(0, RESOURCE_SEARCH_MAX_TAGS).join(',');
    if (input.match === 'all') params.match = 'all';
  } else if (input.kind === 'text') {
    params.q = input.text;
  } else if (input.kind === 'key') {
    params.key = input.key;
  } else if (input.kind === 'related') {
    params.related = input.id;
  }
  if (query.types && query.types.length > 0) params.type = query.types.slice(0, RESOURCE_SEARCH_MAX_TYPES).join(',');
  if (query.excludeTypes && query.excludeTypes.length > 0) {
    params.exclude_type = query.excludeTypes.slice(0, RESOURCE_SEARCH_MAX_EXCLUDED_TYPES).join(',');
  }
  // Related rows are ranked by Pinakes itself: they take no sort, no boost and no other filter
  const isRanked = input.kind !== 'related';
  // Relevance ranks how well a text matches, Nearest needs a point: anything else is ranked by activity
  const sort =
    (query.sort === 'relevance' && input.kind !== 'text') || (query.sort === 'distance' && !query.near)
      ? 'activity'
      : query.sort;
  if (!isRanked) {
    // no order of our own
  } else if (sort === 'trending') {
    params.sort = 'trending';
    params.window = query.window ?? RESOURCE_SEARCH_TRENDING_WINDOW;
  } else if (sort === 'upcoming') {
    params.sort = 'start';
    // From now on, unless the date range starts elsewhere
    if (!query.from && !query.to) params.from = 'now';
  } else {
    params.sort = sort;
  }
  if (isRanked) {
    if (query.from) params.from = query.from;
    if (query.to) params.to = query.to;
    if (query.near) {
      params.near = `${query.near.lat},${query.near.lon}`;
      params.radius = String(Math.round((query.radiusKm ?? RESOURCE_SEARCH_DEFAULT_RADIUS_KM) * 1000));
    }
    if (query.category) params.category = query.category;
    if (query.hosts?.length) params.host = query.hosts.slice(0, RESOURCE_SEARCH_MAX_HOSTS).join(',');
    // The box's own identifier wins: Pinakes takes one
    if (query.key && input.kind !== 'key') params.key = query.key;
    if (query.remote !== undefined) params.remote = String(query.remote);
    if (query.closed) params.closed = 'true';
    if (query.ingredients?.length) {
      params.ingredient = query.ingredients.slice(0, RESOURCE_SEARCH_MAX_INGREDIENTS).join(',');
    }
  }
  if (query.viewer && query.reach !== 'all') {
    params.reach = query.reach;
    params.viewer = query.viewer;
  } else if (query.viewer && isRanked && (sort === 'activity' || sort === 'trending' || sort === 'relevance')) {
    // Everyone's resources, the viewer's network first (My network where Pinakes serves it): Pinakes
    // boosts only the activity, trending and relevance ranks (a date order is a date order)
    params.boost = isPinakesReachSetServed() ? 'wot_2' : 'following';
    params.viewer = query.viewer;
  }
  // The people who tagged a related card are its own ranking: no author or collection narrows it
  if (isRanked && query.author) params.author = query.author;
  if (isRanked && query.inCollection) params.in_collection = query.inCollection;
  if (query.collapse) params.collapse = 'group';
  if (facets) params.facet = ['type', 'tags', ...new Set(query.extraFacets ?? [])].join(',');
  params.limit = String(limit);
  if (cursor) params.cursor = cursor;
  return params;
}

/**
 * Whether Nexus' resource stream can answer `query` as Pinakes would, for when Pinakes fails: every
 * resource or any of some tags, the latest tagged first, from everyone. Anything else has no
 * fallback: the stream would ignore the filter and answer more than was asked.
 */
export function isNexusRepresentable(query: TResourceQuery): boolean {
  const { input } = query;
  const isTagsOnly = input.kind === 'all' || (input.kind === 'tags' && input.match !== 'all');
  return (
    isTagsOnly &&
    !query.types?.length &&
    !query.excludeTypes?.length &&
    !query.author &&
    !query.inCollection &&
    !query.from &&
    !query.to &&
    !query.near &&
    !query.category &&
    !query.hosts?.length &&
    !query.key &&
    query.remote === undefined &&
    !query.closed &&
    !query.ingredients?.length &&
    query.sort === 'recent' &&
    query.reach === 'all'
  );
}

/** A schema.org type name as Pinakes takes it in `type=` (`MusicRecording`, `CafeOrCoffeeShop`). */
const TYPE_NAME = /^[A-Z][A-Za-z0-9]{0,63}$/;

/** Whether `value` is spelled as a schema.org type name. */
export const isResourceTypeName = (value: string) => TYPE_NAME.test(value);

/** The kind with this id, if it is one (not More kinds). */
export const getResourceKind = (id: string | null): TResourceKind | null =>
  RESOURCE_KINDS.find((kind) => kind.id === id) ?? null;

/** The types the kinds stand for: what More kinds' All types leaves out (`exclude_type`), each with its subtypes. */
export const getResourceKindsTypes = (): string[] => [...new Set(RESOURCE_KINDS.flatMap((kind) => kind.types))];

/** The kind a type of the index belongs to: the first one with one of its types on the type's path. */
export function getResourceKindOf(facet: Pick<TPinakesTypeFacet, 'type' | 'type_path'>): TResourceKind | null {
  const path = new Set([...facet.type_path, facet.type]);
  return RESOURCE_KINDS.find((kind) => kind.types.some((type) => path.has(type))) ?? null;
}

/** Whether a facet's type is `type` or one of its subtypes: what a search for `type` finds. */
const finds = (type: string, facet: Pick<TPinakesTypeFacet, 'type' | 'type_path'>) =>
  facet.type === type || facet.type_path.includes(type);

/**
 * The types of the index no kind stands for, as More kinds offers them: without a supertype of a kind's
 * types (`CreativeWork`, `Organization`), since searching for one would find most kinds too.
 */
function getMoreKindFacets(facets: readonly TPinakesTypeFacet[]): TPinakesTypeFacet[] {
  const inKinds = facets.filter((facet) => getResourceKindOf(facet) !== null);
  return facets.filter(
    (facet) => getResourceKindOf(facet) === null && !inKinds.some((other) => other.type_path.includes(facet.type)),
  );
}

/**
 * The kinds a type facet counts, in the order they are offered, plus More kinds: each the links a search
 * of it finds (Pinakes includes subtypes, so Articles & news counts the papers under `Article` too). More
 * kinds counts every type no kind stands for, a supertype of the kinds' (`CreativeWork`) included: what its
 * All types lists. Kinds the facet has no link of are left out.
 */
export function rollUpResourceKinds(facets: readonly TPinakesTypeFacet[]): { id: string; count: number }[] {
  const sum = (list: readonly TPinakesTypeFacet[]) => list.reduce((total, facet) => total + facet.count, 0);
  return [
    ...RESOURCE_KINDS.map((kind) => ({
      id: kind.id,
      count: sum(facets.filter((facet) => kind.types.some((type) => finds(type, facet)))),
    })),
    { id: RESOURCE_MORE_KINDS, count: sum(facets.filter((facet) => getResourceKindOf(facet) === null)) },
  ].filter((kind) => kind.count > 0);
}

/**
 * The sub-kinds of a kind (or of More kinds): the facet's types a search of the kind finds, most links
 * first, each counting its subtypes' links too (searching for it finds them).
 */
export function getResourceSubKinds(
  kindId: string,
  facets: readonly TPinakesTypeFacet[],
): { type: string; count: number }[] {
  const kind = getResourceKind(kindId);
  const ofKind = kind
    ? facets.filter((facet) => kind.types.some((type) => finds(type, facet)))
    : getMoreKindFacets(facets);
  return ofKind
    .map(({ type }) => ({
      type,
      count: facets.filter((facet) => finds(type, facet)).reduce((sum, facet) => sum + facet.count, 0),
    }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/** How a type reads as a chip: its label, else its name in words (`CafeOrCoffeeShop` → Cafe or coffee shop). */
export function getResourceTypeLabel(type: string): string {
  const label = RESOURCE_TYPE_LABELS[type];
  if (label) return label;
  const words = type.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return words.charAt(0) + words.slice(1).toLowerCase();
}

/**
 * One choice of what a custom feed lists: a kind or a sub-kind, `value` its types as the feed stores them;
 * `kind` is the kind's label, which a sub-kind's reads with for a screen reader, `kindId` the kind's id.
 */
export type TResourceFeedTypeOption = {
  value: string;
  label: string;
  kind: string;
  kindId: string;
  isSubKind: boolean;
};

/** A feed's types as one value: sorted by code point and joined, as the specs store them in `content`. */
export const toResourceFeedTypesValue = (types: readonly string[]): string =>
  [...new Set(types)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(',');

/** What the feed dialog's Type offers, in the order of the search's kinds: each kind, then its sub-kinds. */
export function getResourceFeedTypeOptions(): TResourceFeedTypeOption[] {
  return RESOURCE_KINDS.flatMap((kind) => [
    {
      value: toResourceFeedTypesValue(kind.types),
      label: kind.label,
      kind: kind.label,
      kindId: kind.id,
      isSubKind: false,
    },
    ...(RESOURCE_FEED_SUB_KINDS[kind.id] ?? []).map((type) => ({
      value: type,
      label: getResourceTypeLabel(type),
      kind: kind.label,
      kindId: kind.id,
      isSubKind: true,
    })),
  ]);
}

/** How a feed's types read: the kind they make up (`Music`), else each type's label (`Songs, Albums`). */
export function getResourceTypesLabel(types: readonly string[]): string {
  const value = toResourceFeedTypesValue(types);
  const kind = RESOURCE_KINDS.find((candidate) => toResourceFeedTypesValue(candidate.types) === value);
  return kind ? kind.label : types.map(getResourceTypeLabel).join(', ');
}

/** The tag labels a tags facet offers to narrow by, without the ones already searched. */
export function getRelatedResourceTags(facets: readonly TPinakesTagFacet[], searched: readonly string[]): string[] {
  return facets.map((facet) => facet.label).filter((label) => !searched.includes(label));
}

/**
 * The link a search row shows: the first web link people wrote for the card (Nexus knows its tags
 * by it), else the card's own link (`isbn:`, `geo:`, a DOI).
 */
export function getResourceSearchRowUri(card: Pick<TPinakesCard, 'uri' | 'refs'>): string {
  return card.refs.find((ref) => /^https?:\/\//i.test(ref)) ?? card.uri;
}

/**
 * The Pinakes reach of a feed's or the Home filter's reach: everyone, Following, Friends, or My
 * network (`network`, a feed's `wot`) as `wot_2` where the configured Pinakes serves it. `null` for
 * one Pinakes serves no reach for: Me and Followers, and My network elsewhere (`wot_2` needs a
 * Nexus that serves reach sets; Pinakes answers 501 without). Such a reach is not listed and never
 * sent.
 */
export function toResourceSearchReach(reach: string): TResourceSearchReach | null {
  switch (reach) {
    case 'all':
      return 'all';
    case 'following':
      return 'following';
    case 'friends':
      return 'friends';
    case 'network':
    case 'wot':
      return isPinakesReachSetServed() ? 'wot_2' : null;
    default:
      return null;
  }
}

/** The order of a feed's or the Home filter's sort: Recent, or Popularity as Pinakes' activity rank. */
export function toResourceSearchSort(sort: string): TResourceSearchSort {
  return sort === 'popularity' || sort === 'total_engagement' ? 'activity' : 'recent';
}

/** How each identifier is spelled once read: its pattern, and how it is written for Pinakes. */
const IDENTIFIERS: Record<TResourceIdentifier, { pattern: RegExp; normalize: (value: string) => string }> = {
  isrc: { pattern: /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/, normalize: (value) => value.replace(/[\s-]/g, '').toUpperCase() },
  upc: { pattern: /^\d{12,14}$/, normalize: (value) => value.replace(/[\s-]/g, '') },
  mbid: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    normalize: (value) => value.toLowerCase(),
  },
  isbn: { pattern: /^(\d{9}[\dX]|97[89]\d{10})$/, normalize: (value) => value.replace(/[\s-]/g, '').toUpperCase() },
  doi: { pattern: /^10\.\d{4,9}\/\S+$/, normalize: (value) => value },
};

/** Spellings that carry an identifier inside a link: a DOI link, a MusicBrainz page. */
const IDENTIFIER_LINKS: { pattern: RegExp; namespace: TResourceIdentifier }[] = [
  { pattern: /^https?:\/\/(?:dx\.)?doi\.org\/(10\..+)$/i, namespace: 'doi' },
  {
    pattern: /^https?:\/\/(?:[a-z]+\.)?musicbrainz\.org\/(?:recording|release|release-group|artist)\/([0-9a-f-]{36})/i,
    namespace: 'mbid',
  },
];

/**
 * The `key=` of what the Identifier box holds, when it is one of `namespaces`: an identifier as
 * written (`isbn:978…`, `USQX91300108`, `978-3-16-148410-0`), a DOI link or a MusicBrainz page.
 * `null` for anything else.
 */
export function parseResourceIdentifier(raw: string, namespaces: readonly TResourceIdentifier[]): string | null {
  let value = raw.trim();
  let named: TResourceIdentifier | null = null;
  for (const link of IDENTIFIER_LINKS) {
    const match = link.pattern.exec(value);
    if (match) {
      named = link.namespace;
      try {
        value = decodeURIComponent(match[1]);
      } catch {
        return null; // a broken escape (`%` alone) names nothing
      }
      break;
    }
  }
  const prefix = /^([a-z]+):(.+)$/i.exec(value);
  if (!named && prefix && prefix[1].toLowerCase() in IDENTIFIERS) {
    named = prefix[1].toLowerCase() as TResourceIdentifier;
    value = prefix[2].trim();
  }
  for (const namespace of named ? [named] : namespaces) {
    if (!namespaces.includes(namespace)) continue;
    const spelled = IDENTIFIERS[namespace].normalize(value);
    if (IDENTIFIERS[namespace].pattern.test(spelled)) return `${namespace}:${spelled}`;
  }
  return null;
}

/** An ingredient as Pinakes takes it: letters, digits, spaces and hyphens. */
const INGREDIENT = /^[\p{L}\p{N}][\p{L}\p{N} -]{0,63}$/u;

/** The ingredient as searched (trimmed, single spaces, lower case), or `null` when Pinakes would refuse it. */
export function parseResourceIngredient(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return INGREDIENT.test(value) ? value : null;
}

/** How a category reads (`amenity/place_of_worship` → Place of worship). */
export function getResourceCategoryLabel(category: string): string {
  const value = category
    .slice(category.lastIndexOf('/') + 1)
    .replace(/[_-]+/g, ' ')
    .trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : category;
}

/** A local date and time as RFC 3339 in UTC, to the second. */
const toRfc3339 = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
/** A `YYYY-MM-DD` day as the viewer's local day. */
const parseDay = (value: string | null) => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  // `Date` reads years below 100 as 19xx: no event search needs one
  if (year < 1000) return null;
  const date = new Date(year, month, day);
  // `Date` rolls an impossible day over (31 February → 3 March)
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
};

/** Whether `day` is a real `YYYY-MM-DD` day. */
export const isResourceSearchDay = (day: string) => parseDay(day) !== null;

/**
 * The start-time range of an Events When choice, in the viewer's own days (weeks end on Sunday):
 * Upcoming from now on, Today / This weekend / This week / This month from now to that day's end,
 * Past up to now, Dates from the first day's start to the last day's end (either may be open).
 */
export function getResourceEventRange(
  when: TResourceEventWhen,
  now: Date,
  dates: { from: string | null; to: string | null } = { from: null, to: null },
): { from?: string; to?: string } {
  const weekday = (now.getDay() + 6) % 7; // Monday 0 … Sunday 6
  const sunday = addDays(now, 6 - weekday);
  switch (when) {
    case 'today':
      return { from: 'now', to: toRfc3339(endOfDay(now)) };
    case 'weekend': {
      const saturday = addDays(sunday, -1);
      return { from: now < saturday ? toRfc3339(saturday) : 'now', to: toRfc3339(endOfDay(sunday)) };
    }
    case 'week':
      return { from: 'now', to: toRfc3339(endOfDay(sunday)) };
    case 'month':
      return { from: 'now', to: toRfc3339(endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))) };
    case 'past':
      return { to: 'now' };
    case 'dates': {
      const days = [parseDay(dates.from), parseDay(dates.to)];
      // Days picked the wrong way round still mean the days between them
      const [first, last] = days[0] && days[1] && days[1] < days[0] ? [days[1], days[0]] : days;
      if (!first && !last) return { from: 'now' };
      return {
        ...(first ? { from: toRfc3339(startOfDay(first)) } : {}),
        ...(last ? { to: toRfc3339(endOfDay(last)) } : {}),
      };
    }
    default:
      return { from: 'now' };
  }
}

/** One service as the Service filter lists it: its name, the hosts it is on, and their links together. */
export type TResourceService = { name: string; hosts: string[]; count: number };

/**
 * A search's services, one per name (the host facet's `site`, else the host; compared without case,
 * as a card's Also on lists each service once): Amazon Music on `music.amazon.co.uk` and
 * `music.amazon.com` is one service with both hosts, in the facet's order, and their links summed.
 * Most links first. A host of `hosts` the facet does not list is its own service (named by the
 * host, no links), so a picked one stays listed.
 */
export function getResourceServices(
  facets: readonly TPinakesHostFacet[] | null | undefined,
  hosts: readonly string[] = [],
): TResourceService[] {
  const services = new Map<string, TResourceService>();
  const add = (host: string, name: string, count: number) => {
    const key = name.toLowerCase();
    const service = services.get(key);
    if (!service) services.set(key, { name, hosts: [host], count });
    else if (!service.hosts.includes(host)) {
      service.hosts.push(host);
      service.count += count;
    }
  };
  for (const { host, site, count } of facets ?? []) add(host, (site || '').trim() || host, count);
  for (const host of hosts) {
    if (![...services.values()].some((service) => service.hosts.includes(host))) add(host, host, 0);
  }
  return [...services.values()].sort((a, b) => b.count - a.count);
}

/**
 * The links on `hosts`, counted per host: Pinakes names each host's service in that facet, which is
 * where a saved feed's services get their names (one small read).
 */
export function getResourceServicesQuery(hosts: readonly string[]): TResourceQuery {
  return {
    input: { kind: 'all' },
    sort: 'activity',
    reach: 'all',
    viewer: null,
    collapse: false,
    hosts,
    extraFacets: ['host'],
  };
}
