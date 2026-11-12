'use client';

import { RESOURCE_KIND_IDENTIFIERS, RESOURCE_MORE_KINDS, type TResourceKindSection } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useResourceSearch } from '@/hooks/useResourceSearch/useResourceSearch';
import {
  getResourceKindSections,
  isResourceFiltersSearch,
  parseResourceSearchFilters,
  toResourceFeedFilters,
  type TResourceSearchFilters,
  useResourceSearchFilters,
} from '@/hooks/useResourceSearchFilters/useResourceSearchFilters';
import { type SearchCriteria, useSearchCriteria } from '@/hooks/useSearchCriteria/useSearchCriteria';
import { useSearchReach } from '@/hooks/useSearchReach/useSearchReach';
import {
  classifyResourceSearchInput,
  getResourceEventRange,
  getResourceKind,
  getResourceKindsTypes,
  hasCredentialLink,
  isResolvableLink,
  parseResourceIdentifier,
  RESOURCE_SEARCH_MAX_MATCH_ALL_TAGS,
  RESOURCE_SEARCH_MAX_TAGS,
  toResourceFeedTypesValue,
  toResourceSearchReach,
  toResourceSearchSort,
  type TResourceQuery,
  type TResourceSearchInput,
  type TResourceSearchSort,
} from '@/pipes/resource/resource.search';
import type { TPinakesTypeFacet } from '@/services/pinakes/pinakes.types';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * A feed's external resources searched with the same filters (Home's External resources): every
 * resource, or the feed's tags, in its reach, its sort the order without one picked.
 */
export type TResourceFeedSearch = {
  tags: readonly string[];
  reach: string;
  sort: string;
  /** Types the feed lists that no Kind stands for (a custom feed's, of several kinds), while none is picked. */
  types?: readonly string[];
  /** The sub-kinds a custom feed saved (types within one kind): searched as they are while the Type picks them. */
  subKinds?: readonly string[];
  /** The types a custom feed of More kinds leaves out, as saved: searched while More kinds lists All types. */
  excludeTypes?: readonly string[];
};

export interface UseSearchResourceQueryOptions {
  /** Also read the kinds of the whole search (each type and its links), for the filters that offer them. */
  withKinds?: boolean;
  /** Apply the URL's filters (the tab); the All tab's section searches the box's query as it is. */
  withFilters?: boolean;
  /** Search a feed's resources instead of what the box asked for (`TResourceFeedSearch`). */
  feed?: TResourceFeedSearch;
}

export interface UseSearchResourceQueryResult {
  /** The search to run; `null` without one, or while the picked kind waits for the index's types. */
  query: TResourceQuery | null;
  /** There is a search, and it waits for the index's types to apply the picked sub-kinds. */
  isPending: boolean;
  /** Sub-kinds are picked and the index's types could not be read: nothing to search until a retry. */
  kindsFailed: boolean;
  /** Reads the index's types again, after `kindsFailed`. */
  retryKinds: () => void;
  /** No source can read the index's types (Pinakes not configured): no retry helps. */
  kindsUnavailable: boolean;
  /** A searched link: its card goes on top and the results are what is related to it. */
  url: string | null;
  /** The Search reach has no resource counterpart (My network): resources are searched from everyone. */
  isReachIgnored: boolean;
  /** The filters of the URL, as read. */
  filters: TResourceSearchFilters;
  /** The order the search applies. */
  sort: TResourceSearchSort;
  /** The order without one picked (Relevance for a text, else Popular): the URL leaves it out. */
  defaultSort: TResourceSearchSort;
  /** The orders this search offers; none for a searched link (Pinakes ranks what is related). */
  sorts: TResourceSearchSort[];
  /** The tags searched, before any picked to narrow. */
  searchedTags: string[];
  /** Whether All tags can apply to the searched tags (2 or 3 of them). */
  canMatchAll: boolean;
  /** Related tags narrowing a tag search (every tag must match then). */
  narrowTags: string[];
  /** The types of the whole search with their links (every kind), with `withKinds` or a kind picked. */
  typeFacets: TPinakesTypeFacet[] | null;
  /** The picked kind's own filter sections (Events: When and Where…); none for a searched link. */
  sections: readonly TResourceKindSection[];
  /** No text or tags: the URL's filters alone are the search (the links a user shared, a collection's). */
  isFiltersOnly: boolean;
}

/** Whether tags may be added to narrow a tag search (every one must match, at most 3 in all). */
export const canNarrowTags = (searched: number, narrow: number) =>
  searched + narrow < RESOURCE_SEARCH_MAX_MATCH_ALL_TAGS;

/**
 * The orders a search offers: Relevance for a text, Upcoming for Events (not for past ones), Nearest
 * for Events and Places around a point.
 */
export function getResourceSearchSorts(
  input: TResourceSearchInput | null,
  kind: string | null,
  { hasPoint = false, isPast = false }: { hasPoint?: boolean; isPast?: boolean } = {},
): TResourceSearchSort[] {
  if (input?.kind === 'related') return [];
  const sections = getResourceKindSections(kind);
  return [
    ...(input?.kind === 'text' ? (['relevance'] as const) : []),
    'activity',
    'trending',
    'recent',
    ...(kind === 'event' && !isPast ? (['upcoming'] as const) : []),
    ...(hasPoint && sections.includes('where') ? (['distance'] as const) : []),
  ];
}

/**
 * The order without one picked: Upcoming for Events (Popular for past ones), Nearest for Places
 * around a point, Relevance for a text, else Popular.
 */
export function getResourceSearchDefaultSort(
  sorts: readonly TResourceSearchSort[],
  kind: string | null,
  /** The order otherwise (a feed's own sort); Relevance for a text, else Popular, without one. */
  fallback?: TResourceSearchSort,
): TResourceSearchSort {
  if (kind === 'event' && sorts.includes('upcoming')) return 'upcoming';
  if (kind === 'place' && sorts.includes('distance')) return 'distance';
  if (fallback && sorts.includes(fallback)) return fallback;
  return sorts.includes('relevance') ? 'relevance' : 'activity';
}

/**
 * What the picked kind's own sections add to the search: only the sections it has, so a filter left
 * in the URL from another kind is never sent (an identifier only in a namespace the kind takes).
 */
function getKindFilters(
  filters: TResourceSearchFilters,
  sections: readonly TResourceKindSection[],
  now: Date,
): Partial<TResourceQuery> {
  const has = (section: TResourceKindSection) => sections.includes(section);
  const namespaces = RESOURCE_KIND_IDENTIFIERS[filters.kind ?? ''] ?? [];
  return {
    ...(has('when')
      ? getResourceEventRange(filters.when ?? 'upcoming', now, { from: filters.dateFrom, to: filters.dateTo })
      : {}),
    ...(has('where') && filters.near
      ? { near: filters.near, ...(filters.radius ? { radiusKm: filters.radius } : {}) }
      : {}),
    ...(has('category') && filters.category ? { category: filters.category } : {}),
    // Sorted, as a saved feed keeps them: one set of services is one search
    ...(has('service') && filters.hosts.length > 0 ? { hosts: [...filters.hosts].sort() } : {}),
    ...(has('identifier') && filters.key && parseResourceIdentifier(filters.key, namespaces) === filters.key
      ? { key: filters.key }
      : {}),
    ...(has('jobs') && filters.remote ? { remote: filters.remote === 'yes' } : {}),
    ...(has('jobs') && filters.closed ? { closed: true } : {}),
    ...(has('ingredients') && filters.ingredients.length > 0 ? { ingredients: filters.ingredients } : {}),
    ...(has('service') || has('category')
      ? {
          extraFacets: [
            ...(has('service') ? ['host' as const] : []),
            ...(has('category') ? ['category' as const] : []),
          ],
        }
      : {}),
  };
}

/** More kinds' All types: every type but these, each with its subtypes (Pinakes `exclude_type`). */
type TExcludedTypes = { exclude: string[] };

const isExcludedTypes = (types: unknown): types is TExcludedTypes =>
  typeof types === 'object' && types !== null && 'exclude' in types;

/**
 * The `type=` of the filters: the picked sub-kinds the index has (an unknown type would be refused),
 * else the kind's types; `[]` for every kind. More kinds' All types is every type but the kinds' own
 * (`excluded`, as `{ exclude }`). `'pending'` while the index's types are read for picked sub-kinds.
 * When they cannot be read (Pinakes failed), picked sub-kinds have nothing to search (`'failed'`): a
 * type is never sent as spelled, nor widened. On a custom feed of sub-kinds (`keepsSubKinds`), picked
 * ones the index has none of list nothing (`'none'`), not the whole kind.
 */
function resolveTypes(
  filters: Pick<TResourceSearchFilters, 'kind' | 'types'>,
  facets: TPinakesTypeFacet[] | null,
  isSettled: boolean,
  keepsSubKinds: boolean,
  excluded: readonly string[],
): string[] | TExcludedTypes | 'pending' | 'none' | 'failed' {
  const kind = getResourceKind(filters.kind);
  const whole = kind ? [...kind.types] : filters.kind === RESOURCE_MORE_KINDS ? { exclude: [...excluded] } : [];
  if (filters.types.length === 0) return whole;
  if (!facets) return isSettled ? 'failed' : 'pending';
  const known = filters.types.filter((type) => facets.some((facet) => facet.type === type));
  if (known.length > 0) return known;
  return kind && keepsSubKinds ? 'none' : whole;
}

/** What a search of a feed's resources (`TResourceFeedSearch`) is, as the box would ask it. */
const toFeedCriteria = (feed: TResourceFeedSearch): SearchCriteria =>
  feed.tags.length > 0 ? { mode: 'tags', tags: [...feed.tags] } : { mode: 'none' };

/**
 * The resource search of `/search`: what the box asked for (tags; a text, which a link or an
 * identifier turns into its card or `key=`) with the URL's filters (kind and sub-kinds, order, tag
 * match, rows, shared by, in a collection), in the Search reach (everyone signed out). A searched
 * link's card goes on top (`url`) and the results are what is related to it. A filter the search
 * cannot carry is not sent: Relevance needs a text, Upcoming Events, All tags 2 or 3 tags.
 *
 * With `feed`, the same filters search a feed's resources (Home's External resources): every
 * resource or its tags (any of them), in its reach, with its sort as the order without one picked.
 * Shared by and In a collection are entry points of Search: a feed takes neither.
 */
export function useSearchResourceQuery({
  withKinds = false,
  withFilters = true,
  feed,
}: UseSearchResourceQueryOptions = {}): UseSearchResourceQueryResult {
  const searchCriteria = useSearchCriteria();
  const criteria = feed ? toFeedCriteria(feed) : searchCriteria;
  const { reach: searchReach } = useSearchReach();
  const reach = feed ? feed.reach : searchReach;
  const viewer = useAuthStore((state) => state.currentUserPubky);
  const { filters: urlFilters } = useResourceSearchFilters();
  const filters = withFilters
    ? feed
      ? toResourceFeedFilters(urlFilters)
      : urlFilters
    : parseResourceSearchFilters(null);
  // A search of filters alone (no text, no tags): the links a user shared or a collection holds
  // (`isResourceFiltersSearch`), narrowed by the other filters
  const isFiltersOnly = withFilters && criteria.mode === 'none' && isResourceFiltersSearch(filters);

  const classified =
    criteria.mode === 'resource'
      ? criteria.input
      : criteria.mode === 'content'
        ? classifyResourceSearchInput(criteria.query)
        : null;
  // Pinakes takes 5 tags: the stream standing in for it searches the same ones
  const searchedTags = criteria.mode === 'tags' ? criteria.tags.slice(0, RESOURCE_SEARCH_MAX_TAGS) : [];
  // A feed's tags are any of them, as the feed saved them
  const canMatchAll = !feed && searchedTags.length > 1 && searchedTags.length <= RESOURCE_SEARCH_MAX_MATCH_ALL_TAGS;
  const narrowTags = filters.narrowTags
    .filter((tag) => !searchedTags.includes(tag))
    .slice(0, Math.max(0, RESOURCE_SEARCH_MAX_MATCH_ALL_TAGS - searchedTags.length));

  // A link that carries credentials (`user:password@`) is never sent, wherever the search holds it (the
  // box's link, identifier or text, a tag, the Identifier or the category): no card, nothing related, no query
  const holdsCredentialLink = [
    criteria.mode === 'resource' || criteria.mode === 'content' ? criteria.query : null,
    ...searchedTags,
    ...narrowTags,
    filters.key,
    filters.category,
  ].some((value) => value !== null && hasCredentialLink(value));
  const url =
    classified?.kind === 'url' && !holdsCredentialLink && isResolvableLink(classified.url) ? classified.url : null;
  const isLink = classified?.kind === 'url';
  const { data: card } = usePinakesCard(url);

  let input: TResourceSearchInput | null = null;
  if (criteria.mode === 'tags') {
    input =
      narrowTags.length > 0
        ? { kind: 'tags', tags: [...searchedTags, ...narrowTags], match: 'all' }
        : filters.match === 'all' && canMatchAll
          ? { kind: 'tags', tags: searchedTags, match: 'all' }
          : { kind: 'tags', tags: searchedTags };
  } else if (classified?.kind === 'key') {
    input = { kind: 'key', key: classified.key };
  } else if (classified?.kind === 'text') {
    input = { kind: 'text', text: classified.text };
  } else if (url && card?.id) {
    input = { kind: 'related', id: card.id };
  } else if (isFiltersOnly || feed) {
    input = { kind: 'all' };
  }
  if (holdsCredentialLink) input = null;

  // What is related to a searched link takes no filter of a kind's own; an identifier searched in the
  // box is the one identifier the search takes
  const sections = isLink
    ? []
    : getResourceKindSections(filters.kind).filter((section) => section !== 'identifier' || input?.kind !== 'key');
  const kindFilters = getKindFilters(filters, sections, new Date());
  // What is related to a searched link is ranked by Pinakes, also while its card is read
  const sorts = isLink
    ? []
    : getResourceSearchSorts(input, filters.kind, {
        hasPoint: kindFilters.near !== undefined,
        isPast: filters.when === 'past',
      });
  const defaultSort: TResourceSearchSort = getResourceSearchDefaultSort(
    sorts,
    filters.kind,
    feed ? toResourceSearchSort(feed.sort) : undefined,
  );
  const sort = filters.sort && sorts.includes(filters.sort) ? filters.sort : defaultSort;
  const resourceReach = viewer ? toResourceSearchReach(reach) : 'all';

  const base: TResourceQuery | null = input
    ? {
        input,
        sort,
        ...(sort === 'trending' ? { window: filters.window } : {}),
        reach: resourceReach ?? 'all',
        viewer,
        collapse: filters.collapse,
        ...(filters.author ? { author: filters.author } : {}),
        ...(filters.inCollection ? { inCollection: filters.inCollection } : {}),
      }
    : null;

  // The kinds of the whole search: the same search of every type, one row, read once per search. Its
  // counts do not depend on the order, the rows or the kind picked, so neither changes its key (the
  // panel and the tab share it, and the Kind list stays put while they change). In no date range
  // either: every kind stays offered whatever the order (Upcoming's counts include past events).
  // A custom feed's saved sub-kinds, while the Type picks them, are searched as they are: the feed lists
  // what it saved, without waiting for the index's types
  const isSavedSubKinds =
    feed?.subKinds !== undefined &&
    filters.types.length > 0 &&
    toResourceFeedTypesValue(filters.types) === toResourceFeedTypesValue(feed.subKinds);
  const needsFacets = !isSavedSubKinds && filters.types.length > 0;
  const kindsQuery: TResourceQuery | null =
    base && (withKinds || needsFacets) ? { ...base, sort: 'recent', window: undefined, collapse: false } : null;
  const kinds = useResourceSearch(kindsQuery, { limit: 1, facets: true });
  // More kinds leaves out the kinds' types; a custom feed of More kinds, the ones it saved
  const excluded = feed?.excludeTypes ?? getResourceKindsTypes();
  const types = isSavedSubKinds
    ? [...filters.types]
    : resolveTypes(filters, kinds.typeFacets, !kinds.loading, feed?.subKinds !== undefined, excluded);

  // A feed's own types where no Kind stands for them, while the panel picks none
  const feedTypes = feed?.types && filters.kind === null ? feed.types : [];
  const queryTypes = Array.isArray(types) && types.length > 0 ? types : feedTypes;
  return {
    query:
      base && isExcludedTypes(types)
        ? { ...base, excludeTypes: types.exclude, ...kindFilters }
        : base && Array.isArray(types)
          ? { ...base, ...(queryTypes.length > 0 ? { types: [...queryTypes] } : {}), ...kindFilters }
          : null,
    isPending: base !== null && types === 'pending',
    kindsFailed: base !== null && types === 'failed',
    retryKinds: kinds.retry,
    kindsUnavailable: kinds.unavailable,
    url,
    isReachIgnored: resourceReach === null,
    filters,
    sort,
    defaultSort,
    sorts,
    searchedTags,
    canMatchAll,
    narrowTags,
    typeFacets: kinds.typeFacets,
    sections,
    isFiltersOnly,
  };
}
