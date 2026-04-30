'use client';

import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { usePostArticle } from '@/hooks/usePostArticle/usePostArticle';
import { useRef, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { PostText } from '@/molecules/PostText/PostText';
import { DialogCheckLink } from '../DialogCheckLink/DialogCheckLink';
import { DialogReply } from '../DialogReply/DialogReply';
import { DialogRepost } from '../DialogRepost/DialogRepost';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostContentBlurred } from '../PostContentBlurred/PostContentBlurred';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../PostTagsPanel/PostTagsPanel.types';

import type { PostDetailsModel } from '@/models/post/details/postDetails';
import { FileVariant } from '@/services/nexus/file/file.types';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
interface SinglePostArticleProps {
  postId: string;
  content: string;
  attachments: PostDetailsModel['attachments'];
  isBlurred: boolean;
}

/**
 * SinglePostArticle Organism
 *
 * Displays a single article post with tags always visible on both mobile and desktop (no toggle).
 */
export const SinglePostArticle = ({ postId, content, attachments, isBlurred }: SinglePostArticleProps) => {
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const mobileTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const desktopTagsPanelRef = useRef<PostTagsPanelHandle>(null);

  const handleTagClick = () => {
    mobileTagsPanelRef.current?.focus();
    desktopTagsPanelRef.current?.focus();
  };

  const handleReplyClick = () => {
    setReplyDialogOpen(true);
  };

  const handleRepostClick = () => {
    setRepostDialogOpen(true);
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
        {/* Left column - Post content */}
        <Container className="lg:col-span-2">
          <Typography as="h1" size="2xl" className="mb-6 wrap-anywhere hyphens-auto">
            {title}
          </Typography>

          <PostHeader postId={postId} size="large" timeAgoPlacement="bottom-left" />

          <PostActionsBar
            postId={postId}
            onTagClick={handleTagClick}
            onReplyClick={handleReplyClick}
            onRepostClick={handleRepostClick}
            className="mt-3 mb-6"
          />

          {isBlurred ? (
            <PostContentBlurred postId={postId} />
          ) : (
            <>
              {finalCoverImage && (
                <Image src={finalCoverImage.src} alt={finalCoverImage.alt} className="mb-6 w-full rounded-md" />
              )}

              <PostText content={body} isArticle onLinkClick={handleLinkClick} />
            </>
          )}

          {/* Tags on mobile */}
          <PostTagsPanel ref={mobileTagsPanelRef} postId={postId} widthMode="full" className="mt-6 flex lg:hidden" />
        </Container>

        {/* Right column - Tags (desktop only) */}
        <PostTagsPanel ref={desktopTagsPanelRef} postId={postId} widthMode="full" className="hidden lg:flex" />
      </Container>

      <DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />

      <Typography className="text-2xl font-light text-muted-foreground">Replies</Typography>
    </>
  );
};
