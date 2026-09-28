import { getCdnUrl, getNexusUrl, getStreamCacheMaxAgeMs } from '@/libs/runtime-config/runtime-config';

// Runtime-configurable: read via getters at call time (PUBKY_RUNTIME_*, staging defaults in
// dev/test). See @/libs/runtime-config.
export { getCdnUrl, getNexusUrl, getStreamCacheMaxAgeMs };

export const NEXUS_NOTIFICATIONS_LIMIT = 30;
export const NEXUS_POSTS_PER_PAGE = 10; // Number of posts to fetch per page in streams
export const NEXUS_STREAM_MAX_LIMIT = 50; // Hard cap Nexus enforces on a single stream `limit`; requests above this are rejected
export const NEXUS_USERS_PER_PAGE = 10; // Number of users to fetch per page in streams

/**
 * Timeout for server-side Nexus fetches made while rendering link-preview
 * metadata and dynamic OG images. Social crawlers give up after a few seconds
 * and cache the miss, so a slow Nexus must degrade to the generic fallback
 * quickly instead of hanging the response.
 */
export const NEXUS_SERVER_FETCH_TIMEOUT_MS = 3000;

/**
 * Budget for one best-effort lookup of a mentioned user's display name while
 * rendering link-preview metadata and OG images. Deliberately shorter than
 * `NEXUS_SERVER_FETCH_TIMEOUT_MS`: the lookup only decorates the preview (a
 * miss renders the shortened key), so it must not add a full Nexus timeout to
 * a crawler's wait or push the OG render past its deadline.
 */
export const NEXUS_MENTION_LOOKUP_TIMEOUT_MS = 1000;

/**
 * Upper bound on distinct mentioned users looked up for one preview text.
 * Bounds the Nexus fan-out of a mention-heavy post; mentions past it render as
 * shortened keys.
 */
export const NEXUS_MENTION_LOOKUP_LIMIT = 10;

/**
 * Nexus contract limit: `source=starter_pack` accepts 1-5 comma-separated interest tags
 * (pubky/pubky-nexus#1024). Fixed by the backend — independent of the runtime-configurable
 * `getMaxStreamTags()`, which may be set higher and must never widen this bound.
 */
export const STARTER_PACK_MAX_TAGS = 5;

/** Maximum suggestions shown on the onboarding "Follow your best matches" step (per design) */
export const STARTER_PACK_SUGGESTIONS_LIMIT = 10;

/**
 * Labels rejected by Nexus for `source=starter_pack` (pubky/pubky-nexus#1024).
 * This is intentionally separate from the app's runtime moderation configuration:
 * Nexus reserves these labels regardless of which moderator the frontend follows.
 */
export const STARTER_PACK_RESERVED_TAGS = [
  'hatespeech',
  'harassement',
  'terrorism',
  'violence',
  'illegal_activities',
  'il_adult_nu_sex_act',
] as const;
