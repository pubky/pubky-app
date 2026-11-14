/**
 * Social v1 migration (`pubky-social-migrator`): the values the gate reads before it runs the
 * engine. Product policy, like every `src/config/*` limit.
 */

/** Mirror of the migrator's `transformRev`; a flag recorded under a lower one is walked again (contract-tested). */
export const SOCIAL_MIGRATION_TRANSFORM_REV = 3;

/** Owner-relative path of the done flag the migrator writes last; the gate reads it with an explicit session. */
export const SOCIAL_MIGRATION_FLAG_PATH = '/priv/social/v1/_migrated.json';

/** Waits before each automatic retry of an `incomplete` or `IO_ERROR` run; a fourth failure blocks on manual Retry. */
export const SOCIAL_MIGRATION_AUTO_RETRY_DELAYS_MS = [2000, 5000, 15000] as const;

/** Minimum interval between two progress-store writes while the engine reports per object. */
export const SOCIAL_MIGRATION_PROGRESS_THROTTLE_MS = 200;
