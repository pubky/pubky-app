import { IMAGE_ENCODE_QUALITY, IMAGE_MAX_DIMENSION, IMAGE_MAX_RAW_SIZE } from '@/config/images';

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
const WEBP_MIME_TYPE = 'image/webp';
const FILE_HEADER_BYTES_LENGTH = 512;
const IMAGE_DIMENSION_HEADER_BYTES_LENGTH = 256 * 1024;
const WEBP_ANIMATION_FLAG = 0x02;
const WEBP_XMP_FLAG = 0x04;
const WEBP_EXIF_FLAG = 0x08;
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

type ImageDimensions = {
  width: number;
  height: number;
};

type LoadedRasterImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

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

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function isChunkType(bytes: Uint8Array, offset: number, type: string): boolean {
  return (
    bytes[offset] === type.charCodeAt(0) &&
    bytes[offset + 1] === type.charCodeAt(1) &&
    bytes[offset + 2] === type.charCodeAt(2) &&
    bytes[offset + 3] === type.charCodeAt(3)
  );
}

function hasAnimatedWebpChunk(bytes: Uint8Array): boolean {
  if (!isWebpSignature(bytes)) {
    return false;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkSize = readUint32LittleEndian(bytes, offset + 4);
    const dataOffset = offset + 8;

    if (isChunkType(bytes, offset, 'ANIM')) {
      return true;
    }

    if (
      isChunkType(bytes, offset, 'VP8X') &&
      chunkSize >= 1 &&
      dataOffset < bytes.length &&
      (bytes[dataOffset] & WEBP_ANIMATION_FLAG) !== 0
    ) {
      return true;
    }

    const paddedChunkSize = chunkSize + (chunkSize % 2);
    const nextOffset = dataOffset + paddedChunkSize;
    if (nextOffset <= offset || nextOffset > bytes.length) {
      break;
    }

    offset = nextOffset;
  }

  return false;
}

async function isAnimatedWebp(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return hasAnimatedWebpChunk(bytes);
}

/**
 * Removes EXIF and XMP metadata chunks from a WebP RIFF container without
 * touching the image/animation frames. Animated WebP can't go through the
 * canvas re-encode path (that would flatten it to a single frame), so this
 * keeps the animation intact while still stripping embedded metadata such as
 * GPS EXIF. Returns the original bytes if there is nothing to strip or the
 * container is malformed.
 */
function stripWebpMetadataChunks(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  if (!isWebpSignature(bytes)) {
    return bytes;
  }

  const output = new Uint8Array(bytes.length);
  output.set(bytes.subarray(0, 12), 0); // RIFF header + 'WEBP' fourCC
  let writeOffset = 12;

  let offset = 12;
  let strippedAny = false;
  let clean = true;
  while (offset + 8 <= bytes.length) {
    const chunkSize = readUint32LittleEndian(bytes, offset + 4);
    const paddedChunkSize = chunkSize + (chunkSize % 2);
    const nextOffset = offset + 8 + paddedChunkSize;
    if (nextOffset <= offset || nextOffset > bytes.length) {
      clean = false;
      break;
    }

    if (isChunkType(bytes, offset, 'EXIF') || isChunkType(bytes, offset, 'XMP ')) {
      strippedAny = true;
      offset = nextOffset;
      continue;
    }

    output.set(bytes.subarray(offset, nextOffset), writeOffset);
    // Clear the EXIF/XMP presence flags in VP8X so the container stays valid.
    if (isChunkType(bytes, offset, 'VP8X') && chunkSize >= 1) {
      output[writeOffset + 8] &= ~(WEBP_EXIF_FLAG | WEBP_XMP_FLAG);
    }
    writeOffset += nextOffset - offset;
    offset = nextOffset;
  }

  if (!clean || !strippedAny) {
    return bytes;
  }

  const result = output.subarray(0, writeOffset);
  const riffSize = writeOffset - 8; // total size minus 'RIFF' fourCC + size field
  result[4] = riffSize & 0xff;
  result[5] = (riffSize >>> 8) & 0xff;
  result[6] = (riffSize >>> 16) & 0xff;
  result[7] = (riffSize >>> 24) & 0xff;
  return result;
}

function isJpegStartOfFrameMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!isJpegSignature(bytes)) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xda || marker === 0xd9) {
      return null;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      return null;
    }

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return null;
    }

    if (isJpegStartOfFrameMarker(marker) && segmentLength >= 7) {
      const height = readUint16BigEndian(bytes, offset + 3);
      const width = readUint16BigEndian(bytes, offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }

    offset += segmentLength;
  }

  return null;
}

function parsePngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!isPngSignature(bytes) || bytes.length < 24 || !isChunkType(bytes, 12, 'IHDR')) {
    return null;
  }

  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];

  return width > 0 && height > 0 ? { width, height } : null;
}

function parseWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!isWebpSignature(bytes)) {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkSize = readUint32LittleEndian(bytes, offset + 4);
    const dataOffset = offset + 8;

    if (isChunkType(bytes, offset, 'VP8X') && chunkSize >= 10 && dataOffset + 10 <= bytes.length) {
      return {
        width: readUint24LittleEndian(bytes, dataOffset + 4) + 1,
        height: readUint24LittleEndian(bytes, dataOffset + 7) + 1,
      };
    }

    if (isChunkType(bytes, offset, 'VP8 ') && chunkSize >= 10 && dataOffset + 10 <= bytes.length) {
      return {
        width: readUint16LittleEndian(bytes, dataOffset + 6) & 0x3fff,
        height: readUint16LittleEndian(bytes, dataOffset + 8) & 0x3fff,
      };
    }

    if (isChunkType(bytes, offset, 'VP8L') && chunkSize >= 5 && dataOffset + 5 <= bytes.length) {
      const b0 = bytes[dataOffset + 1];
      const b1 = bytes[dataOffset + 2];
      const b2 = bytes[dataOffset + 3];
      const b3 = bytes[dataOffset + 4];
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }

    const paddedChunkSize = chunkSize + (chunkSize % 2);
    const nextOffset = dataOffset + paddedChunkSize;
    if (nextOffset <= offset || nextOffset > bytes.length) {
      break;
    }

    offset = nextOffset;
  }

  return null;
}

async function getImageDimensions(file: File, mimeType: string): Promise<ImageDimensions | null> {
  const header = new Uint8Array(await file.slice(0, IMAGE_DIMENSION_HEADER_BYTES_LENGTH).arrayBuffer());

  switch (mimeType) {
    case 'image/jpeg':
      return parseJpegDimensions(header);
    case 'image/png':
      return parsePngDimensions(header);
    case WEBP_MIME_TYPE:
      return parseWebpDimensions(header);
    default:
      return null;
  }
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

async function loadHtmlImage(file: File): Promise<LoadedRasterImage> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const { width, height } = getScaledDimensions(naturalWidth, naturalHeight, IMAGE_MAX_DIMENSION);

    return {
      source: image,
      width,
      height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function getCanvasEncodeQuality(mimeType: string): number | undefined {
  return MIME_TYPES_WITH_LOSSY_REENCODING.has(mimeType) ? IMAGE_ENCODE_QUALITY : undefined;
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

function getScaledDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longestEdge = Math.max(width, height);

  if (longestEdge <= maxDimension || longestEdge === 0) {
    return { width, height };
  }

  const scale = maxDimension / longestEdge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadResizedImageBitmap(file: File, mimeType: string): Promise<LoadedRasterImage | null> {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }

  const dimensions = await getImageDimensions(file, mimeType);
  if (!dimensions) {
    return null;
  }

  const { width, height } = getScaledDimensions(dimensions.width, dimensions.height, IMAGE_MAX_DIMENSION);

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    });

    return {
      source: bitmap,
      width,
      height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    return null;
  }
}

async function sanitizeRasterImage(file: File, mimeType: string): Promise<Blob> {
  const image = (await loadResizedImageBitmap(file, mimeType)) ?? (await loadHtmlImage(file));
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  try {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas context for metadata stripping');
    }

    context.imageSmoothingQuality = 'high';
    context.drawImage(image.source, 0, 0, image.width, image.height);
    return await canvasToBlob(canvas, mimeType, getCanvasEncodeQuality(mimeType));
  } finally {
    image.cleanup();
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
 * - JPEG/WebP: encoded at configured quality to reduce upload size
 * - Oversized raster images: downscaled preserving aspect ratio
 * - Animated WebP: skips canvas (keeps frames) but strips EXIF/XMP chunks
 * - GIF and other raster types: keep bytes to avoid visual regressions
 * - SVG: best-effort XML rewrite that removes active content and risky references
 * - All image types: replace original filename with an obfuscated one
 */
export async function stripImageMetadata(file: File): Promise<File> {
  const imageMimeType = await detectImageMimeType(file);
  if (!imageMimeType) {
    return file;
  }

  if (file.size > IMAGE_MAX_RAW_SIZE) {
    throw new Error('Image file size exceeds upload limits');
  }

  const obfuscatedName = generateObfuscatedImageFileName(file, imageMimeType);

  if (imageMimeType === SVG_MIME_TYPE) {
    const sanitizedBlob = await sanitizeSvgImage(file);

    return new File([sanitizedBlob], obfuscatedName, {
      type: sanitizedBlob.type || imageMimeType,
      lastModified: file.lastModified,
    });
  }

  const isAnimatedWebpUpload = imageMimeType === WEBP_MIME_TYPE && (await isAnimatedWebp(file));
  if (!MIME_TYPES_WITH_CANVAS_SANITIZATION.has(imageMimeType) || isAnimatedWebpUpload) {
    // Animated WebP bypasses canvas re-encoding; strip its EXIF/XMP chunks so
    // metadata (e.g. GPS) never reaches the homeserver while keeping frames.
    const body = isAnimatedWebpUpload ? stripWebpMetadataChunks(new Uint8Array(await file.arrayBuffer())) : file;
    return new File([body], obfuscatedName, {
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
