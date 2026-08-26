import type { PubkyAppCollectionLayout } from 'pubky-app-specs';

/**
 * Collections feature configuration.
 *
 * Section page sizes / avatar caps for the `/collections` landing and the
 * `/collections/[id]` bottom sections.
 */

// Intentionally whitelist layouts implemented by this UI so future specs
// layouts remain unsupported until their rendering and controls are added.
export type CollectionLayout = Extract<PubkyAppCollectionLayout, 'grid' | 'list' | 'visual'>;

export const COLLECTION_LAYOUT: Record<'GRID' | 'LIST' | 'VISUAL', CollectionLayout> = {
  GRID: 'grid',
  LIST: 'list',
  VISUAL: 'visual',
};

export const DEFAULT_COLLECTION_LAYOUT: CollectionLayout = COLLECTION_LAYOUT.GRID;

export function isCollectionLayout(value: unknown): value is CollectionLayout {
  return value === COLLECTION_LAYOUT.GRID || value === COLLECTION_LAYOUT.LIST || value === COLLECTION_LAYOUT.VISUAL;
}

/** Page size for each of the three sections (My / Followed / Discover). */
export const COLLECTIONS_SECTION_PAGE_SIZE = 20;

/**
 * Cards shown in the collapsed `/search` Collections preview — two full rows
 * of the 2-col desktop grid. "See all" expands the section to the paginated
 * grid driven by `COLLECTIONS_SECTION_PAGE_SIZE`.
 */
export const SEARCH_COLLECTIONS_PREVIEW_COUNT = 4;

/**
 * Max raw pages the stream layer fetches per Discover slice request (initial
 * load or one "Show more" click) while client-side filtering (own / followed /
 * deleted / empty) empties them. Deliberately far below the shared queue
 * default (`MAX_FETCH_ITERATIONS = 20`): Discover is a discovery surface, not
 * a primary feed, and every scanned page also costs detail fetches for its
 * cache-miss posts — even filtered-out ones — so deep scans multiply data
 * usage and latency for users on slow connections. When the cap hits with
 * nothing new to show, the UI surfaces a "no new results" toast and the next
 * click resumes from the advanced cursor.
 *
 * Value: 5 — a deliberate, marginal raise over the component-level cap of 3
 * that preceded the stream-layer refactor, buying extra headroom in filtered
 * regions while staying far under the shared default.
 */
export const COLLECTIONS_DISCOVER_MAX_FETCHES_PER_LOAD = 5;

/**
 * Max number of unique author avatars to show in a section header's stacked
 * avatar group before collapsing the rest behind a `+N` overflow chip.
 */
export const COLLECTIONS_SECTION_AVATAR_STACK_MAX = 5;

/**
 * Number of `CollectionCardSkeleton` placeholders rendered inside each
 * section's grid while its initial data fetch is in flight. Chosen to fill
 * one row on the 2-col desktop grid without over-promising more cards than
 * a typical user actually has.
 */
export const COLLECTIONS_SECTION_SKELETON_COUNT = 2;

/**
 * Skeleton count for `MyCollections` specifically. Lower than the shared
 * `COLLECTIONS_SECTION_SKELETON_COUNT` because the pinned `CollectionBookmarkCard`
 * always occupies the first grid slot, so one skeleton is enough to fill
 * the remaining cell on the 2-col desktop grid during the initial fetch.
 */
export const COLLECTIONS_MY_SECTION_SKELETON_COUNT = 1;
