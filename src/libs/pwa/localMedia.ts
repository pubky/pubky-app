import { LOCAL_MEDIA_PATH_PREFIX, SW_LOCAL_MEDIA_REQUEST } from '@/config/pwa';

/**
 * Homeserver media at same-origin paths, for deploys without Nexus and so without its CDN. Only a page holds the
 * SDK client that resolves a user's homeserver, so the service worker asks a page for the bytes, answers the
 * request with them and keeps them in Cache Storage (`src/sw.ts`); the page side answers from the local index
 * (`src/core/services/indexer/indexer.media.ts`). Imported by the worker, so it stays free of app imports.
 */

/** What a local media path names: a user's avatar, or one file of an owner's public media. */
export type LocalMediaRequest = { kind: 'avatar'; user: string } | { kind: 'file'; owner: string; name: string };

/** A page's answer: the bytes, `none` when there is nothing to serve, `failed` when the read failed. */
export type LocalMediaAnswer =
  { status: 'found'; bytes: ArrayBuffer; contentType: string } | { status: 'none' } | { status: 'failed' };

/** What the worker posts to a page, with the port to answer on. */
export type LocalMediaMessage = { type: typeof SW_LOCAL_MEDIA_REQUEST; request: LocalMediaRequest };

/** Every avatar path starts with this; `?v=` carries the profile version, so a new avatar is a new cache entry. */
export const LOCAL_AVATAR_PATH_PREFIX = `${LOCAL_MEDIA_PATH_PREFIX}avatar/`;
const LOCAL_FILE_PATH_PREFIX = `${LOCAL_MEDIA_PATH_PREFIX}file/`;

export function buildLocalAvatarPath(user: string, version?: string | number): string {
  const path = `${LOCAL_AVATAR_PATH_PREFIX}${encodeURIComponent(user)}`;
  return version ? `${path}?v=${encodeURIComponent(String(version))}` : path;
}

export function buildLocalFilePath(owner: string, name: string): string {
  return `${LOCAL_FILE_PATH_PREFIX}${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
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
    (data.status === 'found' && data.bytes instanceof ArrayBuffer && typeof data.contentType === 'string'));

const PDF_CONTENT_TYPE = 'application/pdf';

function mediaResponse(bytes: ArrayBuffer, contentType: string): Response {
  const headers = new Headers({ 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff' });
  // Opened as a page, a user's file must not run as this origin (an SVG or HTML file could script the app). Browsers
  // refuse to render a PDF in a sandboxed document, and their PDF viewers run apart from the page anyway.
  if (contentType !== PDF_CONTENT_TYPE) headers.set('Content-Security-Policy', 'sandbox');
  return new Response(bytes, { status: 200, headers });
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

export interface RespondLocalMediaParams {
  request: Request;
  openCache: () => Promise<Cache>;
  /** Asks a page for the media; `null` when there is no page to ask. */
  ask: (media: LocalMediaRequest) => Promise<LocalMediaAnswer | null>;
  timeoutMs: number;
  maxEntries: number;
}

/**
 * The worker's answer to a GET under `LOCAL_MEDIA_PATH_PREFIX`: the cached copy, else the bytes a page hands over,
 * cached for next time. Nothing to serve is a 404, a failed read a 502 and no answer in time a 504, none of them
 * cached, so the image shows its fallback and the next render asks again.
 */
export async function respondLocalMedia({
  request,
  openCache,
  ask,
  timeoutMs,
  maxEntries,
}: RespondLocalMediaParams): Promise<Response> {
  const media = parseLocalMediaPath(new URL(request.url).pathname);
  if (media === null) return new Response(null, { status: 404 });
  // Cache Storage can be unavailable (blocked site data, some private modes): the media is then served uncached.
  const cache = await openCache().catch(() => null);
  const cached = await cache?.match(request.url).catch(() => undefined);
  if (cached) return cached;
  const answer = await within(ask(media), timeoutMs);
  if (answer === null) return new Response(null, { status: 504 });
  if (answer.status === 'none') return new Response(null, { status: 404 });
  if (answer.status === 'failed') return new Response(null, { status: 502 });
  const response = mediaResponse(answer.bytes, answer.contentType);
  if (cache) await putBounded(cache, request.url, response.clone(), maxEntries).catch(() => undefined);
  return response;
}
