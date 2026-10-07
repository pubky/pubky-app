'use client';

import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
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
  /** Resolved image/video attachments for the post (local-first). Empty until resolved. */
  mediaItems: AttachmentConstructed[];
}

/**
 * Resolves a post's image/video attachments, local-first.
 *
 * 1. If locally-attached (unsynced) files exist for this post in the
 *    LocalFilesStore, categorize and return those.
 * 2. Otherwise, when post details are available, resolve file metadata through
 *    `useAttachmentsMetadata`: local rows are read live, and the rows the local
 *    table does not have yet are fetched from Nexus. A thumbnail that lost the
 *    `persistPosts`/`persistFiles` race therefore still appears once the file
 *    rows land, without navigation.
 *
 * The component should treat `mediaItems` as the source of truth for what to display.
 */
export function usePostAttachmentsMedia(postId: string): UsePostAttachmentsMediaResult {
  const { postDetails } = usePostDetails(postId);
  const localAttachments = useLocalFilesStore((state) => state.posts[postId]);

  // Articles carry inline body images in `attachments`, but only the cover
  // (slot-0 rule) is post-level media — inline images render inside the
  // article body, never as thumbnails or gallery items.
  const isArticle = postDetails?.kind === 'long';
  const articleHasCover =
    isArticle &&
    Boolean(postDetails.attachments?.length) &&
    !articleHasInlineSlotZero(parseArticleContent(postDetails.content)?.body ?? '');
  const mediaSlotCount = articleHasCover ? 1 : 0;

  const remoteAttachmentUris = isArticle
    ? (postDetails?.attachments ?? []).slice(0, mediaSlotCount)
    : (postDetails?.attachments ?? []);

  const { files } = useAttachmentsMetadata({
    fileUris: remoteAttachmentUris,
    enabled: Boolean(postDetails) && !localAttachments,
  });

  // Wait for the details row before resolving anything: right after a publish
  // the store is already seeded while details are still loading, and treating
  // not-yet-loaded as not-an-article would leak inline images into post-level
  // media for that interim render.
  if (!postDetails) return { mediaItems: [] };

  const mediaItems = localAttachments
    ? categorizeAttachments(isArticle ? localAttachments.slice(0, mediaSlotCount) : localAttachments).imagesAndVideos
    : splitAttachmentsByMediaType(files).imagesAndVideos;

  return { mediaItems };
}
