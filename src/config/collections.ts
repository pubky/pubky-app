/**
 * Collections feature configuration.
 *
 * Section page sizes / avatar caps for the `/collections` landing and the
 * `/collections/[id]` bottom sections.
 */

/** Page size for each of the three sections (My / Followed / Discover). */
export const COLLECTIONS_SECTION_PAGE_SIZE = 20;

/**
 * Safety cap for Discover's dedupe backfill loop — max number of additional
 * slices we pull per user-initiated action (initial mount or "Show more"
 * click) when post-filter visible count is below page size, before giving up
 * and rendering whatever we have.
 *
 * Why this exists: each Discover slice may have many items that get hidden
 * by the per-card filter (own collection, already bookmarked). Without
 * backfill, an unlucky page could render zero visible cards. The cap
 * prevents runaway fetching when most of the user's social graph already
 * follows everything on the feed.
 */
export const COLLECTIONS_DISCOVER_BACKFILL_MAX_ROUNDS = 3;

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
