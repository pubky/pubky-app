interface ConnectionsHeadingCountParams {
  /** The profile's total for this list, from the profile counts. */
  total: number;
  /** Rows on screen. */
  loaded: number;
  /** Rows kept on screen although they left the list (an unfollow made from the list itself). */
  retained: number;
  /** Whether the list has more pages to load. */
  hasMore: boolean;
  /** Whether the last page request failed, which also stops pagination. */
  failed: boolean;
}

/**
 * The count shown next to a connections list heading.
 *
 * Rows kept on screen after an unfollow (`useProfileConnections`) are never counted. While pages
 * remain, or after a page failed to load, the rows are only a prefix, so the profile total wins (and
 * never reads less than the rows still in the list). Once the list is exhausted its rows are the
 * answer, since the cached total can lag behind a change made elsewhere, in either direction.
 */
export function getConnectionsHeadingCount({
  total,
  loaded,
  retained,
  hasMore,
  failed,
}: ConnectionsHeadingCountParams): number {
  const listed = Math.max(loaded - retained, 0);
  if (hasMore || failed) return Math.max(total, listed);
  return listed;
}
