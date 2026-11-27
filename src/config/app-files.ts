/**
 * The app's own files, outside the social data model: settings, the notification read cursor and the
 * Locks reader files (`locks/`) live in the app's private namespace, which no other client reads.
 */
export const APP_PRIVATE_PATH = '/priv/app.pubky/v1/';

/** Settings, read and written by this app only. */
export const APP_SETTINGS_FILE = 'settings.json';

/** The notification read cursor, `{ timestamp }` in milliseconds. */
export const APP_LAST_READ_FILE = 'last_read.json';

/** The Locks reader's replicas, one folder per lock (`<lockId>/`, `post.json` written last). */
export const APP_LOCKS_UNLOCKED_PATH = `${APP_PRIVATE_PATH}locks/unlocked/`;

/** The Locks reader's purchase files, one per bundle id (`<lockId>/<bundleId>.json`). */
export const APP_LOCKS_PURCHASES_PATH = `${APP_PRIVATE_PATH}locks/purchases/`;

/** Where builds before #3206 kept the Locks reader files; the copy, which is permanent, reads them. */
export const SOCIAL_LOCKS_UNLOCKED_PATH = '/priv/social/unlocked/';
export const SOCIAL_LOCKS_PURCHASES_PATH = '/priv/social/purchases/';

/** Where a 0.x client kept settings; read only while the v1 file is absent. */
export const LEGACY_SETTINGS_PATH = '/pub/pubky.app/settings.json';

/** Where a 0.x client kept the notification read cursor; read only while the v1 file is absent. */
export const LEGACY_LAST_READ_PATH = '/pub/pubky.app/last_read';
