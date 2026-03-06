'use client';

import React, { useRef, useState } from 'react';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import type { PostTagsPanelHandle } from '@/organisms';
import { POST_TAGS_MAX_COUNT, POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config';
import type { SinglePostCardProps } from './SinglePostCard.types';

/**
 * SinglePostCard Organism
 *
 * Displays a single post in a full-width card format with two columns:
 * - Left column: PostHeader, PostContent, PostActionsBar
 * - Right column: PostTagsPanel (tags with avatars and search)
 *
 * This component is used on the single post page for the main post display.
 */
export function SinglePostCard({ postId, className }: SinglePostCardProps) {
  const isMobile = Hooks.useIsMobile();
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const mobileTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const desktopTagsPanelRef = useRef<PostTagsPanelHandle>(null);

  const handleTagClick = () => {
    if (isMobile) {
      setTagsExpanded((prev) => !prev);
      return;
    }

    mobileTagsPanelRef.current?.focus();
    desktopTagsPanelRef.current?.focus();
  };

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
          {isMobile ? (
            <>
              <Organisms.PostHeader postId={postId} />

              <Organisms.PostContent postId={postId} />

              <Atoms.Container
                className={Libs.cn(
                  'flex-col items-start gap-2 md:flex-row md:justify-between md:gap-4',
                  tagsExpanded ? 'md:items-end' : 'md:items-start',
                )}
              >
                {tagsExpanded ? (
                  <Organisms.PostTagsPanel postId={postId} widthMode="fit" autoFocusInput className="flex-1" />
                ) : (
                  <Organisms.ClickableTagsList
                    taggedId={postId}
                    taggedKind={Core.TagKind.POST}
                    maxTags={POST_TAGS_MAX_COUNT}
                    maxTagLength={POST_TAGS_MAX_LENGTH}
                    maxTotalChars={POST_TAGS_MAX_TOTAL_CHARS}
                    showCount={true}
                    showInput={false}
                    showAddButton={true}
                    addMode={true}
                  />
                )}

                <Organisms.PostActionsBar
                  postId={postId}
                  onTagClick={handleTagClick}
                  onReplyClick={handleReplyClick}
                  onRepostClick={handleRepostClick}
                  className="shrink-0 justify-start md:justify-end"
                />
              </Atoms.Container>
            </>
          ) : (
            <Atoms.Container className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Left column - Post content */}
              <Atoms.Container className="flex min-w-0 flex-col gap-4 lg:col-span-2">
                <Organisms.PostHeader postId={postId} timeAgoPlacement="bottom-left" />

                <Organisms.PostContent postId={postId} />

                {/* Spacer to push actions bar to bottom */}
                <Atoms.Container overrideDefaults className="flex-1" />

                {/* Tags on mobile - always visible */}
                <Organisms.PostTagsPanel
                  ref={mobileTagsPanelRef}
                  postId={postId}
                  widthMode="full"
                  className="lg:hidden"
                />

                <Organisms.PostActionsBar
                  postId={postId}
                  onTagClick={handleTagClick}
                  onReplyClick={handleReplyClick}
                  onRepostClick={handleRepostClick}
                />
              </Atoms.Container>

              {/* Right column - Tags (desktop only) */}
              <Organisms.PostTagsPanel
                ref={desktopTagsPanelRef}
                postId={postId}
                widthMode="full"
                className="hidden lg:flex"
              />
            </Atoms.Container>
          )}
        </Atoms.CardContent>
      </Atoms.Card>

      <Organisms.DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <Organisms.DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
    </>
  );
}
