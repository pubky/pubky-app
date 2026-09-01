'use client';

import { useEffect, useState } from 'react';
import { FileController } from '@/controllers/file/file';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { parseArticleContent } from '@/libs/post/articleContent';
import { articleHasInlineSlotZero } from '@/libs/post/articleInlineImages';
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

    // Articles carry inline body images in `attachments`, but only the cover
    // (slot-0 rule) is post-level media — inline images render inside the
    // article body, never as thumbnails or gallery items.
    const isArticle = postDetails?.kind === 'long';
    const articleHasCover =
      isArticle &&
      Boolean(postDetails.attachments?.length) &&
      !articleHasInlineSlotZero(parseArticleContent(postDetails.content)?.body ?? '');
    const mediaSlotCount = articleHasCover ? 1 : 0;

    const resolveMedia = async () => {
      // Wait for the details row before resolving anything: right after a
      // publish the store is already seeded while details are still loading,
      // and treating not-yet-loaded as not-an-article would leak inline
      // images into post-level media for that interim render
      if (!postDetails) {
        if (!cancelled) {
          setMediaItems([]);
        }
        return;
      }

      if (localAttachments) {
        const localMedia = isArticle ? localAttachments.slice(0, mediaSlotCount) : localAttachments;
        if (!cancelled) {
          setMediaItems(categorizeAttachments(localMedia).imagesAndVideos);
        }
        return;
      }

      const attachmentUris = isArticle
        ? (postDetails?.attachments ?? []).slice(0, mediaSlotCount)
        : (postDetails?.attachments ?? []);
      if (attachmentUris.length === 0) {
        if (!cancelled) {
          setMediaItems([]);
        }
        return;
      }

      try {
        const metadata = await FileController.getMetadata({ fileAttachments: attachmentUris });
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
  }, [localAttachments, postDetails]);

  return { mediaItems };
}
