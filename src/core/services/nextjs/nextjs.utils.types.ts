/**
 * NextJS API Internal Utility Types
 *
 * Type definitions for internal utility functions
 * used by the NextJS API service layer (query client wrapper, etc.).
 */

/**
 * Parameters for querying via the NextJS API query client.
 * @see queryNextjs in nextjs.utils.ts
 */
export type TQueryNextjsParams<T> = {
  /** Cache key for deduplication and caching */
  queryKey: readonly unknown[];
  /** Function that performs the actual fetch */
  queryFn: () => Promise<T>;
};
