'use client';

import { useEffect, useRef } from 'react';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import {
  ARTICLE_ATTACHMENT_MAX_FILES,
  ARTICLE_INLINE_SUPPORTED_FILE_TYPES,
  ARTICLE_INLINE_SUPPORTED_MIME_TYPES,
  ATTACHMENT_MAX_OTHER_SIZE,
} from '@/config/posts';
import { FileController } from '@/controllers/file/file';
import { getImageUploadSizeLimitLabelMb } from '@/libs/image/imageUploadSizeLimit';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import {
  INLINE_MEDIA_UPLOAD_REJECTION_NAME,
  type InlineMediaLocalEntry,
  type UseInlineMediaUploadOptions,
  type UseInlineMediaUploadReturn,
} from './useInlineMediaUpload.types';

/** Builds a rejection recognized (and silenced) by the global unhandled-rejection handler. */
function taggedRejection(message: string): Error {
  const rejection = new Error(message);
  rejection.name = INLINE_MEDIA_UPLOAD_REJECTION_NAME;
  return rejection;
}

const MAX_IMAGE_SIZE_LABEL = getImageUploadSizeLimitLabelMb('raw');
const MAX_OTHER_SIZE_LABEL = `${Math.round(ATTACHMENT_MAX_OTHER_SIZE / (1024 * 1024))}MB`;

/**
 * A staged file is referenced by a file URI of the author's that no homeserver
 * file can have: a homeserver file id is 13 Crockford base32 characters (digits
 * and upper-case letters), this one is `draft-` plus 7 lower-case hex
 * characters. Same length, so the markdown-mode character count is the one a
 * published article's URI would give.
 */
const STAGED_ID_PREFIX = 'draft-';
const STAGED_ID_RANDOM_LENGTH = 7;

function createStagedUri(pubky: Pubky): string {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, STAGED_ID_RANDOM_LENGTH);
  return `pubky://${pubky}/pub/pubky.app/files/${STAGED_ID_PREFIX}${random}`;
}

/**
 * A session file. Staged: held locally, nothing on the homeserver yet. Uploaded:
 * on the homeserver (at publish, or a cover uploaded by the composer itself),
 * to be deleted if it never reaches a published post.
 */
type SessionEntry = { objectUrl: string; file: File } & (
  { status: 'staged'; pubky: Pubky } | { status: 'uploaded'; uploadedUri: string }
);

interface Session {
  /** Keyed by the URI the body references: the staged URI, or the upload's own URI for a registered upload */
  entries: Map<string, SessionEntry>;
  /** Homeserver URI → session key, for the entries uploaded this session */
  uploadedKeys: Map<string, string>;
}

interface PendingStage {
  file: File;
  resolve: (uri: string) => void;
  reject: (error: Error) => void;
}

/**
 * Tracks the inline media (images, videos, audio, PDFs) of one article
 * composer session (create or edit).
 *
 * A file is staged when it is inserted: validated, kept in memory and
 * referenced by a placeholder file URI of the author's, so that nothing is
 * written to the author's public storage before the article is published. A
 * reload or a closed tab loses the draft and nothing else, and a locked
 * article's files never exist outside the lock. The publish uploads what the
 * body still references: a create hands the files to the post controller with
 * the cover, an edit uploads them through `uploadStaged` first. The session is
 * then the cleanup boundary for what never made it into a published body:
 * `finalizeSession` (after a successful publish) releases the files no longer
 * referenced, deleting the uploaded ones, and `discardSession` (cancel, dialog
 * close, unmount) releases them all. Both are best-effort; failures are logged
 * and never surface to the user.
 *
 * The session also serves in-editor previews: browsers cannot load `pubky://`
 * URIs, so `getPreviewUrl` serves the local object URL of a session file.
 */
export function useInlineMediaUpload({
  enabled,
  keepSession = false,
  authorPubky,
  getInlineBudget,
}: UseInlineMediaUploadOptions): UseInlineMediaUploadReturn {
  const sessionRef = useRef<Session | null>(null);
  // Same-tick staging calls (one drop/paste of many files) collected for a
  // single all-or-nothing budget decision one microtask later.
  const pendingBatchRef = useRef<PendingStage[] | null>(null);
  // While a publish/edit commit is in flight, discarding must NOT delete
  // session files — the commit may succeed and the published article would
  // reference deleted files. The discard waits for the commit to settle.
  const committingRef = useRef(false);
  const pendingDiscardRef = useRef(false);
  // Set when the session was discarded; a batch staged in the same tick must
  // not register into the dead session.
  const discardedRef = useRef(false);

  const getSession = (): Session => {
    sessionRef.current ??= { entries: new Map(), uploadedKeys: new Map() };
    return sessionRef.current;
  };

  /** The session key for a URI the body references or the homeserver URI of an upload; null outside the session */
  const resolveKey = (uri: string): string | null => {
    const { entries, uploadedKeys } = getSession();
    const trimmed = uri.trim();
    if (entries.has(trimmed)) return trimmed;
    return uploadedKeys.get(trimmed) ?? null;
  };

  const getEntry = (uri: string): SessionEntry | null => {
    const key = resolveKey(uri);
    return key === null ? null : (getSession().entries.get(key) ?? null);
  };

  /** Revokes every preview and empties the session; returns the homeserver URIs of its uploads. */
  const clearSession = (): string[] => {
    const { entries, uploadedKeys } = getSession();
    const uploaded: string[] = [];
    for (const entry of entries.values()) {
      URL.revokeObjectURL(entry.objectUrl);
      if (entry.status === 'uploaded') uploaded.push(entry.uploadedUri);
    }
    entries.clear();
    uploadedKeys.clear();
    return uploaded;
  };

  const deleteUris = async (fileUris: string[]) => {
    if (fileUris.length === 0) return;
    try {
      await FileController.commitDelete({ fileUris });
    } catch (error) {
      Logger.warn('[useInlineMediaUpload] Best-effort session upload cleanup failed', { fileUris, error });
    }
  };

  const rejectWithToast = (description: string): Promise<never> => {
    toast({ variant: 'error', description });
    return Promise.reject(taggedRejection(`Inline media rejected: ${description}`));
  };

  const stageInlineMedia = (file: File): Promise<string> => {
    if (!enabled || !authorPubky) {
      return rejectWithToast('Files can only be added while composing an article.');
    }
    const pubky = authorPubky;
    // A fresh insert means the composer session is active again (e.g. after
    // an earlier discard in the same mounted composer)
    discardedRef.current = false;

    if (!ARTICLE_INLINE_SUPPORTED_MIME_TYPES.includes(file.type)) {
      return rejectWithToast(`Unsupported file type. Supported: ${ARTICLE_INLINE_SUPPORTED_FILE_TYPES}.`);
    }

    // Same caps as post attachments: images are re-encoded under IMAGE_MAX_RAW_SIZE, every other
    // kind is uploaded as-is under the spec's file size limit.
    const isImage = file.type.startsWith('image/');
    if (isImage && file.size > IMAGE_MAX_RAW_SIZE) {
      return rejectWithToast(`Image exceeds the ${MAX_IMAGE_SIZE_LABEL} limit.`);
    }
    if (!isImage && file.size > ATTACHMENT_MAX_OTHER_SIZE) {
      return rejectWithToast(`File exceeds the ${MAX_OTHER_SIZE_LABEL} limit.`);
    }

    // Batch admission: a drop or paste of many files stages them in one tick
    // and inserts all-or-nothing, so the budget decision waits one microtask
    // to see the whole batch. A batch over the budget rejects wholesale with a
    // single toast and stages NOTHING — partial inserts could never land
    // anyway. The budget reads the debounced body, so a second drop within
    // the debounce may pass here; `serializeArticleBody` at publish remains the
    // authoritative cap enforcement.
    return new Promise<string>((resolve, reject) => {
      if (!pendingBatchRef.current) {
        const batch: PendingStage[] = [];
        pendingBatchRef.current = batch;
        queueMicrotask(() => {
          pendingBatchRef.current = null;
          if (discardedRef.current) {
            // Discarded in the same tick: the composer is gone, nothing to tell
            const rejection = taggedRejection('Inline media staging canceled: the session was discarded.');
            for (const entry of batch) entry.reject(rejection);
            return;
          }
          if (batch.length > getInlineBudget()) {
            toast({
              variant: 'error',
              description: `Articles support up to ${ARTICLE_ATTACHMENT_MAX_FILES} attachments including the cover.`,
            });
            const rejection = taggedRejection('Inline media rejected: the batch exceeds the article attachment limit.');
            for (const entry of batch) entry.reject(rejection);
            return;
          }
          const { entries } = getSession();
          for (const entry of batch) {
            const uri = createStagedUri(pubky);
            entries.set(uri, { objectUrl: URL.createObjectURL(entry.file), file: entry.file, status: 'staged', pubky });
            entry.resolve(uri);
          }
        });
      }
      pendingBatchRef.current.push({ file, resolve, reject });
    });
  };

  const uploadStaged = async (uris: string[]): Promise<Map<string, string>> => {
    const { entries, uploadedKeys } = getSession();
    const result = new Map<string, string>();
    // One at a time: each upload sanitizes its file first (a canvas re-encode
    // for an image), which is not worth running nine times at once on a phone
    for (const uri of uris) {
      const key = resolveKey(uri);
      const entry = key === null ? undefined : entries.get(key);
      if (key === null || !entry) {
        result.set(uri, uri);
        continue;
      }
      if (entry.status === 'staged') {
        const uploadedUri = await FileController.commitCreate({ file: entry.file, pubky: entry.pubky });
        entries.set(key, { objectUrl: entry.objectUrl, file: entry.file, status: 'uploaded', uploadedUri });
        uploadedKeys.set(uploadedUri, key);
        result.set(uri, uploadedUri);
        continue;
      }
      result.set(uri, entry.uploadedUri);
    }
    return result;
  };

  const getPreviewUrl = (src: string): string | null => getEntry(src)?.objectUrl ?? null;

  const getSessionFile = (uri: string): File | null => getEntry(uri)?.file ?? null;

  const getMediaType = (uri: string): string | null => getSessionFile(uri)?.type ?? null;

  const getMediaName = (uri: string): string | null => getSessionFile(uri)?.name ?? null;

  const registerSessionUpload = (uri: string, file: File) => {
    const { entries, uploadedKeys } = getSession();
    entries.set(uri, { objectUrl: URL.createObjectURL(file), file, status: 'uploaded', uploadedUri: uri });
    uploadedKeys.set(uri, uri);
  };

  const finalizeSession = async (referencedUris: string[]) => {
    const { entries, uploadedKeys } = getSession();
    const referenced = new Set(referencedUris.map(resolveKey));
    const orphaned: string[] = [];
    for (const [key, entry] of entries) {
      // Referenced files hand their object URL over to the localFiles store
      // (seeded via buildLocalAttachmentEntries before this call); the store's
      // set-difference revoke owns their lifetime from here.
      if (referenced.has(key)) continue;
      URL.revokeObjectURL(entry.objectUrl);
      if (entry.status === 'uploaded') orphaned.push(entry.uploadedUri);
    }
    entries.clear();
    uploadedKeys.clear();
    await deleteUris(orphaned);
  };

  const discardSession = async () => {
    // Never delete while a commit is in flight: it may succeed, and the
    // published article would reference deleted files. The discard runs once
    // the commit settles (see setCommitting); after a success the session is
    // already empty, after a failure it releases what the commit left behind.
    if (committingRef.current) {
      pendingDiscardRef.current = true;
      return;
    }
    discardedRef.current = true;
    await deleteUris(clearSession());
  };

  /**
   * Marks a publish/edit commit as in flight. While set, discards are deferred
   * (see discardSession). Cleared in the caller's finally, which runs the
   * deferred discard if there is one.
   */
  const setCommitting = (committing: boolean) => {
    committingRef.current = committing;
    if (committing || !pendingDiscardRef.current) return;
    pendingDiscardRef.current = false;
    void discardSession();
  };

  const buildLocalAttachmentEntries = (orderedUris: string[]): (InlineMediaLocalEntry | null)[] => {
    return orderedUris.map((uri) => {
      const entry = getEntry(uri);
      if (!entry) return null;
      // Only images have derived variants; a non-image entry serves `main` alone, like a CDN row
      const isImage = entry.file.type.startsWith('image/');
      return {
        type: entry.file.type,
        name: entry.file.name,
        urls: { main: entry.objectUrl, feed: isImage ? entry.objectUrl : undefined },
      };
    });
  };

  // Discard the session when the composer leaves article mode or unmounts
  // (discard-remount, dialog close, navigation). After a successful publish
  // `finalizeSession` has already emptied the session, so this sweep is a
  // no-op. Fire-and-forget: deletion is best-effort by design.
  const discardRef = useRef(discardSession);
  useEffect(() => {
    discardRef.current = discardSession;
  });

  const isSessionNeeded = enabled || keepSession;
  useEffect(() => {
    if (isSessionNeeded) return;
    void discardRef.current();
  }, [isSessionNeeded]);

  useEffect(() => {
    return () => {
      void discardRef.current();
    };
  }, []);

  return {
    stageInlineMedia,
    uploadStaged,
    getPreviewUrl,
    getSessionFile,
    getMediaType,
    getMediaName,
    registerSessionUpload,
    finalizeSession,
    discardSession,
    setCommitting,
    buildLocalAttachmentEntries,
  };
}
