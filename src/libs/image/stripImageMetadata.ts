const IMAGE_MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

const MIME_TYPES_WITH_CANVAS_SANITIZATION = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TYPES_WITH_LOSSY_REENCODING = new Set(['image/jpeg', 'image/webp']);
const LOSSY_IMAGE_ENCODE_QUALITY = 1;

function getImageFileExtension(file: File): string {
  const mappedExtension = IMAGE_MIME_TYPE_TO_EXTENSION[file.type];
  if (mappedExtension) {
    return mappedExtension;
  }

  const parts = file.name.split('.');
  if (parts.length > 1) {
    const extension = parts.at(-1)?.toLowerCase();
    if (extension) {
      return extension;
    }
  }

  return 'img';
}

function generateObfuscatedImageFileName(file: File): string {
  const extension = getImageFileExtension(file);
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

async function sanitizeRasterImage(file: File): Promise<Blob> {
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
    return await canvasToBlob(canvas, file.type, getCanvasEncodeQuality(file.type));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Removes sensitive metadata from supported image formats before upload.
 * - JPEG/PNG/WebP: re-encodes via canvas to strip metadata (fail-closed on errors)
 * - JPEG/WebP: encoded at quality 1.0 to avoid browser default quality reduction
 * - GIF/SVG and other image types: keep bytes to avoid visual regressions
 * - All image types: replace original filename with an obfuscated one
 */
export async function stripImageMetadata(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const obfuscatedName = generateObfuscatedImageFileName(file);

  if (!MIME_TYPES_WITH_CANVAS_SANITIZATION.has(file.type)) {
    return new File([file], obfuscatedName, {
      type: file.type,
      lastModified: file.lastModified,
    });
  }

  const sanitizedBlob = await sanitizeRasterImage(file);

  return new File([sanitizedBlob], obfuscatedName, {
    type: sanitizedBlob.type || file.type,
    lastModified: file.lastModified,
  });
}
