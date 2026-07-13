/**
 * Image compression configuration applied during upload sanitization
 * (see src/libs/image/stripImageMetadata.ts).
 */

/**
 * Maximum output file size for images uploaded to the homeserver after
 * sanitization and compression.
 */
export const IMAGE_MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

/**
 * Longest-edge steps tried when the first encode still exceeds
 * {@link IMAGE_MAX_UPLOAD_SIZE}. The last value (768) is the smallest
 * dimension attempted before giving up.
 */
export const IMAGE_COMPRESSION_DIMENSION_STEPS = [2048, 1536, 1280, 1024, 768];

/**
 * Lossy quality steps (0..1) for JPEG/WebP re-encoding during progressive
 * compression.
 */
export const IMAGE_COMPRESSION_QUALITY_STEPS = [0.82, 0.72, 0.62, 0.52];

/**
 * Maximum length (in pixels) of the longest edge for uploaded raster images.
 * Images larger than this are downscaled preserving aspect ratio. Chosen to
 * stay well above typical display sizes while cutting phone-photo resolutions
 * (e.g. 4032px) by about half.
 */
export const IMAGE_MAX_DIMENSION = IMAGE_COMPRESSION_DIMENSION_STEPS[0];

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
export const IMAGE_ENCODE_QUALITY = IMAGE_COMPRESSION_QUALITY_STEPS[0];
