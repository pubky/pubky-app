/**
 * The app's own files, outside the social data model: settings and the notification read cursor
 * live in the app's private namespace, which no other client reads.
 */
export const APP_PRIVATE_PATH = '/priv/app.pubky/v1/';

/** Settings, read and written by this app only. */
export const APP_SETTINGS_FILE = 'settings.json';

/** The notification read cursor, `{ timestamp }` in milliseconds. */
export const APP_LAST_READ_FILE = 'last_read.json';

/** Where a 0.x client kept settings; read only while the v1 file is absent. */
export const LEGACY_SETTINGS_PATH = '/pub/pubky.app/settings.json';
