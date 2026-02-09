'use client';

import type { PostDetailsModel } from '@/core';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import { useState } from 'react';

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

  const handleReplyClick = () => {
    setReplyDialogOpen(true);
  };

  const handleRepostClick = () => {
    setRepostDialogOpen(true);
  };

  const { title, body, coverImage } = Hooks.usePostArticle({
    content,
    attachments,
    coverImageVariant: Core.FileVariant.MAIN,
  });

  return (
    <>
      <Atoms.Container className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column - Post content */}
        <Atoms.Container className="lg:col-span-2">
          <Atoms.Typography as="h1" size="2xl" className="mb-6 wrap-anywhere hyphens-auto">
            {title}
          </Atoms.Typography>

          <Organisms.PostHeader postId={postId} size="large" timeAgoPlacement="bottom-left" />

          <Organisms.PostActionsBar
            postId={postId}
            onReplyClick={handleReplyClick}
            onRepostClick={handleRepostClick}
            className="mt-3 mb-6"
          />

          {isBlurred ? (
            <Organisms.PostContentBlurred postId={postId} />
          ) : (
            <>
              {coverImage && (
                <Atoms.Image src={coverImage.src} alt={coverImage.alt} className="mb-6 w-full rounded-md" />
              )}

              <Molecules.PostText content={body} isArticle />
            </>
          )}

          {/* Tags on mobile */}
          <Organisms.PostTagsPanel postId={postId} widthMode="full" className="mt-6 flex lg:hidden" />
        </Atoms.Container>

        {/* Right column - Tags (desktop only) */}
        <Organisms.PostTagsPanel postId={postId} widthMode="full" className="hidden lg:flex" />
      </Atoms.Container>

      <Organisms.DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <Organisms.DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />

      <Atoms.Typography className="text-2xl font-light text-muted-foreground">Replies</Atoms.Typography>
    </>
  );
};
