import { APP_PRIVATE_PATH } from '@/config/app-files';

/**
 * The local index: the read model this browser builds from the homeservers of the signed-in user's scope, used
 * when `PUBKY_RUNTIME_INDEXER_SOURCES` includes `local`. Fixed values, not configurable via env.
 */

/** The index's own files, in the app's private tree (covered by `SOCIAL_V1_APP_CAPABILITIES`). */
export const INDEXER_FILES_PATH = `${APP_PRIVATE_PATH}index/`;

/** Names the index gives its files: only characters a path segment carries unescaped. */
export const INDEXER_FILE_NAME_PATTERN = /^[A-Za-z0-9._~-]+$/;

/**
 * How long one anonymous read of the crawl (a page of events, one file) may take. A page is a bounded, non-live
 * request, so a homeserver that holds it longer is treated as unreachable and backed off.
 */
export const INDEXER_READ_TIMEOUT_MS = 20_000;

/** Each account keeps its index in its own IndexedDB database, named by this prefix and its public key. */
export const INDEXER_DATABASE_PREFIX = 'pubky-index-';

/** Pages of an author's older activity loaded when a local answer asks for more. */
export const INDEXER_HINT_BACKFILL_PAGES = 1;
