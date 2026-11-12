import { limits } from 'pubky-social-specs';
import {
  RESOURCE_FEED_SUB_KINDS,
  RESOURCE_KIND_IDENTIFIERS,
  RESOURCE_KINDS,
  RESOURCE_MORE_KINDS,
  RESOURCE_SEARCH_DEFAULT_RADIUS_KM,
  type TResourceKindSection,
} from '@/config/pinakes';
import {
  formatResourcePoint,
  getResourceKindSections,
  parseResourceSearchFilters,
  pickResourceKind,
  RESOURCE_SEARCH_PARAMS,
  type TResourceSearchFilters,
  writeResourceSearchFilters,
} from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { getResourceSearchSorts } from '@/hooks/useSearchResourceQuery/useSearchResourceQuery';
import type { TFeedResourceFilterName, TFeedResourceFilters } from '@/models/feed/feed.schema';
import {
  getResourceKindsTypes,
  parseResourceIdentifier,
  RESOURCE_SEARCH_TRENDING_WINDOW,
  toResourceFeedTypesValue,
  type TResourceSearchSort,
} from '@/pipes/resource/resource.search';

/**
 * The kind and sub-kinds a feed's types are: a whole kind, or types within one; `null` for none, and
 * for types of several kinds (another client's), which the Kind filter cannot show.
 */
export function toKindAndTypes(types: readonly string[] | null | undefined): { kind: string; types: string[] } | null {
  if (!types?.length) return null;
  const value = toResourceFeedTypesValue(types);
  const whole = RESOURCE_KINDS.find((kind) => toResourceFeedTypesValue(kind.types) === value);
  if (whole) return { kind: whole.id, types: [] };
  const within = RESOURCE_KINDS.find((kind) =>
    types.every((type) => kind.types.includes(type) || RESOURCE_FEED_SUB_KINDS[kind.id]?.includes(type)),
  );
  return within ? { kind: within.id, types: [...types] } : null;
}

/**
 * The URL parameters of a saved resources feed: its types as the Kind and Type filters (a feed of every
 * type that leaves some out, `exclude_types`, is More kinds), and its saved filters as the panel spells
 * them, so a feed opens with the filters it was saved with.
 */
export function toFeedResourceParams(
  types: readonly string[] | null | undefined,
  filters: TFeedResourceFilters | null | undefined,
): URLSearchParams {
  const params = new URLSearchParams();
  const set = (name: string, value: string | null | undefined) => {
    if (value) params.set(name, value);
  };
  const f = filters ?? {};
  const kind = !types?.length && f.exclude_types ? { kind: RESOURCE_MORE_KINDS, types: [] } : toKindAndTypes(types);
  set(RESOURCE_SEARCH_PARAMS.kind, kind?.kind);
  set(RESOURCE_SEARCH_PARAMS.types, kind?.types.join(','));
  set(RESOURCE_SEARCH_PARAMS.when, f.when ?? (f.from || f.to ? 'dates' : null));
  set(RESOURCE_SEARCH_PARAMS.dateFrom, f.from);
  set(RESOURCE_SEARCH_PARAMS.dateTo, f.to);
  set(RESOURCE_SEARCH_PARAMS.near, f.near);
  set(RESOURCE_SEARCH_PARAMS.radius, f.radius);
  set(RESOURCE_SEARCH_PARAMS.place, f.place);
  set(RESOURCE_SEARCH_PARAMS.category, f.category);
  set(RESOURCE_SEARCH_PARAMS.hosts, f.host);
  set(RESOURCE_SEARCH_PARAMS.key, f.key);
  set(RESOURCE_SEARCH_PARAMS.remote, f.remote);
  set(RESOURCE_SEARCH_PARAMS.closed, f.closed === 'yes' ? '1' : null);
  set(RESOURCE_SEARCH_PARAMS.ingredients, f.ingredients);
  // The specs spell the orders as the URL does (`trending`, `upcoming`, `nearest`)
  set(RESOURCE_SEARCH_PARAMS.sort, f.sort);
  set(RESOURCE_SEARCH_PARAMS.window, f.window);
  set(RESOURCE_SEARCH_PARAMS.collapse, f.rows);
  return params;
}

/**
 * The URL with a saved feed's parameters under it: what the URL sets wins, an empty one too (a saved
 * filter the viewer cleared, `when=`), and a Kind in the URL brings its own sub-kinds and sections (the
 * feed's Type, and its filters only its kind has, are left out with its Kind, as picking that Kind on
 * the panel does; an empty `kind=` is All kinds). A saved one left out is written as empty, so picking
 * the feed's Kind again does not bring it back on a reload.
 */
export function mergeFeedResourceParams(saved: URLSearchParams, url: Pick<URLSearchParams, 'get'>): URLSearchParams {
  const next = new URLSearchParams();
  const urlKind = url.get(RESOURCE_SEARCH_PARAMS.kind);
  const feed =
    urlKind === null
      ? saved
      : writeResourceSearchFilters(
          new URLSearchParams(saved),
          pickResourceKind(parseResourceSearchFilters(saved), urlKind || null),
        );
  for (const name of Object.values(RESOURCE_SEARCH_PARAMS)) {
    const value = url.get(name) ?? feed.get(name) ?? (saved.has(name) ? '' : null);
    if (value !== null) next.set(name, value);
  }
  return next;
}

/** A place name as the specs keep it: trimmed, no control character, at most 120 code points. */
const isPlaceName = (place: string) => [...place].length <= limits.feedFilterPlaceMaxLength && !/\p{Cc}/u.test(place);

/** The orders a feed saves in place of its own sort, as the specs spell them. */
const FEED_SORTS: Partial<Record<TResourceSearchSort, string>> = {
  trending: 'trending',
  upcoming: 'upcoming',
  distance: 'nearest',
};

/**
 * The filters a feed saves from the panel's (`TResourceSearchFilters`): the ones a feed applies, in the
 * specs' spelling; `null` for none. Only the sections the kind has are kept, as the search applies
 * them, and an order only where the search offers it (Upcoming for Events, Nearest around a point).
 * The kind and sub-kinds are the feed's types, Popular and Recent its own sort, so neither is here; but
 * More kinds' All types is every type but the kinds' own, which the feed keeps as `exclude_types`.
 */
export function toFeedResourceFilters(filters: TResourceSearchFilters): TFeedResourceFilters | null {
  const out: TFeedResourceFilters = {};
  const sections = getResourceKindSections(filters.kind);
  const has = (section: TResourceKindSection) => sections.includes(section);
  if (has('when') && filters.when === 'dates') {
    // The days picked in either order are the same range; the specs keep the first one first
    const [from, to] =
      filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
        ? [filters.dateTo, filters.dateFrom]
        : [filters.dateFrom, filters.dateTo];
    if (from) out.from = from;
    if (to) out.to = to;
  } else if (has('when') && filters.when) {
    out.when = filters.when;
  }
  if (has('where') && filters.near) {
    out.near = formatResourcePoint(filters.near);
    if (filters.radius && filters.radius !== RESOURCE_SEARCH_DEFAULT_RADIUS_KM) out.radius = String(filters.radius);
    const place = filters.place?.trim();
    if (place && isPlaceName(place)) out.place = place;
  }
  // The specs take one category, trimmed
  const category = filters.category;
  if (has('category') && category && !category.includes(',') && category.trim() === category) {
    out.category = category;
  }
  // The specs keep the hosts deduplicated and sorted by code point (hosts are ASCII)
  if (has('service') && filters.hosts.length > 0) out.host = [...new Set(filters.hosts)].sort().join(',');
  // An identifier only in a namespace the kind takes, as the search sends it
  const namespaces = RESOURCE_KIND_IDENTIFIERS[filters.kind ?? ''] ?? [];
  if (has('identifier') && filters.key && parseResourceIdentifier(filters.key, namespaces) === filters.key) {
    out.key = filters.key;
  }
  if (has('jobs') && filters.remote) out.remote = filters.remote;
  if (has('jobs') && filters.closed) out.closed = 'yes';
  if (has('ingredients') && filters.ingredients.length > 0) out.ingredients = filters.ingredients.join(',');
  const sorts = getResourceSearchSorts(null, filters.kind, {
    hasPoint: out.near !== undefined,
    isPast: out.when === 'past',
  });
  const sort = filters.sort && sorts.includes(filters.sort) ? FEED_SORTS[filters.sort] : undefined;
  if (sort) out.sort = sort;
  if (sort === 'trending' && filters.window !== RESOURCE_SEARCH_TRENDING_WINDOW) out.window = filters.window;
  if (!filters.collapse) out.rows = 'links';
  // Sorted and deduplicated, as the specs store it
  if (filters.kind === RESOURCE_MORE_KINDS && filters.types.length === 0) {
    out.exclude_types = toResourceFeedTypesValue(getResourceKindsTypes());
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** The panel's filters of a saved feed (`toFeedResourceParams` read back as the URL is). */
export const parseFeedResourceFilters = (
  types: readonly string[] | null | undefined,
  filters: TFeedResourceFilters | null | undefined,
): TResourceSearchFilters => parseResourceSearchFilters(toFeedResourceParams(types, filters));

/**
 * The saved filters that still apply once the feed's types are `types`: a filter of a kind's own
 * (When, Where, a Service…) goes when the new types are no longer that kind, as picking a kind on
 * Search drops them.
 */
export function keepFeedResourceFilters(
  filters: TFeedResourceFilters | null,
  from: readonly string[] | null,
  to: readonly string[] | null,
): TFeedResourceFilters | null {
  if (!filters) return null;
  const before = parseFeedResourceFilters(from, filters);
  const kind = toKindAndTypes(to)?.kind ?? null;
  const patch = pickResourceKind(before, kind);
  const after = parseResourceSearchFilters(writeResourceSearchFilters(toFeedResourceParams(from, filters), patch));
  return toFeedResourceFilters(after);
}

/**
 * The saved filters without one row (`getFeedResourceFilterRows` in `CustomFeedDialog.utils`): a row
 * and the members that read with it.
 */
export function removeFeedResourceFilter(
  filters: TFeedResourceFilters | null,
  name: TFeedResourceFilterName,
): TFeedResourceFilters | null {
  if (!filters) return null;
  const drop: Record<string, TFeedResourceFilterName[]> = {
    when: ['when'],
    from: ['from', 'to'],
    to: ['from', 'to'],
    near: ['near', 'radius', 'place', ...(filters.sort === 'nearest' ? (['sort'] as const) : [])],
    sort: ['sort', 'window'],
  };
  const next = { ...filters };
  for (const member of drop[name] ?? [name]) delete next[member];
  return Object.keys(next).length > 0 ? next : null;
}
