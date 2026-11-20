'use client';

import { useRef } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useAttachmentsMetadata } from '@/hooks/useAttachmentsMetadata/useAttachmentsMetadata';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { resolveArticleCover } from '@/libs/post/articleCover';
import { collectAttachmentRefIndexes, isAuthorFileUri } from '@/libs/post/articleInlineMedia';
import {
  POST_COVER_DESKTOP_FALLBACK_VARIANT,
  POST_COVER_DESKTOP_VARIANT,
  POST_COVER_MOBILE_VARIANT,
} from '@/libs/post/postCoverVariant';
import { cn } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import type { ArticleMediaSource } from '@/molecules/ArticleInlineMedia/ArticleInlineMedia.types';
import { LockAccessLabel } from '@/molecules/LockAccessLabel/LockAccessLabel';
import { getTagsLayoutForSurfaceLayout } from '@/organisms/PostMain/PostMainLayoutRules';
import { useHomeStore } from '@/stores/home/home.store';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { ArticleReader } from '../ArticleReader/ArticleReader';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import type { AttachmentConstructed, PendingAttachment } from '../PostAttachments/PostAttachments.types';
import { PostContentBlurred } from '../PostContentBlurred/PostContentBlurred';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInlineTagsActions } from '../PostInlineTagsActions/PostInlineTagsActions';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../PostTagsPanel/PostTagsPanel.types';

interface PostArticleDetailProps {
  postId: string;
  content: string;
  attachments: PostDetailsModel['attachments'];
  isBlurred: boolean;
  /**
   * A lock post's article, read from the viewer's own copy: its files never reach Nexus, and the
   * post's local files are its teaser's, so the article's media come from here alone.
   */
  unlocked?: {
    media: AttachmentConstructed[];
    pendingAttachments: PendingAttachment[];
    isOwnLock: boolean;
  };
}

/**
 * Displays an article post detail page.
 * Columns reuses the regular post inline tags/actions; wide and list use a side tags column.
 * Any other layout value (visual, or a future one) renders as columns, the same rule
 * `getTagsLayoutForSurfaceLayout` applies to the rest of the single-post surface.
 */
export const PostArticleDetail = ({ postId, content, attachments, isBlurred, unlocked }: PostArticleDetailProps) => {
  const layout = useHomeStore((state) => state.layout);
  const isColumnsLayout = getTagsLayoutForSurfaceLayout(layout) === 'inline';
  const { openReplyDialog, openRepostDialog, dialogs } = usePostReplyRepostDialogs(postId);
  const mobileTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const desktopTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const isMobile = useIsMobile();

  const handleTagClick = () => {
    // The tag button only reveals the tags. On mobile that reveal must not focus the input and pop
    // the soft keyboard: the `[+]` add control owns autofocus. It still has to bring the panel
    // into view, which the desktop path gets from `focus()` as a side effect.
    if (isMobile) {
      mobileTagsPanelRef.current?.reveal();
      return;
    }
    mobileTagsPanelRef.current?.focus();
    desktopTagsPanelRef.current?.focus();
  };

  const storeAttachments = useLocalFilesStore((s) => s.posts[postId]);
  const localAttachments = unlocked ? unlocked.media : storeAttachments;
  // The cover this session published or edited, if any: its own store entry, since the cover is no
  // attachment slot (ADR-0023 as amended by ADR-0027). Unlocked content keeps its cover in slot 0.
  const storeCover = useLocalFilesStore((s) => s.articleCovers[postId]);

  const { title, body, coverImage, isCoverPending } = usePostArticle({
    content,
    attachments,
    localAttachments,
    pendingAttachments: unlocked?.pendingAttachments,
    localCover: unlocked ? undefined : storeCover,
    // Both variants come from the same constants the server-side preload reads, so the
    // preloaded URL is the one this image asks for and the cover downloads once.
    coverImageVariant: POST_COVER_MOBILE_VARIANT,
    coverImageDesktopVariant: POST_COVER_DESKTOP_VARIANT,
    coverImageDesktopFallbackVariant: POST_COVER_DESKTOP_FALLBACK_VARIANT,
  });

  // What each `attachment:{n}` of the body names depends on the stored shape (the envelope's cover,
  // a migrated article's shifted slots, or a 0.x article's slot 0): the resolved slots stand in
  // for the raw attachments wherever a slot is read.
  const { slots } = resolveArticleCover({ content, attachments });

  // Inline slots are typed from their file rows (the markdown never says video or image). Only the
  // slots the body references and the author owns are read: anything else never renders, and a row
  // request for it would only add a fetch and hold the loading state. The cover is
  // `usePostArticle`'s.
  const articleAuthorId = (() => {
    try {
      return parseCompositeId(postId).pubky;
    } catch {
      return '';
    }
  })();
  const inlineSlotIndexes = collectAttachmentRefIndexes(body);
  const inlineSlotUris = slots.filter(
    (uri, index) => inlineSlotIndexes.has(index) && isAuthorFileUri(uri, articleAuthorId),
  );
  const { files: inlineFiles, isLoading: inlineFilesLoading } = useAttachmentsMetadata({ fileUris: inlineSlotUris });

  // Unlocked content's refs index the reader's own entries directly (the slot-0 convention).
  const articleMedia: ArticleMediaSource = unlocked
    ? { localAttachments: unlocked.media, pendingAttachments: unlocked.pendingAttachments }
    : {
        attachments: [...slots],
        authorId: articleAuthorId,
        postId,
        files: inlineFiles,
        metadataSettled: !inlineFilesLoading,
      };

  const articleHeader = (
    <>
      <Typography as="h1" size="2xl" className="mb-6 wrap-anywhere">
        {title}
      </Typography>

      <PostHeader
        postId={postId}
        size="extraLarge"
        timeAgoPlacement="bottom-left"
        metadataSlot={unlocked && <LockAccessLabel isOwnLock={unlocked.isOwnLock} />}
      />

      {isColumnsLayout ? (
        <PostInlineTagsActions
          postId={postId}
          onReplyClick={openReplyDialog}
          onRepostClick={openRepostDialog}
          className="mt-3 mb-6"
        />
      ) : (
        <PostActionsBar
          postId={postId}
          onTagClick={handleTagClick}
          onReplyClick={openReplyDialog}
          onRepostClick={openRepostDialog}
          className="mt-3 mb-6"
        />
      )}
    </>
  );

  const articleBody = isBlurred ? (
    <PostContentBlurred postId={postId} />
  ) : (
    <ArticleReader
      body={body}
      coverImage={coverImage}
      isCoverPending={isCoverPending}
      articleMedia={articleMedia}
      priority
    />
  );

  return (
    <>
      <Container className={cn('mb-6 gap-6', !isColumnsLayout && 'grid grid-cols-1 lg:grid-cols-3')}>
        <Container className={cn(!isColumnsLayout && 'lg:col-span-2')}>
          {articleHeader}
          {articleBody}
          {!isColumnsLayout && (
            <PostTagsPanel ref={mobileTagsPanelRef} postId={postId} widthMode="full" className="mt-6 flex lg:hidden" />
          )}
        </Container>

        {!isColumnsLayout && (
          <PostTagsPanel ref={desktopTagsPanelRef} postId={postId} widthMode="full" className="hidden lg:flex" />
        )}
      </Container>

      {dialogs}
    </>
  );
};
