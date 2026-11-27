import { buildUri } from 'pubky-social-specs';
import { LOCAL_MEDIA_CACHE } from '@/config/pwa';
import { isAppError } from '@/libs/error/error';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { type LegacyFile, legacyFileUri } from '@/libs/indexer/social/legacy/legacyMedia';
import type { UserData } from '@/libs/indexer/social/social.types';
import { Logger } from '@/libs/logger/logger';
import { isLocalMediaMessage, type LocalMediaAnswer, type LocalMediaRequest } from '@/libs/pwa/localMedia';
import { FileNormalizer } from '@/pipes/file/file.normalizer';

/** What answering the worker's media requests reads. */
export interface LocalMediaSources {
  /** The profile in the local index's view, `null` while the view does not hold it. */
  profile(user: string): Pick<UserData, 'image'> | null;
  /** Loads a user's profile alone into the view, without their posts. */
  ensureProfile(user: string): Promise<void>;
  /**
   * A public homeserver file's bytes, `null` when the homeserver has none. Rejects with `PAYLOAD_TOO_LARGE` for a file
   * over `LOCAL_MEDIA_MAX_BYTES`, without reading it whole.
   */
  readFile(uri: string): Promise<Uint8Array | null>;
  /**
   * The bytes of a file of the tree accounts wrote before social v1, with the type its record states, `null` when the
   * URI names none. Only while the index reads that tree.
   */
  readLegacyFile?(uri: string): Promise<LegacyFile | null>;
}

async function avatarUri(user: string, sources: LocalMediaSources): Promise<string | null> {
  let profile = sources.profile(user);
  if (profile === null) {
    await sources.ensureProfile(user);
    profile = sources.profile(user);
  }
  return profile?.image ?? null;
}

function fileUri(owner: string, name: string): string | null {
  try {
    return buildUri(owner, 'file', name);
  } catch {
    // Not an owner key or not a media file name: nothing the app could have linked to.
    return null;
  }
}

const found = (bytes: Uint8Array, contentType: string): LocalMediaAnswer => ({
  status: 'found',
  bytes: bytes.slice().buffer,
  contentType,
});

/**
 * The bytes of the media a worker request names. v1 public media is served typed by its file extension, and a 0.x
 * file through its record when the index reads that tree; anything else answers `none`.
 */
export async function answerLocalMedia(
  media: LocalMediaRequest,
  sources: LocalMediaSources,
): Promise<LocalMediaAnswer> {
  try {
    const uri =
      media.kind === 'avatar'
        ? await avatarUri(media.user, sources)
        : (fileUri(media.owner, media.name) ?? legacyFileUri(media.owner, media.name));
    const details = uri === null ? null : FileNormalizer.toV1FileDetails(uri);
    if (uri === null) return { status: 'none' };
    if (details === null) {
      const file = (await sources.readLegacyFile?.(uri)) ?? null;
      return file === null ? { status: 'none' } : found(file.bytes, file.contentType);
    }
    const bytes = await sources.readFile(uri);
    if (bytes === null) return { status: 'none' };
    return found(bytes, details.content_type);
  } catch (error) {
    if (isAppError(error) && error.code === ClientErrorCode.PAYLOAD_TOO_LARGE) return { status: 'tooLarge' };
    // Unreachable homeservers are routine; the read's own operation keeps them out of Sentry.
    Logger.debug('Local media read failed', { media, error });
    return { status: 'failed' };
  }
}

/** Answers the service worker's media requests (`src/sw.ts`) until the returned function runs. */
export function serveLocalMedia(sources: LocalMediaSources): () => void {
  const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container) return () => {};
  const onMessage = (event: MessageEvent) => {
    const [port] = event.ports;
    if (!port || !isLocalMediaMessage(event.data)) return;
    void answerLocalMedia(event.data.request, sources).then((answer) => {
      port.postMessage(answer, answer.status === 'found' ? [answer.bytes] : []);
    });
  };
  container.addEventListener('message', onMessage);
  // The browser holds worker messages until the document has loaded; this starts them now if it has not.
  container.startMessages();
  return () => container.removeEventListener('message', onMessage);
}

/** Deletes the worker's media cache, where the browser has Cache Storage. */
export async function clearLocalMedia(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await caches.delete(LOCAL_MEDIA_CACHE);
}
