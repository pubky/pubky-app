import { nextjsApiQueryClient } from './nextjs-api.query-client';
import type { TQueryNextjsParams } from './nextjs.utils.types';

/**
 * Queries via the NextJS API query client with caching, deduplication, and retry.
 * Wraps fetchQuery so the application layer doesn't need to know about the query client.
 */
export async function queryNextjs<T>({ queryKey, queryFn }: TQueryNextjsParams<T>): Promise<T> {
  return nextjsApiQueryClient.fetchQuery({ queryKey, queryFn });
}
