/**
 * Resized copies of local images, made by the service worker the way Nexus makes them for its CDN: scaled down to
 * the variant's width with the aspect kept, never enlarged, EXIF orientation applied, and re-encoded. Imported by
 * the worker, so it stays free of app imports.
 */

/** The widths Nexus fits an image variant to (ImageMagick `-resize {width}x>`); `main` is the original. */
export const LOCAL_MEDIA_VARIANT_WIDTHS = { small: 320, feed: 720, large: 1440 } as const;

export type LocalMediaVariant = keyof typeof LOCAL_MEDIA_VARIANT_WIDTHS;

/** Nexus serves avatars as `small`, which covers the largest avatar the app renders (144 CSS px) at 2x. */
export const LOCAL_AVATAR_VARIANT: LocalMediaVariant = 'small';

export const isLocalMediaVariant = (value: string): value is LocalMediaVariant =>
  Object.prototype.hasOwnProperty.call(LOCAL_MEDIA_VARIANT_WIDTHS, value);

/** A full media representation: its bytes and their type. */
export interface LocalMediaBody {
  blob: Blob;
  contentType: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** An image decoded with its EXIF orientation applied. */
export interface DecodedImage extends ImageSize {
  /** Draws the image at `size` and encodes it as the first of `types` the browser writes; `null` when it writes none. */
  encode(size: ImageSize, types: readonly string[]): Promise<Blob | null>;
  close(): void;
}

/** Decodes an image, `null` when the browser cannot. */
export type DecodeImage = (image: Blob) => Promise<DecodedImage | null>;

/** The size `image` scales down to so its width fits `maxWidth`, keeping its aspect; `null` when it already fits. */
export function fitToWidth(image: ImageSize, maxWidth: number): ImageSize | null {
  if (image.width <= maxWidth) return null;
  return { width: maxWidth, height: Math.max(1, Math.round((image.height * maxWidth) / image.width)) };
}

const mediaType = (contentType: string) => contentType.split(';')[0].trim().toLowerCase();

/** Whether a variant can be made from this type: a GIF keeps its animation and an SVG its vectors as the original. */
export function isScalableImageType(contentType: string): boolean {
  const type = mediaType(contentType);
  return type.startsWith('image/') && type !== 'image/gif' && type !== 'image/svg+xml';
}

const ALPHA_IMAGE_TYPES = ['image/png', 'image/apng', 'image/webp', 'image/avif'];

/**
 * The formats to try for a variant, best first. Where the browser cannot write WebP (Safari), an image whose format
 * can carry transparency falls back to PNG so it keeps it, and any other image to JPEG.
 */
export function variantEncodings(contentType: string): readonly string[] {
  return ['image/webp', ALPHA_IMAGE_TYPES.indexOf(mediaType(contentType)) >= 0 ? 'image/png' : 'image/jpeg'];
}

/** How many leading bytes `isAnimatedImage` reads: enough to reach a PNG's `acTL` past large metadata chunks. */
export const IMAGE_HEAD_BYTES = 64 * 1024;

const hasAscii = (bytes: Uint8Array, offset: number, text: string) =>
  offset + text.length <= bytes.length &&
  text.split('').every((char, index) => bytes[offset + index] === char.charCodeAt(0));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// An animated PNG names its frames in an `acTL` chunk, which must come before the first `IDAT`
function isAnimatedPng(head: Uint8Array): boolean {
  if (!PNG_SIGNATURE.every((byte, index) => head[index] === byte)) return false;
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= head.length) {
    if (hasAscii(head, offset + 4, 'acTL')) return true;
    if (hasAscii(head, offset + 4, 'IDAT')) return false;
    const length = ((head[offset] << 24) | (head[offset + 1] << 16) | (head[offset + 2] << 8) | head[offset + 3]) >>> 0;
    offset += 12 + length;
  }
  return false;
}

// An animated WebP is an extended (`VP8X`) file with the animation flag set
const isAnimatedWebp = (head: Uint8Array) =>
  hasAscii(head, 0, 'RIFF') && hasAscii(head, 8, 'WEBP') && hasAscii(head, 12, 'VP8X') && (head[20] & 0x02) !== 0;

/** Whether the first bytes of an image say it is an animated PNG or WebP, of which a resize would keep one frame. */
export function isAnimatedImage(head: Uint8Array): boolean {
  return isAnimatedPng(head) || isAnimatedWebp(head);
}

/** A variant, or why the original stands in for it: nothing to scale, or scaling failed. */
export type ScaledVariant = LocalMediaBody | 'original' | 'failed';

/**
 * The variant of `original` that fits `maxWidth`. `original` when there is nothing to scale (not a still raster
 * image, one the browser cannot decode, or one that already fits) and `failed` when decoding threw or no format
 * could be written; the caller serves the original either way.
 */
export async function scaleImageVariant(
  original: LocalMediaBody,
  maxWidth: number,
  decode: DecodeImage,
): Promise<ScaledVariant> {
  if (!isScalableImageType(original.contentType)) return 'original';
  try {
    const head = new Uint8Array(await original.blob.slice(0, IMAGE_HEAD_BYTES).arrayBuffer());
    if (isAnimatedImage(head)) return 'original';
    const image = await decode(original.blob);
    if (image === null) return 'original';
    try {
      const size = fitToWidth(image, maxWidth);
      if (size === null) return 'original';
      const blob = await image.encode(size, variantEncodings(original.contentType));
      return blob === null ? 'failed' : { blob, contentType: blob.type };
    } finally {
      image.close();
    }
  } catch {
    return 'failed';
  }
}

const LOSSY_QUALITY = 0.82;

/** `DecodeImage` over `createImageBitmap` and `OffscreenCanvas`, both available to a service worker. */
export const decodeImageWithCanvas: DecodeImage = async (image) => {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  return {
    width: bitmap.width,
    height: bitmap.height,
    async encode(size, types) {
      const canvas = new OffscreenCanvas(size.width, size.height);
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      for (const type of types) {
        // A type the browser cannot write comes back as PNG instead of failing
        const blob = await canvas.convertToBlob({ type, quality: LOSSY_QUALITY });
        if (types.indexOf(blob.type) >= 0) return blob;
      }
      return null;
    },
    close: () => bitmap.close(),
  };
};
