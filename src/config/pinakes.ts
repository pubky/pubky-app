import { getPinakesUrl } from '@/libs/runtime-config/runtime-config';

// Runtime-configurable: read via getters at call time (PUBKY_RUNTIME_PINAKES_URL, unset in dev/test
// unless `.env.local` sets it). See @/libs/runtime-config.
export { getPinakesUrl };

/**
 * True when a Pinakes origin is configured (`PUBKY_RUNTIME_PINAKES_URL`). Unset turns external
 * resource cards off: no Pinakes request is made and links keep the plain link preview.
 */
export function isPinakesConfigured(): boolean {
  return Boolean(getPinakesUrl());
}

/**
 * Pinakes contract limit: a URI longer than this many bytes is a 400 (`/llms.txt`, Limits).
 * Such a link cannot have a card, so it is answered as "no card" without a request.
 */
export const PINAKES_URI_MAX_BYTES = 2048;

/** Results asked for in one "Similar" (`GET /v1/search?related=`) read. */
export const PINAKES_RELATED_LIMIT = 5;

/**
 * Deadline for one Pinakes request. A card is optional, so a stalled connection must end in the
 * plain link preview instead of a skeleton that never resolves.
 */
export const PINAKES_REQUEST_TIMEOUT_MS = 8000;

/**
 * How long a card's read may take before a post shows the link's own preview instead of the
 * card's skeleton: Pinakes is optional enrichment, a post never waits on it.
 */
export const PINAKES_SLOW_READ_MS = 5_000;
