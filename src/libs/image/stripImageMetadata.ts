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
const SVG_MIME_TYPE = 'image/svg+xml';
const LOSSY_IMAGE_ENCODE_QUALITY = 1;
const FILE_HEADER_BYTES_LENGTH = 512;
const TEXT_DECODER = new TextDecoder();
const SVG_ACTIVE_ELEMENT_NAMES = new Set([
  'animate',
  'animatemotion',
  'animatetransform',
  'audio',
  'canvas',
  'discard',
  'embed',
  'foreignobject',
  'iframe',
  'script',
  'set',
  'style',
  'video',
]);
const SVG_RISKY_URL_ATTRIBUTES = new Set(['href', 'src']);

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

function isSvgSignature(bytes: Uint8Array): boolean {
  const text = TEXT_DECODER.decode(bytes);
  const normalized = text
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  return normalized.startsWith('<svg') || (normalized.startsWith('<?xml') && normalized.includes('<svg'));
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
  if (isSvgSignature(header)) {
    return SVG_MIME_TYPE;
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

function isSvgParserError(document: Document): boolean {
  return document.getElementsByTagName('parsererror').length > 0;
}

function normalizeSvgName(name: string): string {
  return name.toLowerCase();
}

function isSafeSvgReference(value: string): boolean {
  const trimmedValue = value.trim();
  const normalizedValue = trimmedValue.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();

  if (!normalizedValue) {
    return true;
  }

  if (normalizedValue.startsWith('#')) {
    return true;
  }

  if (
    normalizedValue.startsWith('data:image/png') ||
    normalizedValue.startsWith('data:image/jpeg') ||
    normalizedValue.startsWith('data:image/gif') ||
    normalizedValue.startsWith('data:image/webp')
  ) {
    return true;
  }

  if (normalizedValue.includes('javascript:') || normalizedValue.includes('data:text/html')) {
    return false;
  }

  return !/^(https?:|blob:|file:|ftp:|\/\/)/.test(normalizedValue);
}

function isSafeSvgAttribute(attribute: Attr): boolean {
  const name = normalizeSvgName(attribute.localName || attribute.name);
  const value = attribute.value;

  if (name.startsWith('on')) {
    return false;
  }

  if (name === 'style') {
    return false;
  }

  if (SVG_RISKY_URL_ATTRIBUTES.has(name)) {
    return isSafeSvgReference(value);
  }

  if (value.toLowerCase().includes('url(')) {
    return !/(url\(\s*['"]?(?:https?:|blob:|file:|ftp:|\/\/|javascript:|data:text\/html|data:image\/svg\+xml))/i.test(
      value,
    );
  }

  return true;
}

function sanitizeSvgElement(element: Element): void {
  const elementName = normalizeSvgName(element.localName || element.tagName);
  if (SVG_ACTIVE_ELEMENT_NAMES.has(elementName)) {
    element.remove();
    return;
  }

  for (const attribute of Array.from(element.attributes)) {
    if (!isSafeSvgAttribute(attribute)) {
      element.removeAttributeNode(attribute);
    }
  }

  for (const child of Array.from(element.children)) {
    sanitizeSvgElement(child);
  }
}

async function sanitizeSvgImage(file: File): Promise<Blob> {
  const text = await file.text();
  const document = new DOMParser().parseFromString(text, SVG_MIME_TYPE);
  const root = document.documentElement;

  if (isSvgParserError(document) || normalizeSvgName(root.localName || root.tagName) !== 'svg') {
    throw new Error('Failed to parse SVG for metadata stripping');
  }

  sanitizeSvgElement(root);

  return new Blob([new XMLSerializer().serializeToString(root)], { type: SVG_MIME_TYPE });
}

/**
 * Removes sensitive metadata from supported image formats before upload.
 * - JPEG/PNG/WebP: re-encodes via canvas to strip metadata (fail-closed on errors)
 * - JPEG/WebP: encoded at quality 1.0 to avoid browser default quality reduction
 * - GIF and other raster types: keep bytes to avoid visual regressions
 * - SVG: best-effort XML rewrite that removes active content and risky references
 * - All image types: replace original filename with an obfuscated one
 */
export async function stripImageMetadata(file: File): Promise<File> {
  const imageMimeType = await detectImageMimeType(file);
  if (!imageMimeType) {
    return file;
  }

  const obfuscatedName = generateObfuscatedImageFileName(file, imageMimeType);

  if (imageMimeType === SVG_MIME_TYPE) {
    const sanitizedBlob = await sanitizeSvgImage(file);

    return new File([sanitizedBlob], obfuscatedName, {
      type: sanitizedBlob.type || imageMimeType,
      lastModified: file.lastModified,
    });
  }

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
