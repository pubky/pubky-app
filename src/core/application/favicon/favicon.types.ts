/** A site's icon as served from the app's origin: its bytes and the image type they are. */
export type TFavicon = { body: ArrayBuffer; contentType: string };

/** The answer for a new host while too many others are being read: no icon now, nothing remembered. */
export const FAVICON_BUSY = 'busy';

/** A host's icon, `null` when it has none to serve, or `FAVICON_BUSY`. */
export type TFaviconRead = TFavicon | null | typeof FAVICON_BUSY;
