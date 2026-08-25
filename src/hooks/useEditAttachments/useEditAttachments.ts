'use client';

import { useEffect, useRef, useState } from 'react';
import { FileController } from '@/controllers/file/file';
import type { ExistingAttachment } from '@/hooks/usePost/usePost.types';
import { Logger } from '@/libs/logger/logger';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import type { UseEditAttachmentsOptions, UseEditAttachmentsReturn } from './useEditAttachments.types';

type FileMetadata = Awaited<ReturnType<typeof FileController.getMetadata>>[number];

/** Content type used until a file's metadata resolves. */
const PLACEHOLDER_TYPE = 'application/octet-stream';

const placeholderName = (uri: string): string => uri.split('/').pop() ?? 'file';

const toResolvedAttachment = (uri: string, metadata: FileMetadata): ExistingAttachment => ({
  uri,
  type: metadata.content_type,
  name: metadata.name,
  urls: {
    main: FileController.getFileUrl({ fileId: metadata.id, variant: FileVariant.MAIN }),
    feed: metadata.content_type.startsWith('image')
      ? FileController.getFileUrl({ fileId: metadata.id, variant: FileVariant.FEED })
      : undefined,
  },
});

/**
 * Seeds and resolves the composer's existing-attachment list for the EDIT variant.
 *
 * Seeding happens once per mount (the edit dialog remounts via `resetKey` on
 * discard) with one entry per URI in display order, so the kept-URI set never
 * depends on async resolution. Preview URLs come from the local files store
 * when it has an entry for the post (same-session create — CDN may not have
 * indexed the files yet), otherwise from local file metadata / the CDN, with a
 * Nexus backfill for metadata that is not cached locally. Unresolvable entries
 * stay as placeholders (rendered as a generic file card, still removable and
 * still kept on submit).
 */
export function useEditAttachments({
  enabled,
  postId,
  uris,
  existingAttachments,
  setExistingAttachments,
}: UseEditAttachmentsOptions): UseEditAttachmentsReturn {
  const seededRef = useRef(false);
  // Snapshot of the URI list the composer was seeded from. Change detection at
  // submit time must compare against this, not the live post row — the row can
  // change underneath an open dialog (another tab/device, background refresh),
  // and diffing against it would misclassify a content-only edit as an
  // attachment edit and delete files the user never touched.
  const [seededUris, setSeededUris] = useState<string[] | undefined>(undefined);

  // Seed once per mount, as soon as the URI list is available.
  useEffect(() => {
    if (!enabled || seededRef.current || !postId || !uris) return;
    seededRef.current = true;
    setSeededUris(uris);

    if (uris.length === 0) return;

    // The create flow writes the store entry in attachment order, so zipping by
    // index is safe; on a length mismatch the store entry is ignored entirely.
    const storeAttachments = useLocalFilesStore.getState().posts[postId];
    const storeByIndex = storeAttachments?.length === uris.length ? storeAttachments : undefined;

    setExistingAttachments(
      uris.map((uri, index) => {
        const stored = storeByIndex?.[index];
        return stored
          ? { uri, type: stored.type, name: stored.name, urls: stored.urls }
          : { uri, type: PLACEHOLDER_TYPE, name: placeholderName(uri), urls: null };
      }),
    );
  }, [enabled, postId, uris, setExistingAttachments]);

  // Resolve metadata for entries seeded as placeholders.
  useEffect(() => {
    if (!enabled) return;

    const unresolvedUris = existingAttachments
      .filter((attachment) => attachment.urls === null && !attachment.resolutionFailed)
      .map((attachment) => attachment.uri);
    if (unresolvedUris.length === 0) return;

    let cancelled = false;

    const applyResolved = (metadata: FileMetadata[]) => {
      if (cancelled || metadata.length === 0) return;
      const metadataByUri = new Map(metadata.map((file) => [file.uri, file]));
      // Mapping over `prev` guarantees user-removed items are never resurrected.
      setExistingAttachments((prev) =>
        prev.map((attachment) => {
          if (attachment.urls !== null) return attachment;
          const resolved = metadataByUri.get(attachment.uri);
          return resolved ? toResolvedAttachment(attachment.uri, resolved) : attachment;
        }),
      );
    };

    const resolve = async () => {
      const attemptedUris = new Set(unresolvedUris);

      // Entries this pass attempted that are still unresolved when it finishes
      // will never resolve — mark them terminal so the UI can swap the loading
      // skeleton for the generic (named, removable) file card
      const markFailed = () => {
        if (cancelled) return;
        setExistingAttachments((prev) =>
          prev.map((attachment) =>
            attachment.urls === null && !attachment.resolutionFailed && attemptedUris.has(attachment.uri)
              ? { ...attachment, resolutionFailed: true }
              : attachment,
          ),
        );
      };

      try {
        const metadata = await FileController.getMetadata({ fileAttachments: unresolvedUris });
        applyResolved(metadata);

        const foundUris = new Set(metadata.map((file) => file.uri));
        const missingUris = unresolvedUris.filter((uri) => !foundUris.has(uri));
        if (missingUris.length > 0 && !cancelled) {
          await FileController.fetchFiles({ fileUris: missingUris });
          applyResolved(await FileController.getMetadata({ fileAttachments: missingUris }));
        }
      } catch (error) {
        Logger.error('[useEditAttachments] Failed to resolve attachment metadata', { uris: unresolvedUris, error });
      } finally {
        markFailed();
      }
    };

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [enabled, existingAttachments, setExistingAttachments]);

  return { seededUris };
}
