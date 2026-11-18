import { CONNECTION_TYPE, type ConnectionType } from './useProfileConnections.types';

interface ConnectionsHeadingCountParams {
  type: ConnectionType;
  /** The profile's total for this list, from the profile counts. */
  total: number;
  /** Rows loaded so far. */
  loaded: number;
  /** Whether the list has more pages to load. */
  hasMore: boolean;
  /** Whether the list belongs to the signed-in user. */
  isOwnProfile: boolean;
}

/**
 * The count shown next to a connections list heading.
 *
 * While pages remain, the loaded rows are only a prefix, so the profile total wins (and never reads
 * less than the rows on screen). Once the list is exhausted its rows are the answer, since the cached
 * total can lag behind a change made elsewhere. The exception is the signed-in user's own Following
 * and Friends lists, which keep unfollowed rows on screen (`useProfileConnections`); there the
 * total, which local-first writes keep current, is the count.
 */
export function getConnectionsHeadingCount({
  type,
  total,
  loaded,
  hasMore,
  isOwnProfile,
}: ConnectionsHeadingCountParams): number {
  if (hasMore) return Math.max(total, loaded);
  const keepsUnfollowedRows = isOwnProfile && (type === CONNECTION_TYPE.FOLLOWING || type === CONNECTION_TYPE.FRIENDS);
  return keepsUnfollowedRows ? total : loaded;
}
