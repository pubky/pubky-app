const IMAGE_MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const IMAGE_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

const MIME_TYPES_WITH_CANVAS_SANITIZATION = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TYPES_WITH_LOSSY_REENCODING = new Set(['image/jpeg', 'image/webp']);
const LOSSY_IMAGE_ENCODE_QUALITY = 1;
const FILE_HEADER_BYTES_LENGTH = 512;

function getFileExtension(file: File): string | null {
  const parts = file.name.split('.');
  if (parts.length <= 1) {
    return null;
  }

  const extension = parts.at(-1)?.toLowerCase();
  return extension ?? null;
}

function getImageMimeTypeFromFileType(file: File): string | null {
  const normalizedType = file.type.toLowerCase();
  return normalizedType.startsWith('image/') ? normalizedType : null;
}

function getImageMimeTypeFromExtension(file: File): string | null {
  const extension = getFileExtension(file);
  if (!extension) {
    return null;
  }
  return IMAGE_EXTENSION_TO_MIME_TYPE[extension] ?? null;
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }
  return prefix.every((value, index) => bytes[index] === value);
}

function isPngSignature(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isJpegSignature(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
}

function isGifSignature(bytes: Uint8Array): boolean {
  return (
    hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) || hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
  );
}

function isWebpSignature(bytes: Uint8Array): boolean {
  return (
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

async function getImageMimeTypeFromMagicBytes(file: File): Promise<string | null> {
  const header = new Uint8Array(await file.slice(0, FILE_HEADER_BYTES_LENGTH).arrayBuffer());
  if (isJpegSignature(header)) {
    return 'image/jpeg';
  }
  if (isPngSignature(header)) {
    return 'image/png';
  }
  if (isWebpSignature(header)) {
    return 'image/webp';
  }
  if (isGifSignature(header)) {
    return 'image/gif';
  }
  return null;
}

async function detectImageMimeType(file: File): Promise<string | null> {
  const mimeTypeFromFileType = getImageMimeTypeFromFileType(file);
  if (mimeTypeFromFileType) {
    return mimeTypeFromFileType;
  }

  const mimeTypeFromMagicBytes = await getImageMimeTypeFromMagicBytes(file);
  if (mimeTypeFromMagicBytes) {
    return mimeTypeFromMagicBytes;
  }

  return getImageMimeTypeFromExtension(file);
}

function getImageFileExtension(file: File, mimeType: string): string {
  const mappedExtension = IMAGE_MIME_TYPE_TO_EXTENSION[mimeType];
  if (mappedExtension) {
    return mappedExtension;
  }

  const extension = getFileExtension(file);
  if (extension) {
    return extension;
  }

  return 'img';
}

function generateObfuscatedImageFileName(file: File, mimeType: string): string {
  const extension = getImageFileExtension(file, mimeType);
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

  return `${randomPart}.${extension}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Failed to load image for metadata stripping')));
    image.src = src;
  });
}

function getCanvasEncodeQuality(mimeType: string): number | undefined {
  return MIME_TYPES_WITH_LOSSY_REENCODING.has(mimeType) ? LOSSY_IMAGE_ENCODE_QUALITY : undefined;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode sanitized image'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

async function sanitizeRasterImage(file: File, mimeType: string): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas context for metadata stripping');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas, mimeType, getCanvasEncodeQuality(mimeType));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Removes sensitive metadata from supported image formats before upload.
 * - JPEG/PNG/WebP: re-encodes via canvas to strip metadata (fail-closed on errors)
 * - JPEG/WebP: encoded at quality 1.0 to avoid browser default quality reduction
 * - GIF and other raster types: keep bytes to avoid visual regressions
 * - SVG: rejected — cannot be safely sanitized without a full XML sanitizer
 * - All image types: replace original filename with an obfuscated one
 */
export async function stripImageMetadata(file: File): Promise<File> {
  const imageMimeType = await detectImageMimeType(file);
  if (!imageMimeType) {
    return file;
  }

  if (imageMimeType === 'image/svg+xml') {
    throw new Error('SVG uploads are not supported');
  }

  const obfuscatedName = generateObfuscatedImageFileName(file, imageMimeType);

  if (!MIME_TYPES_WITH_CANVAS_SANITIZATION.has(imageMimeType)) {
    return new File([file], obfuscatedName, {
      type: imageMimeType,
      lastModified: file.lastModified,
    });
  }

  const sanitizedBlob = await sanitizeRasterImage(file, imageMimeType);

  return new File([sanitizedBlob], obfuscatedName, {
    type: sanitizedBlob.type || imageMimeType,
    lastModified: file.lastModified,
  });
}
