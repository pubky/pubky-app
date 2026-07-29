'use client';

import { useRef } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostText } from '@/molecules/PostText/PostText';
import { FileVariant } from '@/services/nexus/file/file.types';
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
 */
export const PostArticleDetail = ({ postId, content, attachments, isBlurred }: PostArticleDetailProps) => {
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

  return (
    <>
      <Container className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Container className="lg:col-span-2">
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

          {isBlurred ? (
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
          )}

          <PostTagsPanel ref={mobileTagsPanelRef} postId={postId} widthMode="full" className="mt-6 flex lg:hidden" />
        </Container>

        <PostTagsPanel ref={desktopTagsPanelRef} postId={postId} widthMode="full" className="hidden lg:flex" />
      </Container>

      {dialogs}
      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
};
