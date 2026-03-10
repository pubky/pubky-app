/**
 * NextJS API Internal Utility Types
 *
 * Type definitions for internal utility functions
 * used by the NextJS API service layer (query client wrapper, etc.).
 */

/**
 * Parameters for querying via the NextJS API query client.
 * The query key is built internally as ['nextjs-api', topic, url].
 * @see queryNextjs in nextjs.utils.ts
 */
export type TQueryNextjsParams<T> = {
  /** Topic identifier for cache key namespacing (e.g., 'og-metadata') */
  topic: string;
  /** The URL being queried, used as the cache key discriminator */
  url: string;
  /** Function that performs the actual fetch */
  queryFn: () => Promise<T>;
};
