'use client';

import { useEffect, useState } from 'react';
import { FileController } from '@/controllers/file/file';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import {
  categorizeAttachments,
  splitAttachmentsByMediaType,
} from '@/organisms/PostAttachments/PostAttachments.helpers';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';

interface UsePostAttachmentsMediaResult {
  /** Resolved image/video attachments for the post (local-first). Empty until resolved / on error. */
  mediaItems: AttachmentConstructed[];
}

/**
 * Resolves a post's image/video attachments, local-first.
 *
 * 1. If locally-attached (unsynced) files exist for this post in the
 *    LocalFilesStore, categorize and return those.
 * 2. Otherwise, when post details are available, fetch file metadata via
 *    FileController and split into media buckets.
 *
 * Network errors fall back to an empty list so the consumer simply renders
 * nothing — matching the prior inline behaviour. The component should treat
 * `mediaItems` as the source of truth for what to display.
 */
export function usePostAttachmentsMedia(postId: string): UsePostAttachmentsMediaResult {
  const { postDetails } = usePostDetails(postId);
  const localAttachments = useLocalFilesStore((state) => state.posts[postId]);
  const [mediaItems, setMediaItems] = useState<AttachmentConstructed[]>([]);

  useEffect(() => {
    let cancelled = false;

    const resolveMedia = async () => {
      if (localAttachments) {
        if (!cancelled) {
          setMediaItems(categorizeAttachments(localAttachments).imagesAndVideos);
        }
        return;
      }

      if (!postDetails?.attachments?.length) {
        if (!cancelled) {
          setMediaItems([]);
        }
        return;
      }

      try {
        const metadata = await FileController.getMetadata({ fileAttachments: postDetails.attachments });
        if (cancelled) return;

        setMediaItems(splitAttachmentsByMediaType(metadata).imagesAndVideos);
      } catch {
        if (!cancelled) {
          setMediaItems([]);
        }
      }
    };

    void resolveMedia();

    return () => {
      cancelled = true;
    };
  }, [localAttachments, postDetails?.attachments]);

  return { mediaItems };
}
