import { IMAGE_MAX_RAW_SIZE, IMAGE_MAX_UPLOAD_SIZE } from '@/config/images';
import { isAppError } from '@/libs/error/error.utils';

export const IMAGE_UPLOAD_SIZE_LIMIT_KINDS = ['raw', 'gif', 'animated-webp', 'svg', 'raster'] as const;

export type ImageUploadSizeLimitKind = (typeof IMAGE_UPLOAD_SIZE_LIMIT_KINDS)[number];

/** AppError context key for size-limit failures. */
export const IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY = 'imageUploadSizeLimitKind';

const IMAGE_UPLOAD_SIZE_LIMIT_MESSAGE_PREFIX = 'IMAGE_UPLOAD_SIZE_LIMIT:';

const IMAGE_UPLOAD_SIZE_LIMIT_KIND_SET = new Set<string>(IMAGE_UPLOAD_SIZE_LIMIT_KINDS);

/** Toast copy for each size-limit kind. */
const IMAGE_UPLOAD_SIZE_LIMIT_MESSAGES = {
  raw: (maxSize: string) => `Image is too large. Maximum size is ${maxSize}.`,
  gif: (maxSize: string) =>
    `This GIF exceeds the ${maxSize} upload limit and cannot be compressed. Please use a smaller GIF.`,
  'animated-webp': (maxSize: string) =>
    `This animated WebP exceeds the ${maxSize} upload limit and cannot be compressed. Please use a smaller file.`,
  svg: (maxSize: string) =>
    `This SVG exceeds the ${maxSize} upload limit after sanitization. Please use a smaller file.`,
  raster: (maxSize: string) =>
    `Image could not be compressed below ${maxSize}. Please use a smaller or lower-resolution image.`,
} as const satisfies Record<ImageUploadSizeLimitKind, (maxSize: string) => string>;

export function getImageUploadSizeLimitLabelMb(kind: ImageUploadSizeLimitKind): string {
  const bytes = kind === 'raw' ? IMAGE_MAX_RAW_SIZE : IMAGE_MAX_UPLOAD_SIZE;
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function isImageUploadSizeLimitKind(value: unknown): value is ImageUploadSizeLimitKind {
  return typeof value === 'string' && IMAGE_UPLOAD_SIZE_LIMIT_KIND_SET.has(value);
}

function parseImageUploadSizeLimitKindFromMessage(message: string): ImageUploadSizeLimitKind | null {
  if (!message.startsWith(IMAGE_UPLOAD_SIZE_LIMIT_MESSAGE_PREFIX)) {
    return null;
  }
  const kind = message.slice(IMAGE_UPLOAD_SIZE_LIMIT_MESSAGE_PREFIX.length);
  return isImageUploadSizeLimitKind(kind) ? kind : null;
}

/**
 * Throws a plain Error whose message encodes the size-limit kind so callers can
 * map it to a toast message without coupling core to UI copy.
 */
export function throwImageUploadSizeLimit(kind: ImageUploadSizeLimitKind): never {
  throw new Error(`${IMAGE_UPLOAD_SIZE_LIMIT_MESSAGE_PREFIX}${kind}`);
}

/**
 * Walks an error / AppError cause chain for a size-limit kind tag.
 */
export function getImageUploadSizeLimitKind(error: unknown): ImageUploadSizeLimitKind | null {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current != null && !seen.has(current)) {
    seen.add(current);

    if (isAppError(current)) {
      const fromContext = current.context?.[IMAGE_UPLOAD_SIZE_LIMIT_KIND_CONTEXT_KEY];
      if (isImageUploadSizeLimitKind(fromContext)) {
        return fromContext;
      }
      const fromMessage = parseImageUploadSizeLimitKindFromMessage(current.message);
      if (fromMessage) return fromMessage;
      current = current.cause;
      continue;
    }

    if (current instanceof Error) {
      const fromMessage = parseImageUploadSizeLimitKindFromMessage(current.message);
      if (fromMessage) return fromMessage;
      current = current.cause;
      continue;
    }

    break;
  }

  return null;
}

/**
 * Resolves an image size-limit toast message, or `null` when the error is unrelated.
 */
export function getImageUploadSizeLimitToastMessage(error: unknown): string | null {
  const kind = getImageUploadSizeLimitKind(error);
  if (!kind) return null;

  return IMAGE_UPLOAD_SIZE_LIMIT_MESSAGES[kind](getImageUploadSizeLimitLabelMb(kind));
}
