'use client';

import { useRef } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { cn } from '@/libs/utils/utils';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostText } from '@/molecules/PostText/PostText';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { DialogCheckLink } from '../DialogCheckLink/DialogCheckLink';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostContentBlurred } from '../PostContentBlurred/PostContentBlurred';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../PostTagsPanel/PostTagsPanel.types';

interface PostArticleDetailProps {
  postId: string;
  content: string;
  attachments: PostDetailsModel['attachments'];
  isBlurred: boolean;
}

/**
 * Displays an article post detail page with tags always visible on mobile and desktop.
 * Columns places desktop tags under the header (max-w-2/4); other layouts use a side tags column.
 */
export const PostArticleDetail = ({ postId, content, attachments, isBlurred }: PostArticleDetailProps) => {
  const layout = useHomeStore((state) => state.layout);
  const isColumnsLayout = layout === LAYOUT.COLUMNS;
  const { openReplyDialog, openRepostDialog, dialogs } = usePostReplyRepostDialogs(postId);
  const mobileTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const desktopTagsPanelRef = useRef<PostTagsPanelHandle>(null);

  const handleTagClick = () => {
    mobileTagsPanelRef.current?.focus();
    desktopTagsPanelRef.current?.focus();
  };

  const { title, body, coverImage } = usePostArticle({
    content,
    attachments,
    coverImageVariant: FileVariant.MAIN,
  });

  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();

  const localAttachments = useLocalFilesStore((s) => s.posts[postId]);

  const localCoverImage = localAttachments?.[0]?.type.startsWith('image')
    ? { src: localAttachments[0].urls.main, alt: localAttachments[0].name }
    : null;

  const finalCoverImage = localCoverImage || coverImage;

  const articleHeader = (
    <>
      <Typography as="h1" size="2xl" className="mb-6 wrap-anywhere">
        {title}
      </Typography>

      <PostHeader postId={postId} size="large" timeAgoPlacement="bottom-left" />

      <PostActionsBar
        postId={postId}
        onTagClick={handleTagClick}
        onReplyClick={openReplyDialog}
        onRepostClick={openRepostDialog}
        className="mt-3 mb-6"
      />
    </>
  );

  const articleBody = isBlurred ? (
    <PostContentBlurred postId={postId} />
  ) : (
    <>
      {finalCoverImage && (
        <Image
          src={finalCoverImage.src}
          alt={finalCoverImage.alt}
          className="mb-6 aspect-video w-full rounded-md object-cover object-center"
        />
      )}

      <PostText content={body} isArticle onLinkClick={handleLinkClick} />
    </>
  );

  return (
    <>
      <Container className={cn('mb-6 gap-6', !isColumnsLayout && 'grid grid-cols-1 lg:grid-cols-3')}>
        <Container className={cn(!isColumnsLayout && 'lg:col-span-2')}>
          {articleHeader}
          {isColumnsLayout && (
            <Container overrideDefaults className="mx-0 mb-6 max-w-2/4">
              <PostTagsPanel
                ref={desktopTagsPanelRef}
                postId={postId}
                widthMode="full"
                className="mx-0 hidden lg:flex"
              />
            </Container>
          )}
          {articleBody}
          <PostTagsPanel ref={mobileTagsPanelRef} postId={postId} widthMode="full" className="mt-6 flex lg:hidden" />
        </Container>

        {!isColumnsLayout && (
          <PostTagsPanel ref={desktopTagsPanelRef} postId={postId} widthMode="full" className="hidden lg:flex" />
        )}
      </Container>

      {dialogs}
      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
