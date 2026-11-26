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

/**
 * The largest file the crawl reads. Every file it needs is a small JSON record, a few hundred bytes, so anything over
 * 1 MiB is no record and is treated like a missing file instead of being read into memory.
 */
export const INDEXER_RECORD_MAX_BYTES = 1024 * 1024;

/** Each account keeps its index in its own IndexedDB database, named by this prefix and its public key. */
export const INDEXER_DATABASE_PREFIX = 'pubky-index-';

/**
 * The database of a signed-out visitor's index, which holds only the posts and profiles opened. `v` is no z-base-32
 * letter, so the name never collides with an account's.
 */
export const INDEXER_VISITOR_DATABASE = `${INDEXER_DATABASE_PREFIX}visitor`;

/** Pages of an author's older activity loaded when a local answer asks for more. */
export const INDEXER_HINT_BACKFILL_PAGES = 1;

/**
 * Authors whose older activity one round loads for a stream page that came back short. A feed of many authors names
 * every one whose loaded history the page reached; loading them all on each scroll would crawl the whole network.
 */
export const INDEXER_PAGE_BACKFILL_AUTHORS = 3;

/**
 * Rounds in a row that may load older activity without adding a post to a short stream page before it is served as
 * it is, which ends its feed. A round can hold only tags, so one empty round does not prove the end.
 */
export const INDEXER_PAGE_BACKFILL_IDLE_ROUNDS = 3;
