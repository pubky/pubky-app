'use client';

import { useEffect, useRef, useState } from 'react';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import {
  ARTICLE_ATTACHMENT_MAX_FILES,
  ARTICLE_INLINE_SUPPORTED_FILE_TYPES,
  ARTICLE_INLINE_SUPPORTED_MIME_TYPES,
  ATTACHMENT_MAX_OTHER_SIZE,
} from '@/config/posts';
import { FileController } from '@/controllers/file/file';
import { isAppError, requiresLogin } from '@/libs/error/error.utils';
import { getInlineMediaKindFromMime, type InlineMediaKind } from '@/libs/file/inlineMediaKind';
import { getImageUploadSizeLimitLabelMb, getImageUploadSizeLimitToastMessage } from '@/libs/image/imageUploadSizeLimit';
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
function taggedRejection(message: string, cause?: unknown): Error {
  const rejection = new Error(message, cause === undefined ? undefined : { cause });
  rejection.name = INLINE_MEDIA_UPLOAD_REJECTION_NAME;
  return rejection;
}

const MAX_IMAGE_SIZE_LABEL = getImageUploadSizeLimitLabelMb('raw');
const MAX_OTHER_SIZE_LABEL = `${Math.round(ATTACHMENT_MAX_OTHER_SIZE / (1024 * 1024))}MB`;

/** Static retry copy per media kind; toasts never carry the file name. */
function uploadFailedMessage(kind: InlineMediaKind | null): string {
  switch (kind) {
    case 'image':
      return 'Could not upload image. Try again.';
    case 'video':
      return 'Could not upload video. Try again.';
    case 'audio':
      return 'Could not upload audio. Try again.';
    default:
      return 'Could not upload file. Try again.';
  }
}

interface SessionUpload {
  objectUrl: string;
  file: File;
}

interface PendingUpload {
  file: File;
  resolve: (uri: string) => void;
  reject: (error: Error) => void;
}

/**
 * Tracks the inline media (images, videos, audio, PDFs) uploaded to the
 * homeserver during one article composer session (create or edit).
 *
 * Inline media is uploaded at insert time — before the article is
 * published — so the session is the cleanup boundary for uploads that never
 * make it into a published body: `finalizeSession` (after a successful
 * publish) deletes the uploads no longer referenced, and `discardSession`
 * (cancel, dialog close, unmount) deletes them all. Both are best-effort;
 * failures are logged and never surface to the user.
 *
 * The session map also serves in-editor previews: browsers cannot load
 * `pubky://` URIs, and freshly uploaded files may briefly 404 at the CDN
 * before Nexus generates variants, so `getPreviewUrl` serves the local
 * object URL for anything uploaded this session.
 */
export function useInlineMediaUpload({
  enabled,
  keepSession = false,
  authorPubky,
  getInlineBudget,
}: UseInlineMediaUploadOptions): UseInlineMediaUploadReturn {
  const sessionRef = useRef<Map<string, SessionUpload> | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  // Synchronous twin of uploadingCount: budget checks must see uploads
  // started in earlier batches that haven't settled yet, which the async
  // state value can't guarantee.
  const inFlightRef = useRef(0);
  // Same-tick upload calls (one drop/paste of many files) collected for a
  // single all-or-nothing budget decision one microtask later.
  const pendingBatchRef = useRef<PendingUpload[] | null>(null);
  // While a publish/edit commit is in flight, discarding must NOT delete
  // session files — the commit may succeed and the published article would
  // reference deleted files. Leaking on a rare abort is the safe direction.
  const committingRef = useRef(false);
  // Set when the session was discarded; an upload resolving afterwards must
  // clean itself up instead of registering into the dead session.
  const discardedRef = useRef(false);

  const getSession = (): Map<string, SessionUpload> => {
    sessionRef.current ??= new Map();
    return sessionRef.current;
  };

  const clearSession = (): string[] => {
    const session = getSession();
    const uris = [...session.keys()];
    for (const { objectUrl } of session.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    session.clear();
    return uris;
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
    return Promise.reject(taggedRejection(`Inline media upload rejected: ${description}`));
  };

  const runUpload = async (file: File, pubky: Pubky): Promise<string> => {
    inFlightRef.current += 1;
    setUploadingCount((count) => count + 1);
    let uri: string;
    try {
      uri = await FileController.commitCreate({ file, pubky });
    } catch (error) {
      Logger.error('[useInlineMediaUpload] Inline media upload failed', { error });
      toast({
        variant: 'error',
        // An expired session cannot be retried away: ask for sign-in instead of
        // showing retry copy (issue #2555). One toast only, and the rejection
        // below keeps the tag the global handler uses to stay quiet.
        description:
          isAppError(error) && requiresLogin(error)
            ? 'Session expired. Please sign in.'
            : (getImageUploadSizeLimitToastMessage(error) ??
              uploadFailedMessage(getInlineMediaKindFromMime(file.type))),
      });
      // Rethrow tagged (message preserved) so callers still see the failure
      // but the global handler doesn't re-report what was just toasted
      throw taggedRejection(error instanceof Error ? error.message : 'Inline media upload failed', error);
    } finally {
      inFlightRef.current -= 1;
      setUploadingCount((count) => count - 1);
    }

    if (discardedRef.current) {
      // The session was discarded while this upload was in flight — nothing
      // will ever finalize it, so clean up now (silently: the composer is
      // gone) instead of orphaning the file on the homeserver
      void deleteUris([uri]);
      throw taggedRejection('Inline media upload discarded before completion.');
    }

    getSession().set(uri, { objectUrl: URL.createObjectURL(file), file });
    return uri;
  };

  const uploadInlineMedia = (file: File): Promise<string> => {
    if (!enabled || !authorPubky) {
      return rejectWithToast('Files can only be uploaded while composing an article.');
    }
    const pubky = authorPubky;
    // A fresh upload means the composer session is active again (e.g. after
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

    // Batch admission: MDXEditor's paste/drop handling calls this once per
    // file in the same tick and inserts all-or-nothing (Promise.all), so the
    // budget decision waits one microtask to see the whole batch. A batch
    // over the budget (in-flight uploads count too) rejects wholesale with a
    // single toast and uploads NOTHING — partial uploads could never be
    // inserted anyway. Sequential callers (dialog, markdown-mode flows)
    // arrive in separate ticks and form batches of one, preserving their
    // per-file behavior.
    return new Promise<string>((resolve, reject) => {
      if (!pendingBatchRef.current) {
        const batch: PendingUpload[] = [];
        pendingBatchRef.current = batch;
        queueMicrotask(() => {
          pendingBatchRef.current = null;
          if (batch.length > getInlineBudget() - inFlightRef.current) {
            toast({
              variant: 'error',
              description: `Articles support up to ${ARTICLE_ATTACHMENT_MAX_FILES} attachments including the cover.`,
            });
            const rejection = taggedRejection(
              'Inline media upload rejected: the batch exceeds the article attachment limit.',
            );
            for (const entry of batch) entry.reject(rejection);
            return;
          }
          for (const entry of batch) {
            runUpload(entry.file, pubky).then(entry.resolve, entry.reject);
          }
        });
      }
      pendingBatchRef.current.push({ file, resolve, reject });
    });
  };

  const getPreviewUrl = (src: string): string | null => {
    return getSession().get(src.trim())?.objectUrl ?? null;
  };

  const getSessionFile = (uri: string): File | null => {
    return getSession().get(uri.trim())?.file ?? null;
  };

  const getMediaType = (uri: string): string | null => getSessionFile(uri)?.type ?? null;

  const getMediaName = (uri: string): string | null => getSessionFile(uri)?.name ?? null;

  const registerSessionUpload = (uri: string, file: File) => {
    getSession().set(uri, { objectUrl: URL.createObjectURL(file), file });
  };

  const finalizeSession = async (referencedUris: string[]) => {
    const session = getSession();
    const referenced = new Set(referencedUris);
    const orphaned: string[] = [];
    for (const [uri, { objectUrl }] of session) {
      // Referenced uploads hand their object URL over to the localFiles store
      // (seeded via buildLocalAttachmentEntries before this call); the store's
      // set-difference revoke owns their lifetime from here.
      if (referenced.has(uri)) continue;
      URL.revokeObjectURL(objectUrl);
      orphaned.push(uri);
    }
    session.clear();
    await deleteUris(orphaned);
  };

  const discardSession = async () => {
    // Never delete while a commit is in flight: it may succeed, and the
    // published article would reference deleted files. Skipping leaks the
    // files if the commit then fails after the composer is gone — the safe
    // direction, and finalizeSession still sweeps on success.
    if (committingRef.current) return;
    discardedRef.current = true;
    await deleteUris(clearSession());
  };

  /**
   * Marks a publish/edit commit as in flight. While set, discards are
   * no-ops (see discardSession). Cleared in the caller's finally.
   */
  const setCommitting = (committing: boolean) => {
    committingRef.current = committing;
  };

  const buildLocalAttachmentEntries = (orderedUris: string[]): (InlineMediaLocalEntry | null)[] => {
    const session = getSession();
    return orderedUris.map((uri) => {
      const upload = session.get(uri);
      if (!upload) return null;
      // Only images have derived variants; a non-image entry serves `main` alone, like a CDN row
      const isImage = upload.file.type.startsWith('image/');
      return {
        type: upload.file.type,
        name: upload.file.name,
        urls: { main: upload.objectUrl, feed: isImage ? upload.objectUrl : undefined },
      };
    });
  };

  // Discard leftover session uploads when the composer leaves article mode or
  // unmounts (discard-remount, dialog close, navigation). After a successful
  // publish `finalizeSession` has already emptied the session, so this sweep
  // is a no-op. Fire-and-forget: deletion is best-effort by design.
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
    uploadInlineMedia,
    getPreviewUrl,
    getSessionFile,
    getMediaType,
    getMediaName,
    registerSessionUpload,
    uploadingCount,
    finalizeSession,
    discardSession,
    setCommitting,
    buildLocalAttachmentEntries,
  };
}
