import type { Pubky } from '@/models/models.types';

/**
 * Error name tagging expected, already-toasted inline image upload
 * rejections. MDXEditor's built-in paste/drop handling rethrows upload
 * rejections inside its own `.catch`, producing a promise nobody owns — the
 * tag lets the global unhandled-rejection handler recognize them as handled
 * instead of reporting an error the user was already told about.
 */
export const INLINE_IMAGE_UPLOAD_REJECTION_NAME = 'InlineImageUploadRejection';

export interface UseInlineImageUploadOptions {
  /** Only articles upload inline images; when false, uploads are rejected and the session is discarded */
  enabled: boolean;
  authorPubky: Pubky | null;
  /** Remaining inline-image slots at insert time (serialize-time cap is the authority) */
  getInlineBudget: () => number;
}

/** Shape of a `useLocalFilesStore` post attachment entry backed by a session object URL */
export interface InlineImageLocalEntry {
  type: string;
  name: string;
  urls: { main: string; feed?: string };
}

export interface UseInlineImageUploadReturn {
  /**
   * MDXEditor `imageUploadHandler` shape: validates, uploads to the
   * homeserver, and resolves with the `pubky://…/files/{id}` URI. Rejects
   * (after toasting) on validation or upload failure so the editor inserts
   * nothing.
   */
  uploadInlineImage: (file: File) => Promise<string>;
  /** Object URL for a session-uploaded file URI, for in-editor preview */
  getPreviewUrl: (src: string) => string | null;
  /** Adds an externally uploaded file (e.g. a replacement cover) to the session for cleanup tracking */
  registerSessionUpload: (uri: string, file: File) => void;
  /** Number of uploads currently in flight; publish must be blocked while > 0 */
  uploadingCount: number;
  /** Deletes session uploads that are not in `referencedUris` and clears the session (best-effort) */
  finalizeSession: (referencedUris: string[]) => Promise<void>;
  /** Deletes every session upload and clears the session (best-effort; no-op while a commit is in flight) */
  discardSession: () => Promise<void>;
  /** Guards session files during a publish/edit commit: while true, discards are no-ops */
  setCommitting: (committing: boolean) => void;
  /**
   * Maps ordered attachment URIs to local-store entries backed by session
   * object URLs; URIs not uploaded this session map to `null`. Call BEFORE
   * `finalizeSession`, which clears the session map.
   */
  buildLocalAttachmentEntries: (orderedUris: string[]) => (InlineImageLocalEntry | null)[];
}
