import type { StreamSorting, TPaginationParams, TPaginationRangeParams } from '@/services/nexus/nexus.types';
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

export type TContentSearchParams = TPaginationParams & {
  q: string;
  kind?: StreamKind;
};

export type TContentSearchResult = Array<{
  post_key: string;
  score: number;
}>;

export type TSearchQueryParams = TTagSearchParams | TPrefixSearchParams | TContentSearchParams;

// Common return type for search results (array of IDs/labels)
export type TSearchResult = string[];

// Path parameters that should NOT be added to query string
export const SEARCH_PATH_PARAMS = ['tag', 'prefix'] as const;
