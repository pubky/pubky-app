import { Env } from '@/libs/env/env';

export const DB_NAME = Env.NEXT_PUBLIC_DB_NAME;
export const DB_VERSION = Env.NEXT_PUBLIC_DB_VERSION;

/**
 * Maximum number of attempts when initializing the database. WebKit/iOS Safari
 * intermittently aborts IndexedDB connections (e.g. memory pressure, tab/webview
 * eviction, in-app browsers), so a bounded retry recovers from transient failures.
 */
export const DB_INIT_MAX_ATTEMPTS = 3;

/** Base delay (ms) for the linear backoff between database init retries. */
export const DB_INIT_RETRY_BASE_DELAY_MS = 150;

/**
 * Waits (ms) before each re-check when the re-initialization after an unexpected close finds the
 * database missing (`AppDatabase`, ADR-0019): five probes over about 5 s. Another tab deletes the
 * database before it opens it again, so "missing" is usually that gap; a database still missing
 * after the last wait is decided without it (the conflict screen once this page has recreated the
 * database). A detection window for that race, not a product limit: wide enough for a busy main
 * thread in the other tab, bounded so the spinner does not hang.
 */
export const DB_CLOSE_RECHECK_DELAYS_MS = [150, 600, 1_500, 3_000] as const;
