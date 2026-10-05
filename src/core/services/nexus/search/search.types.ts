import type { Pubky } from '@/models/models.types';
import {
  type StreamSorting,
  type TPaginationParams,
  type TPaginationRangeParams,
  UserStreamReach,
} from '@/services/nexus/nexus.types';
import type { StreamKind } from '@/services/nexus/stream/posts/postStream.types';

export type TTagParams = TPaginationParams & {
  tag: string;
};

export type TTagSearchParams = TTagParams &
  TPaginationRangeParams & {
    sorting?: StreamSorting;
  };

export type TPrefixSearchParams = TPaginationParams & {
  prefix: string;
};

export type NexusSearchReach = `${Exclude<UserStreamReach, UserStreamReach.FOLLOWERS>}`;

// Derived from the same enum as NexusSearchReach, so the runtime check and the type cannot drift.
const NEXUS_SEARCH_REACHES: ReadonlySet<string> = new Set(
  Object.values(UserStreamReach).filter((reach) => reach !== UserStreamReach.FOLLOWERS),
);

export function isNexusSearchReach(value: string | undefined): value is NexusSearchReach {
  return value !== undefined && NEXUS_SEARCH_REACHES.has(value);
}

/** Nexus accepts a reach only together with the user whose network it scopes. */
export type TSearchReachParams = { reach: NexusSearchReach; user_id: Pubky } | { reach?: never; user_id?: never };

export type TContentSearchParams = TPaginationParams &
  TSearchReachParams & {
    q: string;
    kind?: StreamKind;
    // Scopes the full-text search to one author's posts (profile "Filter posts").
    author?: Pubky;
  };

export type TContentSearchResult = Array<{
  post_key: string;
  score: number;
}>;

export type TUsersByTagsSearchParams = TPaginationParams &
  TSearchReachParams & {
    // Comma-separated tag labels (1-5); users tagged with any of them match
    tags: string;
  };

/** People search as the UI asks for it; the controller adds the viewer. */
export type TUsersByTagsQuery = TPaginationParams & {
  tags: string;
  reach?: NexusSearchReach;
};

/** People search with the viewer a scoped reach needs; the service pairs them for Nexus. */
export type TUsersByTagsFetchParams = TUsersByTagsQuery & {
  viewerId?: Pubky;
};

export type TSearchQueryParams =
  TTagSearchParams | TPrefixSearchParams | TContentSearchParams | TUsersByTagsSearchParams;

// Common return type for search results (array of IDs/labels)
export type TSearchResult = string[];

// Single `search/users/by_tags` hit: user id + tagger count summed across the searched labels
export type TUserTagSearchResult = {
  user_id: Pubky;
  score: number;
};

// Path parameters that should NOT be added to query string
export const SEARCH_PATH_PARAMS = ['tag', 'prefix'] as const;
