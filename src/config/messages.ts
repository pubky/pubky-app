/**
 * Direct messages (vibe). Product policy for the Messages feature, built on pubky-messenger protocol v2.
 * See `docs/adr/0031-direct-messages-vibe.md`.
 */

/** Separate IndexedDB database, so the shared `DB_VERSION` never changes for this feature. */
export const MESSAGES_DB_NAME = 'pubky-app-dms';

/** One coordinator tick. The open conversation is checked on every tick. */
export const MESSAGES_TICK_MS = 5_000;

/** Every known conversation is checked every this many ticks (30 s). */
export const MESSAGES_CONVERSATIONS_EVERY_TICKS = 6;

/** Follows and followers are checked for new conversations every this many ticks (3 min). */
export const MESSAGES_DISCOVERY_EVERY_TICKS = 36;

/** Most candidates (follows plus followers) one discovery pass checks. */
export const MESSAGES_DISCOVERY_MAX_PEERS = 200;

/** How long a fetched follows/followers candidate list is reused between discovery passes. */
export const MESSAGES_CANDIDATES_TTL_MS = 10 * 60_000;

/** How long a peer's key record lookup (enabled or not) is trusted before it is checked again. */
export const MESSAGES_KEY_RECORD_TTL_MS = 10 * 60_000;

/** Longest message a user can send, in characters. */
export const MESSAGE_MAX_LENGTH = 10_000;

/** Unread badges show this number and a plus sign above it. */
export const MESSAGES_BADGE_CAP = 21;
