import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';

/**
 * Resolve the cache-walk resume anchor from a stream-slice response: the raw scan
 * anchor when threaded, else the last visible id. Anchoring on the visible page alone
 * would restart the cache walk at the head after a fully-filtered round and spin in
 * place on long filtered runs — every caller that threads `lastPostId` between rounds
 * must resolve it through this helper (the id-based twin of `advanceCursor`).
 * Returns undefined when the response carries no anchor; callers keep their previous
 * anchor in that case rather than clobbering it.
 */
export function resolveResumeAnchor(
  result: Pick<TReadPostStreamChunkResponse, 'nextPageIds' | 'lastRawPostId'>,
): string | undefined {
  return result.lastRawPostId ?? result.nextPageIds[result.nextPageIds.length - 1];
}
