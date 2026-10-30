// One source for the requested capability scope and the parser's guarded-read prefix.
export const LOCKS_GUARDED_CONTENT_PATH = '/priv/app.locks/content/';

// Payment window recorded in newly published Locks criteria, in whole hours.
export const PAYKIT_PAYMENT_IN_HOURS = 24;

/**
 * Attachment uploads a lock publication keeps in flight. The SDK copies each file into wasm memory,
 * which never shrinks, so a cap bounds that peak (9 files of 10 MB would be 90 MB at once) and the
 * error reports one dropped connection produces; most of the gain over one at a time is round trips.
 */
export const LOCK_ATTACHMENT_UPLOAD_CONCURRENCY = 3;

/**
 * How long a locked post waits on the read of the reader's replicated copy before it stops treating
 * the reader as one who may already have unlocked it. The homeserver reads carry no deadline of their
 * own, and until this passes the Unlock pill stays busy and purchase recovery waits (#2795). The read
 * itself keeps going and still renders the copy if it lands later.
 */
export const REPLICA_READ_HOLD_MS = 10_000;
