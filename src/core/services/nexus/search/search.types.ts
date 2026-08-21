import type { Pubky } from '@/models/models.types';
import type { StreamSorting, TPaginationParams, TPaginationRangeParams } from '@/services/nexus/nexus.types';

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

export type TUsersByTagsSearchParams = TPaginationParams & {
  // Comma-separated tag labels (1-5); users tagged with any of them match
  tags: string;
};

export type TSearchQueryParams = TTagSearchParams | TPrefixSearchParams | TUsersByTagsSearchParams;

// Common return type for search results (array of IDs/labels)
export type TSearchResult = string[];

// Single `search/users/by_tags` hit: user id + tagger count summed across the searched labels
export type TUserTagSearchResult = {
  user_id: Pubky;
  score: number;
};

// Path parameters that should NOT be added to query string
export const SEARCH_PATH_PARAMS = ['tag', 'prefix'] as const;
