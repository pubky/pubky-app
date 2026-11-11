import { Env } from '@/libs/env/env';

export const DB_NAME = Env.NEXT_PUBLIC_DB_NAME;
export const DB_VERSION = Env.NEXT_PUBLIC_DB_VERSION;

/**
 * Maximum number of attempts when initializing the database. WebKit/iOS Safari
 * intermittently aborts IndexedDB connections (e.g. memory pressure, tab/webview
 * eviction, in-app browsers), so a bounded retry recovers from transient failures.
 * With `DB_INIT_RETRY_BASE_DELAY_MS` it also bounds how often the re-initialization after an
 * unexpected close looks for a database another tab deleted (`AppDatabase`, ADR-0019).
 */
export const DB_INIT_MAX_ATTEMPTS = 3;

/**
 * Base delay (ms) for the quadratic backoff (base × n²) between database init retries, also used by
 * the close-path re-checks for a missing database (`AppDatabase`, ADR-0019).
 */
export const DB_INIT_RETRY_BASE_DELAY_MS = 150;
