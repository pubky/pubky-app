'use client';

import { useSearchParams } from 'next/navigation';
import { limits } from 'pubky-social-specs';
import { APP_ROUTES } from '@/app/routes';
import {
  RESOURCE_EVENT_WHEN,
  RESOURCE_KIND_IDENTIFIERS,
  RESOURCE_KIND_SECTIONS,
  RESOURCE_MORE_KINDS,
  RESOURCE_SEARCH_DEFAULT_RADIUS_KM,
  RESOURCE_SEARCH_MAX_INGREDIENTS,
  RESOURCE_TRENDING_WINDOWS,
  type TResourceKindSection,
} from '@/config/pinakes';
import { canonicalizeTagLabel, isPubkyIdentifier, stripPubkyPrefix } from '@/libs/utils/utils';
import type { Pubky } from '@/models/models.types';
import {
  getResourceKind,
  isResourceSearchDay,
  isResourceTypeName,
  parseResourceIdentifier,
  parseResourceIngredient,
  RESOURCE_SEARCH_MAX_HOSTS,
  RESOURCE_SEARCH_MAX_MATCH_ALL_TAGS,
  RESOURCE_SEARCH_MAX_TYPES,
  RESOURCE_SEARCH_TRENDING_WINDOW,
  type TResourceEventWhen,
  type TResourcePoint,
  type TResourceSearchSort,
  type TResourceTrendingWindow,
} from '@/pipes/resource/resource.search';
import { useCustomResourceFeedStore } from '@/stores/customResourceFeed/customResourceFeed.store';

/** The filters of the External resources search, as the `/search` URL spells them. */
export type TResourceSearchFilters = {
  /** A kind's id, `more` for More kinds, `null` for every kind. */
  kind: string | null;
  /** Sub-kinds picked within the kind (schema.org types); none: the whole kind. */
  types: string[];
  /** The order picked; `null` for the search's default (Relevance for a text, else Popular). */
  sort: TResourceSearchSort | null;
  window: TResourceTrendingWindow;
  /** Whether a search of several tags wants every one of them on a resource. */
  match: 'any' | 'all';
  /** One row per thing (`collapse=group`); off lists every link. */
  collapse: boolean;
  /** Only links this user shared. */
  author: Pubky | null;
  /** Only links one collection holds (its post's URI). */
  inCollection: string | null;
  /** Related tags picked to narrow a tag search: every searched and picked tag must match. */
  narrowTags: string[];
  /** Events: the date range picked; `null` for Upcoming. */
  when: TResourceEventWhen | null;
  /** Events, with When = Dates: the first and last day (`YYYY-MM-DD`, the viewer's own days). */
  dateFrom: string | null;
  dateTo: string | null;
  /** Events and places: only around this point. */
  near: TResourcePoint | null;
  /** The name of the place the point is (`null` for the viewer's own location). */
  place: string | null;
  /** The distance around the point (whole km, 1 to 200); `null` for the default. */
  radius: number | null;
  /** Places: one category (`amenity/cafe`). */
  category: string | null;
  /** Music, videos, podcasts: services, any of them (the links' hosts, up to 10); none for every one. */
  hosts: string[];
  /** One identifier (`isrc:…`, `isbn:…`) from the Identifier box. */
  key: string | null;
  /** Jobs: remote (`yes`) or on site (`no`); `null` for either. */
  remote: 'yes' | 'no' | null;
  /** Jobs: also postings past their closing date. */
  closed: boolean;
  /** Recipes: every one of these ingredients (up to 3). */
  ingredients: string[];
};

/** The URL parameter of each filter. */
export const RESOURCE_SEARCH_PARAMS = {
  kind: 'kind',
  types: 'type',
  sort: 'sort',
  window: 'window',
  match: 'match',
  collapse: 'rows',
  author: 'by',
  inCollection: 'in',
  narrowTags: 'and',
  when: 'when',
  dateFrom: 'from',
  dateTo: 'to',
  near: 'near',
  place: 'place',
  radius: 'radius',
  category: 'category',
  hosts: 'service',
  key: 'id',
  remote: 'remote',
  closed: 'closed',
  ingredients: 'ingredient',
} as const satisfies Record<keyof TResourceSearchFilters, string>;

/** How each order is spelled in the URL. */
const SORT_PARAMS: Record<TResourceSearchSort, string> = {
  relevance: 'relevance',
  activity: 'popular',
  trending: 'trending',
  recent: 'recent',
  upcoming: 'upcoming',
  distance: 'nearest',
};

/** The filters at their defaults (a plain search). */
const DEFAULTS: TResourceSearchFilters = {
  kind: null,
  types: [],
  sort: null,
  window: RESOURCE_SEARCH_TRENDING_WINDOW,
  match: 'any',
  collapse: true,
  author: null,
  inCollection: null,
  narrowTags: [],
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

/** The filters each kind-only section holds: picking another kind leaves out the ones it has no section for. */
const SECTION_FILTERS: Record<TResourceKindSection, (keyof TResourceSearchFilters)[]> = {
  when: ['when', 'dateFrom', 'dateTo'],
  where: ['near', 'place', 'radius'],
  category: ['category'],
  service: ['hosts'],
  identifier: ['key'],
  jobs: ['remote', 'closed'],
  ingredients: ['ingredients'],
};

/** The kind-only sections a kind (or none, or More kinds) has. */
export const getResourceKindSections = (kind: string | null): readonly TResourceKindSection[] =>
  (kind && RESOURCE_KIND_SECTIONS[kind]) || [];

/**
 * The patch that picks `kind`: its sub-kinds start over, and every filter set is cleared unless both
 * the old and the new kind have its section (Events and Places share Where, so the point stays; an
 * identifier stays only between kinds that take the same ones). A filter left in the URL that the
 * old kind did not apply never comes into effect with the new one.
 */
export function pickResourceKind(
  filters: TResourceSearchFilters,
  kind: string | null,
): Partial<TResourceSearchFilters> & { kind: string | null } {
  const patch: Partial<TResourceSearchFilters> & { kind: string | null } = { kind, types: [] };
  const had = new Set(getResourceKindSections(filters.kind));
  const keeps = new Set(getResourceKindSections(kind).filter((section) => had.has(section)));
  const sameIdentifiers =
    JSON.stringify(RESOURCE_KIND_IDENTIFIERS[filters.kind ?? ''] ?? []) ===
    JSON.stringify(RESOURCE_KIND_IDENTIFIERS[kind ?? ''] ?? []);
  const sections = Object.entries(SECTION_FILTERS) as [TResourceKindSection, (keyof TResourceSearchFilters)[]][];
  for (const [section, names] of sections) {
    if (keeps.has(section) && (section !== 'identifier' || sameIdentifiers)) continue;
    for (const name of names) {
      if (JSON.stringify(filters[name]) !== JSON.stringify(DEFAULTS[name])) {
        Object.assign(patch, { [name]: DEFAULTS[name] });
      }
    }
  }
  return patch;
}

/** `rows=` value that lists every link instead of one row per thing. */
const EVERY_LINK = 'links';
/** Longest collection URI taken from the URL (Pinakes refuses longer URIs). */
const MAX_COLLECTION_URI = 2048;
/** A post's URI on a user's homeserver (`pubky://<public key>/pub/…/posts/<id>`), as a collection is. */
const COLLECTION_URI =
  /^pubky:\/\/([a-z0-9]{52})\/pub\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*\/posts\/[A-Za-z0-9._~-]+$/;

/** A host as Pinakes `host=` takes it (`open.spotify.com`). */
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
/** A category as Pinakes `category=` takes it (`amenity/cafe`, a page's own category), at most 256 bytes. */
const CATEGORY = /^[^\s/][^\p{Cc}]{0,255}$/u;
/** Points are kept to about a metre. */
const roundDegrees = (value: number) => Math.round(value * 1e5) / 1e5;

/** A `lat,lon` point in degrees, or `null`. */
function parsePoint(value: string | null): TResourcePoint | null {
  const match = value ? /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(value.trim()) : null;
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat: roundDegrees(lat), lon: roundDegrees(lon) } : null;
}

/** How a point is spelled in the URL (and for Pinakes `near=`). */
export const formatResourcePoint = (point: TResourcePoint) => `${roundDegrees(point.lat)},${roundDegrees(point.lon)}`;

const list = (value: string | null) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * The filters a `/search` URL carries. Anything Pinakes would refuse or that names nothing known is
 * read as not set: an unknown kind, a type not spelled as a schema.org name, more than 10 types, an
 * author that is no public key, a collection that is no post URI (`pubky://<key>/pub/…/posts/<id>`).
 */
export function parseResourceSearchFilters(params: Pick<URLSearchParams, 'get'> | null): TResourceSearchFilters {
  const get = (name: string) => params?.get(name) ?? null;
  const kind = get(RESOURCE_SEARCH_PARAMS.kind);
  const sort = get(RESOURCE_SEARCH_PARAMS.sort);
  const trendWindow = get(RESOURCE_SEARCH_PARAMS.window);
  const author = stripPubkyPrefix(get(RESOURCE_SEARCH_PARAMS.author) ?? '');
  const inCollection = get(RESOURCE_SEARCH_PARAMS.inCollection);
  const when = get(RESOURCE_SEARCH_PARAMS.when);
  const day = (name: string) => {
    const value = get(name);
    return value && isResourceSearchDay(value) ? value : null;
  };
  const near = parsePoint(get(RESOURCE_SEARCH_PARAMS.near));
  // A place's name shown for the point, cut in code points as the specs count it (never half a surrogate pair)
  const place =
    [...(get(RESOURCE_SEARCH_PARAMS.place)?.trim() ?? '')].slice(0, limits.feedFilterPlaceMaxLength).join('') || null;
  const radius = Number(get(RESOURCE_SEARCH_PARAMS.radius));
  const category = get(RESOURCE_SEARCH_PARAMS.category);
  const key = get(RESOURCE_SEARCH_PARAMS.key);
  const remote = get(RESOURCE_SEARCH_PARAMS.remote);
  return {
    kind: kind === RESOURCE_MORE_KINDS || getResourceKind(kind) ? kind : null,
    types: [...new Set(list(get(RESOURCE_SEARCH_PARAMS.types)).filter(isResourceTypeName))].slice(
      0,
      RESOURCE_SEARCH_MAX_TYPES,
    ),
    sort: (Object.keys(SORT_PARAMS) as TResourceSearchSort[]).find((key) => SORT_PARAMS[key] === sort) ?? null,
    window: RESOURCE_TRENDING_WINDOWS.find((value) => value === trendWindow) ?? RESOURCE_SEARCH_TRENDING_WINDOW,
    match: get(RESOURCE_SEARCH_PARAMS.match) === 'all' ? 'all' : 'any',
    collapse: get(RESOURCE_SEARCH_PARAMS.collapse) !== EVERY_LINK,
    author: isPubkyIdentifier(author) ? author : null,
    inCollection:
      inCollection &&
      inCollection.length <= MAX_COLLECTION_URI &&
      isPubkyIdentifier(COLLECTION_URI.exec(inCollection)?.[1] ?? '')
        ? inCollection
        : null,
    narrowTags: [...new Set(list(get(RESOURCE_SEARCH_PARAMS.narrowTags)).map(canonicalizeTagLabel))]
      .filter(Boolean)
      .slice(0, RESOURCE_SEARCH_MAX_MATCH_ALL_TAGS - 1),
    when: RESOURCE_EVENT_WHEN.find((value) => value === when && value !== 'upcoming') ?? null,
    dateFrom: when === 'dates' ? day(RESOURCE_SEARCH_PARAMS.dateFrom) : null,
    dateTo: when === 'dates' ? day(RESOURCE_SEARCH_PARAMS.dateTo) : null,
    near,
    place: near ? place : null,
    // Any whole distance the specs take (another client's 25 km too), not only the ones the panel offers
    radius:
      near &&
      Number.isInteger(radius) &&
      radius >= 1 &&
      radius <= limits.feedFilterRadiusMaxKm &&
      radius !== RESOURCE_SEARCH_DEFAULT_RADIUS_KM
        ? radius
        : null,
    category: category && CATEGORY.test(category) && new TextEncoder().encode(category).length <= 256 ? category : null,
    // One host (a link shared before several could be picked) or several, comma-separated
    hosts: [
      ...new Set(
        list(get(RESOURCE_SEARCH_PARAMS.hosts))
          .map((host) => host.toLowerCase())
          .filter((host) => HOST.test(host)),
      ),
    ].slice(0, RESOURCE_SEARCH_MAX_HOSTS),
    // Only an identifier spelled as the box writes it (`isbn:978…`)
    key: key && parseResourceIdentifier(key, ['isrc', 'upc', 'mbid', 'isbn', 'doi']) === key ? key : null,
    remote: remote === 'yes' || remote === 'no' ? remote : null,
    closed: get(RESOURCE_SEARCH_PARAMS.closed) === '1',
    ingredients: [
      ...new Set(
        list(get(RESOURCE_SEARCH_PARAMS.ingredients))
          .map(parseResourceIngredient)
          .filter((value): value is string => value !== null),
      ),
    ].slice(0, RESOURCE_SEARCH_MAX_INGREDIENTS),
  };
}

/**
 * Whether a `/search` URL carries any External resources filter it can apply (it then opens that tab):
 * a parameter read as not set (`kind=unknown`) does not count.
 */
export function hasResourceSearchFilters(params: Pick<URLSearchParams, 'get'> | null): boolean {
  return JSON.stringify(parseResourceSearchFilters(params)) !== JSON.stringify(parseResourceSearchFilters(null));
}

/** The filters a feed's External resources take: Search's own (shared by, in a collection, related tags, tag match) left out. */
export const toResourceFeedFilters = (filters: TResourceSearchFilters): TResourceSearchFilters => ({
  ...filters,
  author: null,
  inCollection: null,
  narrowTags: [],
  match: 'any',
});

/** Whether a URL carries any filter a feed's External resources apply (`toResourceFeedFilters`). */
export const hasResourceFeedFilters = (params: Pick<URLSearchParams, 'get'> | null): boolean =>
  JSON.stringify(toResourceFeedFilters(parseResourceSearchFilters(params))) !==
  JSON.stringify(parseResourceSearchFilters(null));

/**
 * Whether the filters alone, with no text or tags, are a search: the links one user shared, or the
 * ones a collection holds (the entry points from a profile and a collection). Any other filter
 * narrows a search; alone it would list the whole index.
 */
export const isResourceFiltersSearch = (filters: TResourceSearchFilters) =>
  filters.author !== null || filters.inCollection !== null;

/** How the filters are written: `keepEmpty`, the parameters kept as empty (`when=`) at their default. */
type TResourceSearchWriteOptions = { keepEmpty?: readonly string[] };

/**
 * The URL parameters with `patch` applied: a filter at its default is left out, so a plain search
 * keeps its plain URL, unless `keepEmpty` names it (a custom feed's saved filter the viewer cleared,
 * which the feed would otherwise seed again). Every other parameter (`q`, `tags`) stays as it is.
 */
export function writeResourceSearchFilters(
  params: URLSearchParams,
  patch: Partial<TResourceSearchFilters>,
  { keepEmpty = [] }: TResourceSearchWriteOptions = {},
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (name: string, value: string | null) => {
    if (value) next.set(name, value);
    else if (keepEmpty.includes(name)) next.set(name, '');
    else next.delete(name);
  };
  if ('kind' in patch) set(RESOURCE_SEARCH_PARAMS.kind, patch.kind ?? null);
  if ('types' in patch) set(RESOURCE_SEARCH_PARAMS.types, patch.types?.join(',') || null);
  if ('sort' in patch) set(RESOURCE_SEARCH_PARAMS.sort, patch.sort ? SORT_PARAMS[patch.sort] : null);
  if ('window' in patch) {
    set(
      RESOURCE_SEARCH_PARAMS.window,
      patch.window === RESOURCE_SEARCH_TRENDING_WINDOW ? null : (patch.window ?? null),
    );
  }
  if ('match' in patch) set(RESOURCE_SEARCH_PARAMS.match, patch.match === 'all' ? 'all' : null);
  if ('collapse' in patch) set(RESOURCE_SEARCH_PARAMS.collapse, patch.collapse === false ? EVERY_LINK : null);
  if ('author' in patch) set(RESOURCE_SEARCH_PARAMS.author, patch.author ?? null);
  if ('inCollection' in patch) set(RESOURCE_SEARCH_PARAMS.inCollection, patch.inCollection ?? null);
  if ('narrowTags' in patch) set(RESOURCE_SEARCH_PARAMS.narrowTags, patch.narrowTags?.join(',') || null);
  if ('when' in patch) set(RESOURCE_SEARCH_PARAMS.when, patch.when === 'upcoming' ? null : (patch.when ?? null));
  if ('dateFrom' in patch) set(RESOURCE_SEARCH_PARAMS.dateFrom, patch.dateFrom ?? null);
  if ('dateTo' in patch) set(RESOURCE_SEARCH_PARAMS.dateTo, patch.dateTo ?? null);
  if ('near' in patch) set(RESOURCE_SEARCH_PARAMS.near, patch.near ? formatResourcePoint(patch.near) : null);
  if ('place' in patch) set(RESOURCE_SEARCH_PARAMS.place, patch.place ?? null);
  if ('radius' in patch) {
    set(
      RESOURCE_SEARCH_PARAMS.radius,
      patch.radius && patch.radius !== RESOURCE_SEARCH_DEFAULT_RADIUS_KM ? String(patch.radius) : null,
    );
  }
  if ('category' in patch) set(RESOURCE_SEARCH_PARAMS.category, patch.category ?? null);
  if ('hosts' in patch) set(RESOURCE_SEARCH_PARAMS.hosts, patch.hosts?.join(',') || null);
  if ('key' in patch) set(RESOURCE_SEARCH_PARAMS.key, patch.key ?? null);
  if ('remote' in patch) set(RESOURCE_SEARCH_PARAMS.remote, patch.remote ?? null);
  if ('closed' in patch) set(RESOURCE_SEARCH_PARAMS.closed, patch.closed ? '1' : null);
  if ('ingredients' in patch) set(RESOURCE_SEARCH_PARAMS.ingredients, patch.ingredients?.join(',') || null);
  return next;
}

/**
 * A `/search` URL that lists external resources only, with these filters and no text or tags: the
 * links one user shared (`author`), or the ones a collection holds (`inCollection`).
 */
export function getResourceSearchUrl(patch: Partial<TResourceSearchFilters>): string {
  return `${APP_ROUTES.SEARCH}?${writeResourceSearchFilters(new URLSearchParams(), patch).toString()}`;
}

/** The URL parameters without any External resources filter (the ones `keepEmpty` names kept as empty). */
export function clearResourceSearchFilters(
  params: URLSearchParams,
  { keepEmpty = [] }: TResourceSearchWriteOptions = {},
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const name of Object.values(RESOURCE_SEARCH_PARAMS)) {
    if (keepEmpty.includes(name)) next.set(name, '');
    else next.delete(name);
  }
  return next;
}

/**
 * Puts `params` in the address bar in place of the current entry. A `null` state is Next's documented
 * way to keep `useSearchParams` in step (it adds its own state); passing its state back would mark the
 * call as Next's own and leave the page unaware of the change.
 */
function replaceSearch(params: URLSearchParams) {
  const search = params.toString();
  const { pathname, hash } = window.location;
  window.history.replaceState(null, '', `${pathname}${search ? `?${search}` : ''}${hash}`);
}

/**
 * The External resources filters of `/search`, kept in its URL so a search can be shared and survives a
 * reload. Changing one replaces the current history entry (flipping filters adds no Back steps).
 */
export function useResourceSearchFilters(): {
  filters: TResourceSearchFilters;
  hasFilters: boolean;
  /** The filters alone are a search (`isResourceFiltersSearch`). */
  isFiltersSearch: boolean;
  setFilters: (patch: Partial<TResourceSearchFilters>) => void;
  clearFilters: () => void;
} {
  const searchParams = useSearchParams();
  const filters = parseResourceSearchFilters(searchParams);
  return {
    filters,
    hasFilters: hasResourceSearchFilters(searchParams),
    isFiltersSearch: isResourceFiltersSearch(filters),
    // The live URL, not the render's copy: two changes in one event both stay. On a custom feed's
    // page, a filter the feed saved stays as empty once cleared, so a reload does not seed it again
    setFilters: (patch) =>
      replaceSearch(
        writeResourceSearchFilters(new URLSearchParams(window.location.search), patch, {
          keepEmpty: useCustomResourceFeedStore.getState().savedParams,
        }),
      ),
    clearFilters: () =>
      replaceSearch(
        clearResourceSearchFilters(new URLSearchParams(window.location.search), {
          keepEmpty: useCustomResourceFeedStore.getState().savedParams,
        }),
      ),
  };
}
