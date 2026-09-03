'use client';

import { useEffect, useRef, useState } from 'react';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import {
  ARTICLE_ATTACHMENT_MAX_FILES,
  ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES,
  ARTICLE_SUPPORTED_FILE_TYPES,
} from '@/config/posts';
import { FileController } from '@/controllers/file/file';
import { getImageUploadSizeLimitToastMessage } from '@/libs/image/imageUploadSizeLimit';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import {
  INLINE_IMAGE_UPLOAD_REJECTION_NAME,
  type InlineImageLocalEntry,
  type UseInlineImageUploadOptions,
  type UseInlineImageUploadReturn,
} from './useInlineImageUpload.types';

/** Builds a rejection recognized (and silenced) by the global unhandled-rejection handler. */
function taggedRejection(message: string, cause?: unknown): Error {
  const rejection = new Error(message, cause === undefined ? undefined : { cause });
  rejection.name = INLINE_IMAGE_UPLOAD_REJECTION_NAME;
  return rejection;
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
 * Tracks the inline images uploaded to the homeserver during one article
 * composer session (create or edit).
 *
 * Inline images are uploaded at insert time — before the article is
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
export function useInlineImageUpload({
  enabled,
  authorPubky,
  getInlineBudget,
}: UseInlineImageUploadOptions): UseInlineImageUploadReturn {
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
      Logger.warn('[useInlineImageUpload] Best-effort session upload cleanup failed', { fileUris, error });
    }
  };

  const rejectWithToast = (description: string): Promise<never> => {
    toast({ variant: 'error', description });
    return Promise.reject(taggedRejection(`Inline image upload rejected: ${description}`));
  };

  const runUpload = async (file: File, pubky: Pubky): Promise<string> => {
    inFlightRef.current += 1;
    setUploadingCount((count) => count + 1);
    let uri: string;
    try {
      uri = await FileController.commitCreate({ file, pubky });
    } catch (error) {
      Logger.error('[useInlineImageUpload] Inline image upload failed', { error });
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(error) ?? 'Could not upload image. Try again.',
      });
      // Rethrow tagged (message preserved) so callers still see the failure
      // but the global handler doesn't re-report what was just toasted
      throw taggedRejection(error instanceof Error ? error.message : 'Inline image upload failed', error);
    } finally {
      inFlightRef.current -= 1;
      setUploadingCount((count) => count - 1);
    }

    if (discardedRef.current) {
      // The session was discarded while this upload was in flight — nothing
      // will ever finalize it, so clean up now (silently: the composer is
      // gone) instead of orphaning the file on the homeserver
      void deleteUris([uri]);
      throw taggedRejection('Inline image upload discarded before completion.');
    }

    getSession().set(uri, { objectUrl: URL.createObjectURL(file), file });
    return uri;
  };

  const uploadInlineImage = (file: File): Promise<string> => {
    if (!enabled || !authorPubky) {
      return rejectWithToast('Images can only be uploaded while composing an article.');
    }
    const pubky = authorPubky;
    // A fresh upload means the composer session is active again (e.g. after
    // an earlier discard in the same mounted composer)
    discardedRef.current = false;

    if (!ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES.includes(file.type)) {
      return rejectWithToast(`Unsupported file type for ${file.name}. Supported: ${ARTICLE_SUPPORTED_FILE_TYPES}.`);
    }

    if (file.size > IMAGE_MAX_RAW_SIZE) {
      const maxSizeLabel = `${Math.round(IMAGE_MAX_RAW_SIZE / (1024 * 1024))}MB`;
      return rejectWithToast(`${file.name} exceeds the ${maxSizeLabel} limit.`);
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
              description: `Articles support up to ${ARTICLE_ATTACHMENT_MAX_FILES} images including the cover.`,
            });
            const rejection = taggedRejection(
              'Inline image upload rejected: the batch exceeds the article image limit.',
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

  const buildLocalAttachmentEntries = (orderedUris: string[]): (InlineImageLocalEntry | null)[] => {
    const session = getSession();
    return orderedUris.map((uri) => {
      const upload = session.get(uri);
      if (!upload) return null;
      return {
        type: upload.file.type,
        name: upload.file.name,
        urls: { main: upload.objectUrl, feed: upload.objectUrl },
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

  useEffect(() => {
    if (enabled) return;
    void discardRef.current();
  }, [enabled]);

  useEffect(() => {
    return () => {
      void discardRef.current();
    };
  }, []);

  return {
    uploadInlineImage,
    getPreviewUrl,
    registerSessionUpload,
    uploadingCount,
    finalizeSession,
    discardSession,
    setCommitting,
    buildLocalAttachmentEntries,
  };
}
