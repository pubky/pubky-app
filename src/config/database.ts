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
