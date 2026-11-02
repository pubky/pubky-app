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
 * How long the Unlock pill of someone else's locked post stays busy, at most, while the reader may already
 * own the content (#2795): their replicated copy is read, the purchase list is still loading, or purchase
 * recovery looks up a listed purchase. One limit for all of it, counted from the first busy moment with a
 * session. The reads carry no deadline of their own and keep going after it; only the pill stops waiting.
 */
export const UNLOCK_PILL_HOLD_MS = 10_000;
