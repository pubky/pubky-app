import type { Pubky } from '@/models/models.types';

/**
 * Error name tagging expected, already-toasted inline media rejections
 * (validation, budget). MDXEditor's built-in paste/drop handling rethrows
 * rejections of its upload handler inside its own `.catch`, producing a promise
 * nobody owns — the tag lets the global unhandled-rejection handler recognize
 * them as handled instead of reporting an error the user was already told
 * about. The value predates video/audio support and the move of the upload to
 * publish time, and stays as-is: Sentry's ignore list matches on it.
 */
export const INLINE_MEDIA_UPLOAD_REJECTION_NAME = 'InlineImageUploadRejection';

export interface UseInlineMediaUploadOptions {
  /** Only articles take inline media; when false, staging is rejected and the session is discarded */
  enabled: boolean;
  /** A captured lock draft outlives article mode: while true, a false `enabled` discards nothing. */
  keepSession?: boolean;
  authorPubky: Pubky | null;
  /** Remaining inline media slots at insert time (serialize-time cap is the authority) */
  getInlineBudget: () => number;
}

/** Shape of a `useLocalFilesStore` post attachment entry backed by a session object URL */
export interface InlineMediaLocalEntry {
  type: string;
  name: string;
  urls: { main: string; feed?: string; large?: string };
}

export interface UseInlineMediaUploadReturn {
  /**
   * MDXEditor `imageUploadHandler` shape, for every inline media kind: validates
   * the file and resolves with the author-owned file URI the body references
   * (`pubky://…/files/draft-…`). Nothing is uploaded here — the bytes stay in
   * the session until the article is published. Rejects (after toasting) on
   * validation or budget failure so the editor inserts nothing.
   */
  stageInlineMedia: (file: File) => Promise<string>;
  /**
   * Uploads the staged files among `uris` to the homeserver, in order, and maps
   * every input URI to the URI to persist: a staged file to its homeserver file
   * URI, anything else (already uploaded, or not a session file) to itself. A
   * failed upload rejects with the controller's error as-is; the files uploaded
   * before it stay recorded, so a retry does not upload them again.
   */
  uploadStaged: (uris: string[]) => Promise<Map<string, string>>;
  /** Object URL for a session file URI, for in-editor preview */
  getPreviewUrl: (src: string) => string | null;
  /** The file as picked, before upload sanitization; null for a URI outside the session */
  getSessionFile: (uri: string) => File | null;
  /** MIME type of a session file URI (the editor routes non-images to a media node); null outside the session */
  getMediaType: (uri: string) => string | null;
  /** The picked file's name for a session file URI; null for anything else. */
  getMediaName: (uri: string) => string | null;
  /** Adds a file uploaded outside the session (e.g. a replacement cover) to it for cleanup tracking */
  registerSessionUpload: (uri: string, file: File) => void;
  /**
   * Releases the session after a successful publish: revokes the previews of
   * the files not in `referencedUris`, deletes those of them that were uploaded
   * (best-effort) and clears the session. Referenced files keep their object
   * URL, which the local files store owns from here.
   */
  finalizeSession: (referencedUris: string[]) => Promise<void>;
  /**
   * Revokes every preview, deletes every uploaded session file (best-effort) and
   * clears the session. Deferred while a commit is in flight: it runs once the
   * commit settles.
   */
  discardSession: () => Promise<void>;
  /** Guards session files during a publish/edit commit: while true, discards wait for it to end */
  setCommitting: (committing: boolean) => void;
  /**
   * Maps ordered attachment URIs to local-store entries backed by session
   * object URLs; URIs outside the session map to `null`. Call BEFORE
   * `finalizeSession`, which clears the session map.
   */
  buildLocalAttachmentEntries: (orderedUris: string[]) => (InlineMediaLocalEntry | null)[];
}
