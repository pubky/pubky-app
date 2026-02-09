'use client';

import React, { useState } from 'react';
import * as Libs from '@/libs';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import type { SinglePostCardProps } from './SinglePostCard.types';

/**
 * SinglePostCard Organism
 *
 * Displays a single post in a full-width card format with two columns:
 * - Left column: PostHeader, PostContent, PostActionsBar
 * - Right column: PostTagsPanel (tags with avatars and search)
 *
 * This component is used on the single post page for the main post display.
 * Tags are always visible on both mobile and desktop (no toggle).
 */
export function SinglePostCard({ postId, className }: SinglePostCardProps) {
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);

  const handleReplyClick = () => {
    setReplyDialogOpen(true);
  };

  const handleRepostClick = () => {
    setRepostDialogOpen(true);
  };

  return (
    <>
      <Atoms.Card data-cy="single-post-card" className={Libs.cn('min-w-0 rounded-lg py-0', className)}>
        <Atoms.CardContent className="flex min-w-0 flex-col gap-4 p-6">
          <Atoms.Container className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left column - Post content */}
            <Atoms.Container className="flex min-w-0 flex-col gap-4 lg:col-span-2">
              <Organisms.PostHeader postId={postId} />

              <Organisms.PostContent postId={postId} />

              {/* Spacer to push actions bar to bottom */}
              <Atoms.Container overrideDefaults className="flex-1" />

              {/* Tags on mobile - always visible */}
              <Organisms.PostTagsPanel postId={postId} widthMode="full" className="lg:hidden" />

              <Organisms.PostActionsBar
                postId={postId}
                onReplyClick={handleReplyClick}
                onRepostClick={handleRepostClick}
              />
            </Atoms.Container>

            {/* Right column - Tags (desktop only) */}
            <Organisms.PostTagsPanel postId={postId} widthMode="full" className="hidden lg:flex" />
          </Atoms.Container>
        </Atoms.CardContent>
      </Atoms.Card>

      <Organisms.DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <Organisms.DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
    </>
  );
}
