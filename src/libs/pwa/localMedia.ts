import { LOCAL_MEDIA_PATH_PREFIX, SW_LOCAL_MEDIA_REQUEST } from '@/config/pwa';
import { rangedResponse } from './localMediaRange';
import {
  type DecodeImage,
  isLocalMediaVariant,
  LOCAL_AVATAR_VARIANT,
  LOCAL_MEDIA_VARIANT_WIDTHS,
  type LocalMediaBody,
  type LocalMediaVariant,
  scaleImageVariant,
} from './localMediaVariant';

/**
 * Homeserver media at same-origin paths, for deploys without Nexus and so without its CDN. Only a page holds the
 * SDK client that resolves a user's homeserver, so the service worker asks a page for the bytes, answers the
 * request with them and keeps them in Cache Storage (`src/sw.ts`); the page side answers from the local index
 * (`src/core/services/indexer/indexer.media.ts`). Imported by the worker, so it stays free of app imports.
 */

/** What a local media path names: a user's avatar, or one file of an owner's public media. */
export type LocalMediaRequest = { kind: 'avatar'; user: string } | { kind: 'file'; owner: string; name: string };

/**
 * A page's answer: the bytes, `none` when there is nothing to serve, `failed` when the read failed, `tooLarge` when the
 * file is over the size the worker serves and was not read.
 */
export type LocalMediaAnswer =
  | { status: 'found'; bytes: ArrayBuffer; contentType: string }
  | { status: 'none' }
  | { status: 'failed' }
  | { status: 'tooLarge' };

/** What the worker posts to a page, with the port to answer on. */
export type LocalMediaMessage = { type: typeof SW_LOCAL_MEDIA_REQUEST; request: LocalMediaRequest };

/** Every avatar path starts with this; `?v=` carries the profile version, so a new avatar is a new cache entry. */
export const LOCAL_AVATAR_PATH_PREFIX = `${LOCAL_MEDIA_PATH_PREFIX}avatar/`;
const LOCAL_FILE_PATH_PREFIX = `${LOCAL_MEDIA_PATH_PREFIX}file/`;
/** The query naming a file's resized copy; without it the path serves the original. */
const VARIANT_PARAM = 'variant';

/** An avatar path always serves the `LOCAL_AVATAR_VARIANT` copy. */
export function buildLocalAvatarPath(user: string, version?: string | number): string {
  const path = `${LOCAL_AVATAR_PATH_PREFIX}${encodeURIComponent(user)}`;
  return version ? `${path}?v=${encodeURIComponent(String(version))}` : path;
}

/** A file path, for the resized copy `variant` names; `main` or no variant is the original. */
export function buildLocalFilePath(owner: string, name: string, variant?: string): string {
  const path = `${LOCAL_FILE_PATH_PREFIX}${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return variant && isLocalMediaVariant(variant) ? `${path}?${VARIANT_PARAM}=${variant}` : path;
}

/** The media a path names, `null` for anything else. */
export function parseLocalMediaPath(pathname: string): LocalMediaRequest | null {
  if (!pathname.startsWith(LOCAL_MEDIA_PATH_PREFIX)) return null;
  let segments: string[];
  try {
    segments = pathname.slice(LOCAL_MEDIA_PATH_PREFIX.length).split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
  if (segments.some((segment) => segment === '')) return null;
  const [kind, ...rest] = segments;
  if (kind === 'avatar' && rest.length === 1) return { kind: 'avatar', user: rest[0] };
  if (kind === 'file' && rest.length === 2) return { kind: 'file', owner: rest[0], name: rest[1] };
  return null;
}

/** What a local media URL serves and the Cache Storage keys it is kept under. */
export interface LocalMediaTarget {
  media: LocalMediaRequest;
  /** The resized copy the URL asks for, `null` for the original. */
  variant: LocalMediaVariant | null;
  /** The key of what the URL serves. */
  key: string;
  /** The key the original is kept under, which every variant reuses; `null` for an avatar, only served resized. */
  originalKey: string | null;
}

/** What a URL under `LOCAL_MEDIA_PATH_PREFIX` serves, `null` when it names no media or no known variant. */
export function parseLocalMediaUrl(url: URL): LocalMediaTarget | null {
  const media = parseLocalMediaPath(url.pathname);
  if (media === null) return null;
  if (media.kind === 'avatar') return { media, variant: LOCAL_AVATAR_VARIANT, key: url.href, originalKey: null };
  // Other query parameters are dropped, so one file is never cached twice
  const path = `${url.origin}${url.pathname}`;
  const variant = url.searchParams.get(VARIANT_PARAM);
  if (variant === null) return { media, variant: null, key: path, originalKey: path };
  if (!isLocalMediaVariant(variant)) return null;
  return { media, variant, key: `${path}?${VARIANT_PARAM}=${variant}`, originalKey: path };
}

const isRecord = (data: unknown): data is Record<string, unknown> => typeof data === 'object' && data !== null;

const isLocalMediaRequest = (data: unknown): data is LocalMediaRequest =>
  isRecord(data) &&
  ((data.kind === 'avatar' && typeof data.user === 'string') ||
    (data.kind === 'file' && typeof data.owner === 'string' && typeof data.name === 'string'));

export const isLocalMediaMessage = (data: unknown): data is LocalMediaMessage =>
  isRecord(data) && data.type === SW_LOCAL_MEDIA_REQUEST && isLocalMediaRequest(data.request);

export const isLocalMediaAnswer = (data: unknown): data is LocalMediaAnswer =>
  isRecord(data) &&
  (data.status === 'none' ||
    data.status === 'failed' ||
    data.status === 'tooLarge' ||
    (data.status === 'found' && data.bytes instanceof ArrayBuffer && typeof data.contentType === 'string'));

const PDF_CONTENT_TYPE = 'application/pdf';

function mediaHeaders(contentType: string): Headers {
  const headers = new Headers({ 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
  // Opened as a page, a user's file must not run as this origin (an SVG or HTML file could script the app). Browsers
  // refuse to render a PDF in a sandboxed document, and their PDF viewers run apart from the page anyway.
  if (contentType !== PDF_CONTENT_TYPE) headers.set('Content-Security-Policy', 'sandbox');
  return headers;
}

/** Resolves `null` when `promise` rejects or takes longer than `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

/** Cache Storage lists keys in insertion order, so the first ones are the oldest. */
async function putBounded(cache: Cache, key: string, response: Response, maxEntries: number): Promise<void> {
  await cache.put(key, response);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((stale) => cache.delete(stale)));
}

async function readCached(cache: Cache | null, key: string): Promise<LocalMediaBody | null> {
  try {
    const cached = await cache?.match(key);
    if (!cached) return null;
    const blob = await cached.blob();
    return { blob, contentType: cached.headers.get('Content-Type') ?? blob.type };
  } catch {
    return null;
  }
}

async function store(cache: Cache | null, key: string, body: LocalMediaBody, maxEntries: number): Promise<void> {
  if (cache === null) return;
  const response = new Response(body.blob, { status: 200, headers: mediaHeaders(body.contentType) });
  await putBounded(cache, key, response, maxEntries).catch(() => undefined);
}

export interface RespondLocalMediaParams {
  request: Request;
  openCache: () => Promise<Cache>;
  /** Asks a page for the media; `null` when there is no page to ask. */
  ask: (media: LocalMediaRequest) => Promise<LocalMediaAnswer | null>;
  /** Decodes an image to make its variants; the worker passes `decodeImageWithCanvas`. */
  decodeImage: DecodeImage;
  timeoutMs: number;
  maxEntries: number;
  /** The largest file a page may hand over; a larger one is refused with a 507. */
  maxBytes: number;
}

type LoadParams = Omit<RespondLocalMediaParams, 'request' | 'openCache'> & { cache: Cache | null };

/** What `target` serves, or the error status to respond with. */
async function loadLocalMedia(
  target: LocalMediaTarget,
  { cache, ask, decodeImage, timeoutMs, maxEntries, maxBytes }: LoadParams,
): Promise<LocalMediaBody | number> {
  const served = await readCached(cache, target.key);
  if (served) return served;
  let original =
    target.originalKey === null || target.originalKey === target.key
      ? null
      : await readCached(cache, target.originalKey);
  if (original === null) {
    const answer = await within(ask(target.media), timeoutMs);
    if (answer === null) return 504;
    if (answer.status === 'none') return 404;
    if (answer.status === 'failed') return 502;
    if (answer.status === 'tooLarge' || answer.bytes.byteLength > maxBytes) return 507;
    // Through a Response, so the Blob comes from the same realm as the Response that later carries it
    original = { blob: await new Response(answer.bytes).blob(), contentType: answer.contentType };
    if (target.originalKey !== null) await store(cache, target.originalKey, original, maxEntries);
  }
  if (target.variant === null) return original;
  const variant = await scaleImageVariant(original, LOCAL_MEDIA_VARIANT_WIDTHS[target.variant], decodeImage);
  // A failure may not happen again, so the original is served without taking the variant's place in the cache
  if (variant === 'failed') return original;
  if (variant === 'original') {
    // Kept under the variant's key only when the original has no entry of its own
    if (target.originalKey === null) await store(cache, target.key, original, maxEntries);
    return original;
  }
  await store(cache, target.key, variant, maxEntries);
  return variant;
}

/**
 * The worker's answer to a GET under `LOCAL_MEDIA_PATH_PREFIX`: the cached copy, else the bytes a page hands over,
 * cached for next time, whole or as the single byte range the request asks for. A variant is made in the worker from
 * the original, which is cached once for every variant of it; when it cannot be made the original is served. Nothing
 * to serve is a 404, a failed read a 502, no answer in time a 504 and a file over `maxBytes` a 507, none of them
 * cached, so the image shows its fallback and the next render asks again.
 */
export async function respondLocalMedia({ request, openCache, ...params }: RespondLocalMediaParams): Promise<Response> {
  const target = parseLocalMediaUrl(new URL(request.url));
  if (target === null) return new Response(null, { status: 404 });
  // Cache Storage can be unavailable (blocked site data, some private modes): the media is then served uncached.
  const cache = await openCache().catch(() => null);
  const body = await loadLocalMedia(target, { cache, ...params });
  if (typeof body === 'number') return new Response(null, { status: body });
  return rangedResponse(body.blob, mediaHeaders(body.contentType), request.headers.get('Range'));
}
