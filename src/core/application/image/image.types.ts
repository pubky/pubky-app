/** A card image as served from the app's origin: its bytes and the image type they are. */
export type TResourceImage = { body: ArrayBuffer; contentType: string };

/** The answer while too many other cards or images are being read: nothing now, nothing remembered. */
export const IMAGE_BUSY = 'busy';

/** The answer when Pinakes could not be read (an error, a timeout, its rate limit): nothing remembered. */
export const IMAGE_UNAVAILABLE = 'unavailable';

/** A card image, `null` when there is none to serve for that card, `IMAGE_BUSY` or `IMAGE_UNAVAILABLE`. */
export type TResourceImageRead = TResourceImage | null | typeof IMAGE_BUSY | typeof IMAGE_UNAVAILABLE;
