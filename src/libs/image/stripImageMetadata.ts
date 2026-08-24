import {
  IMAGE_COMPRESSION_DIMENSION_STEPS,
  IMAGE_COMPRESSION_QUALITY_STEPS,
  IMAGE_MAX_RAW_SIZE,
  IMAGE_MAX_UPLOAD_SIZE,
} from '@/config/images';
import { throwImageUploadSizeLimit } from '@/libs/image/imageUploadSizeLimit';

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
const JPEG_APP1_MARKER = 0xe1;
const JPEG_EXIF_IDENTIFIER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const TIFF_LITTLE_ENDIAN_BYTE = 0x49; // 'I'
const TIFF_BIG_ENDIAN_BYTE = 0x4d; // 'M'
const TIFF_MAGIC = 42;
const TIFF_IFD_ENTRY_LENGTH = 12;
const EXIF_ORIENTATION_TAG = 0x0112;
/** EXIF orientations 5-8 rotate the image 90°, swapping display width/height. */
const EXIF_ROTATED_ORIENTATIONS = new Set([5, 6, 7, 8]);
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

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function isChunkType(bytes: Uint8Array, offset: number, type: string): boolean {
  return (
    bytes[offset] === type.charCodeAt(0) &&
    bytes[offset + 1] === type.charCodeAt(1) &&
    bytes[offset + 2] === type.charCodeAt(2) &&
    bytes[offset + 3] === type.charCodeAt(3)
  );
}

type WebpChunk = {
  offset: number;
  dataOffset: number;
  chunkSize: number;
};

/**
 * Walks the RIFF chunk table. A chunk whose header fits in the buffer is
 * listed even when its declared payload overruns it, so header-level checks
 * (fourCC, VP8X flags) still see truncated trailing chunks; `clean` is false
 * for such malformed or truncated containers.
 */
function listWebpChunks(bytes: Uint8Array): { chunks: WebpChunk[]; clean: boolean } {
  const chunks: WebpChunk[] = [];
  if (!isWebpSignature(bytes)) {
    return { chunks, clean: false };
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkSize = readUint32LittleEndian(bytes, offset + 4);
    const dataOffset = offset + 8;
    chunks.push({ offset, dataOffset, chunkSize });

    const paddedChunkSize = chunkSize + (chunkSize % 2);
    const nextOffset = dataOffset + paddedChunkSize;
    if (nextOffset <= offset || nextOffset > bytes.length) {
      return { chunks, clean: false };
    }

    offset = nextOffset;
  }

  return { chunks, clean: true };
}

function hasAnimatedWebpChunk(bytes: Uint8Array): boolean {
  const { chunks } = listWebpChunks(bytes);
  return chunks.some(
    ({ offset, dataOffset, chunkSize }) =>
      isChunkType(bytes, offset, 'ANIM') ||
      (isChunkType(bytes, offset, 'VP8X') &&
        chunkSize >= 1 &&
        dataOffset < bytes.length &&
        (bytes[dataOffset] & WEBP_ANIMATION_FLAG) !== 0),
  );
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
  const { chunks, clean } = listWebpChunks(bytes);
  if (!clean) {
    return bytes;
  }

  const output = new Uint8Array(bytes.length);
  output.set(bytes.subarray(0, 12), 0); // RIFF header + 'WEBP' fourCC
  let writeOffset = 12;
  let strippedAny = false;

  for (const { offset, dataOffset, chunkSize } of chunks) {
    const nextOffset = dataOffset + chunkSize + (chunkSize % 2);

    if (isChunkType(bytes, offset, 'EXIF') || isChunkType(bytes, offset, 'XMP ')) {
      strippedAny = true;
      continue;
    }

    output.set(bytes.subarray(offset, nextOffset), writeOffset);
    // Clear the EXIF/XMP presence flags in VP8X so the container stays valid.
    if (isChunkType(bytes, offset, 'VP8X') && chunkSize >= 1) {
      output[writeOffset + 8] &= ~(WEBP_EXIF_FLAG | WEBP_XMP_FLAG);
    }
    writeOffset += nextOffset - offset;
  }

  if (!strippedAny) {
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

type JpegSegment = {
  marker: number;
  /** Position of the segment's 2-byte length field; payload follows it. */
  offset: number;
  segmentLength: number;
};

/**
 * Yields JPEG marker segments in file order, stopping at start-of-scan/EOI
 * (no segments live past the entropy-coded data) or on malformed structure.
 */
function* iterateJpegSegments(bytes: Uint8Array): Generator<JpegSegment> {
  let offset = 2;
  while (offset + 4 < bytes.length) {
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
      return;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      return;
    }

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return;
    }

    yield { marker, offset, segmentLength };
    offset += segmentLength;
  }
}

function parseJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (!isJpegSignature(bytes)) {
    return null;
  }

  for (const { marker, offset, segmentLength } of iterateJpegSegments(bytes)) {
    if (isJpegStartOfFrameMarker(marker) && segmentLength >= 7) {
      const height = readUint16BigEndian(bytes, offset + 3);
      const width = readUint16BigEndian(bytes, offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
  }

  return null;
}

function parseTiffOrientation(bytes: Uint8Array, tiffOffset: number, endOffset: number): number | null {
  if (tiffOffset + 8 > endOffset) {
    return null;
  }

  const byteOrder = bytes[tiffOffset];
  const isLittleEndian = byteOrder === TIFF_LITTLE_ENDIAN_BYTE;
  if (bytes[tiffOffset + 1] !== byteOrder || (!isLittleEndian && byteOrder !== TIFF_BIG_ENDIAN_BYTE)) {
    return null;
  }

  const readUint16 = isLittleEndian ? readUint16LittleEndian : readUint16BigEndian;
  const readUint32 = isLittleEndian ? readUint32LittleEndian : readUint32BigEndian;

  if (readUint16(bytes, tiffOffset + 2) !== TIFF_MAGIC) {
    return null;
  }

  const ifdStart = tiffOffset + readUint32(bytes, tiffOffset + 4);
  if (ifdStart + 2 > endOffset) {
    return null;
  }

  const entryCount = readUint16(bytes, ifdStart);
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdStart + 2 + index * TIFF_IFD_ENTRY_LENGTH;
    if (entryOffset + TIFF_IFD_ENTRY_LENGTH > endOffset) {
      return null;
    }

    if (readUint16(bytes, entryOffset) === EXIF_ORIENTATION_TAG) {
      // SHORT values sit left-justified in the 4-byte value field, so the
      // endian-matched 16-bit read at the field start is correct for II and MM.
      const orientation = readUint16(bytes, entryOffset + 8);
      return orientation >= 1 && orientation <= 8 ? orientation : null;
    }
  }

  return null;
}

function parseJpegExifOrientation(bytes: Uint8Array): number | null {
  if (!isJpegSignature(bytes)) {
    return null;
  }

  for (const { marker, offset, segmentLength } of iterateJpegSegments(bytes)) {
    if (
      marker === JPEG_APP1_MARKER &&
      segmentLength >= 2 + JPEG_EXIF_IDENTIFIER.length &&
      JPEG_EXIF_IDENTIFIER.every((value, index) => bytes[offset + 2 + index] === value)
    ) {
      return parseTiffOrientation(bytes, offset + 2 + JPEG_EXIF_IDENTIFIER.length, offset + segmentLength);
    }
  }

  return null;
}

/**
 * JPEG SOF dimensions describe the stored pixels, while phone cameras save
 * portrait shots as unrotated sensor pixels plus an EXIF orientation tag.
 * Decoding with imageOrientation: 'from-image' applies that rotation, so for
 * 90°-rotated files the resize target must be computed in display space or
 * portrait photos get squeezed into landscape frames (#2268).
 */
function getOrientedJpegDimensions(header: Uint8Array): ImageDimensions | null {
  const dimensions = parseJpegDimensions(header);
  if (!dimensions) {
    return null;
  }

  const orientation = parseJpegExifOrientation(header);
  return orientation !== null && EXIF_ROTATED_ORIENTATIONS.has(orientation)
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
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
  const { chunks } = listWebpChunks(bytes);

  for (const { offset, dataOffset, chunkSize } of chunks) {
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
  }

  return null;
}

/**
 * WebP EXIF metadata may carry an orientation that decoders apply with
 * imageOrientation: 'from-image', and the EXIF chunk usually sits after the
 * image data — beyond the sliced header — so the rotation cannot be read
 * cheaply. The VP8X flags byte at the container start reliably announces it.
 */
function hasWebpExifFlag(bytes: Uint8Array): boolean {
  const { chunks } = listWebpChunks(bytes);
  const vp8x = chunks.find(({ offset }) => isChunkType(bytes, offset, 'VP8X'));
  return (
    vp8x !== undefined &&
    vp8x.chunkSize >= 1 &&
    vp8x.dataOffset < bytes.length &&
    (bytes[vp8x.dataOffset] & WEBP_EXIF_FLAG) !== 0
  );
}

async function getImageDimensions(file: File, mimeType: string): Promise<ImageDimensions | null> {
  const header = new Uint8Array(await file.slice(0, IMAGE_DIMENSION_HEADER_BYTES_LENGTH).arrayBuffer());

  switch (mimeType) {
    case 'image/jpeg':
      return getOrientedJpegDimensions(header);
    case 'image/png':
      return parsePngDimensions(header);
    case WEBP_MIME_TYPE:
      // Returning null skips decode-time resizing; the full-decode fallback
      // scales from the oriented bitmap, preserving the aspect ratio.
      return hasWebpExifFlag(header) ? null : parseWebpDimensions(header);
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

async function loadHtmlImage(file: File, maxDimension: number): Promise<LoadedRasterImage> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const { width, height } = getScaledDimensions(naturalWidth, naturalHeight, maxDimension);

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

async function loadResizedImageBitmap(
  file: File,
  mimeType: string,
  maxDimension: number,
): Promise<LoadedRasterImage | null> {
  if (typeof createImageBitmap !== 'function') {
    return null;
  }

  const dimensions = await getImageDimensions(file, mimeType);
  if (!dimensions) {
    return null;
  }

  const { width, height } = getScaledDimensions(dimensions.width, dimensions.height, maxDimension);

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    });

    if (bitmap.width === width && bitmap.height === height) {
      return {
        source: bitmap,
        width,
        height,
        cleanup: () => bitmap.close(),
      };
    }

    // The browser ignored or reordered the decode-time resize (some skip the
    // resize options, some apply EXIF orientation after resizing). Decode
    // without resizing and let the canvas draw scale from the true dimensions.
    bitmap.close();
    const orientedBitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scaled = getScaledDimensions(orientedBitmap.width, orientedBitmap.height, maxDimension);

    return {
      source: orientedBitmap,
      width: scaled.width,
      height: scaled.height,
      cleanup: () => orientedBitmap.close(),
    };
  } catch {
    return null;
  }
}

async function sanitizeRasterImage(file: File, mimeType: string): Promise<Blob> {
  const isLossy = MIME_TYPES_WITH_LOSSY_REENCODING.has(mimeType);
  const qualitySteps = isLossy ? IMAGE_COMPRESSION_QUALITY_STEPS : [undefined];

  for (const maxDimension of IMAGE_COMPRESSION_DIMENSION_STEPS) {
    const image =
      (await loadResizedImageBitmap(file, mimeType, maxDimension)) ?? (await loadHtmlImage(file, maxDimension));
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

      for (const quality of qualitySteps) {
        const blob = await canvasToBlob(canvas, mimeType, quality);
        if (blob.size <= IMAGE_MAX_UPLOAD_SIZE) {
          return blob;
        }
      }
    } finally {
      image.cleanup();
    }
  }

  throwImageUploadSizeLimit('raster');
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
 * - JPEG/WebP: progressively re-encoded at lower quality and dimensions until under 5MB
 * - PNG: progressively downscaled until under 5MB
 * - Oversized raster images: downscaled preserving aspect ratio
 * - EXIF-rotated photos (portrait phone shots): resize target computed in
 *   display space so the aspect ratio survives re-encoding
 * - GIF: keep bytes to preserve animation; reject when still over 5MB
 * - Animated WebP: skips canvas (keeps frames) but strips EXIF/XMP chunks; reject when still over 5MB
 * - SVG: best-effort XML rewrite that removes active content and risky references; reject when still over 5MB
 * - All image types: replace original filename with an obfuscated one
 */
export async function stripImageMetadata(file: File): Promise<File> {
  const imageMimeType = await detectImageMimeType(file);
  if (!imageMimeType) {
    return file;
  }

  if (file.size > IMAGE_MAX_RAW_SIZE) {
    throwImageUploadSizeLimit('raw');
  }

  const obfuscatedName = generateObfuscatedImageFileName(file, imageMimeType);

  if (imageMimeType === SVG_MIME_TYPE) {
    const sanitizedBlob = await sanitizeSvgImage(file);
    if (sanitizedBlob.size > IMAGE_MAX_UPLOAD_SIZE) {
      throwImageUploadSizeLimit('svg');
    }

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
    const outputSize = body instanceof File ? body.size : body.byteLength;
    if (outputSize > IMAGE_MAX_UPLOAD_SIZE) {
      const kind = isAnimatedWebpUpload ? 'animated-webp' : imageMimeType === 'image/gif' ? 'gif' : 'raster';
      throwImageUploadSizeLimit(kind);
    }
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
