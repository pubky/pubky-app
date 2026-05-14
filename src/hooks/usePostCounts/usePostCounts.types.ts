import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';

export interface UsePostCountsResult {
  /** Post counts from local database, null if not found, undefined if loading */
  postCounts: PostCountsModelSchema | null | undefined;
  /** True while the query is loading */
  isLoading: boolean;
}
