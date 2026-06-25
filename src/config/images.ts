/**
 * Image compression configuration applied during upload sanitization
 * (see src/libs/image/stripImageMetadata.ts).
 */

/**
 * Maximum length (in pixels) of the longest edge for uploaded raster images.
 * Images larger than this are downscaled preserving aspect ratio. Chosen to
 * stay well above typical display sizes while cutting phone-photo resolutions
 * (e.g. 4032px) by about half.
 */
export const IMAGE_MAX_DIMENSION = 2048;

/**
 * Maximum raw file size accepted for image uploads before any browser decode
 * or canvas work. This stays below the protocol file-size ceiling to avoid
 * pathological images exhausting tab memory before downscaling can run.
 */
export const IMAGE_MAX_RAW_SIZE = 20 * 1024 * 1024;

/**
 * Encode quality (0..1) for lossy raster re-encoding (JPEG/WebP) during
 * upload sanitization. 0.82 is near-visually-lossless for photos while
 * substantially smaller than quality 1.0.
 */
export const IMAGE_ENCODE_QUALITY = 0.82;
