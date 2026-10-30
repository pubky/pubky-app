'use client';

import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { resolveArticleCover } from '@/libs/post/articleCover';
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
  const localArticleCover = useLocalFilesStore((state) => state.articleCovers[postId]);

  // Articles carry inline body media in `attachments`, but only the cover is
  // post-level media — inline media renders inside the article body, never as
  // thumbnails or gallery items. `resolveArticleCover` says where the cover is
  // (the envelope, or slot 0 of a 0.x article under the slot-0 rule).
  const isArticle = postDetails?.kind === 'long';
  const articleCover = isArticle
    ? resolveArticleCover({ content: postDetails.content, attachments: postDetails.attachments }).cover
    : null;

  const remoteAttachmentUris = isArticle ? (articleCover ? [articleCover] : []) : (postDetails?.attachments ?? []);
  const hasLocalMedia = isArticle ? Boolean(localArticleCover) : Boolean(localAttachments);

  const { files } = useAttachmentsMetadata({
    fileUris: remoteAttachmentUris,
    enabled: Boolean(postDetails) && !hasLocalMedia,
  });

  // Wait for the details row before resolving anything: right after a publish
  // the store is already seeded while details are still loading, and treating
  // not-yet-loaded as not-an-article would leak inline images into post-level
  // media for that interim render.
  if (!postDetails) return { mediaItems: [] };

  if (isArticle) {
    const mediaItems = localArticleCover
      ? categorizeAttachments([localArticleCover]).imagesAndVideos
      : splitAttachmentsByMediaType(files).imagesAndVideos;
    return { mediaItems };
  }

  const mediaItems = localAttachments
    ? categorizeAttachments(localAttachments).imagesAndVideos
    : splitAttachmentsByMediaType(files).imagesAndVideos;

  return { mediaItems };
}
