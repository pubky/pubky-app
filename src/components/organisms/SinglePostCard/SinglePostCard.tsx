'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import React, { useRef, useState } from 'react';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { ClickableTagsList } from '../ClickableTagsList/ClickableTagsList';
import { DialogReply } from '../DialogReply/DialogReply';
import { DialogRepost } from '../DialogRepost/DialogRepost';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostContent } from '../PostContent/PostContent';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../PostTagsPanel/PostTagsPanel.types';

import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { usePostMainLayout, WIDE_POST_LAYOUT_CLASSES } from '@/organisms/PostMain/PostMainLayout';
import type { SinglePostCardProps } from './SinglePostCard.types';
import { cn } from '@/libs/utils/utils';
import { TagKind } from '@/application/tag/tag.types';
/**
 * SinglePostCard Organism
 *
 * Displays a single post in a full-width card format with two columns:
 * - Left column: PostHeader, PostContent, PostActionsBar
 * - Right column: PostTagsPanel (tags with avatars and search)
 *
 * This component is used on the single post page for the main post display.
 * The surface (SinglePostContent) wraps the page in PostMainLayoutProvider,
 * keeping this wrapper aligned with PostMain via the shared context.
 */
export function SinglePostCard({ postId, className }: SinglePostCardProps) {
  const isMobile = useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const desktopTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const isWideLayout = inheritedTagsLayout === 'side';

  const handleTagClick = () => {
    setTagsExpanded((prev) => !prev);

    desktopTagsPanelRef.current?.focus();
  };

  const handleReplyClick = () => {
    setReplyDialogOpen(true);
  };

  const handleRepostClick = () => {
    setRepostDialogOpen(true);
  };
  const handleFooterClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  const tagsSection = tagsExpanded ? (
    <PostTagsPanel postId={postId} widthMode="fit" autoFocusInput enableLoadingSkeleton={false} className="flex-1" />
  ) : (
    <ClickableTagsList
      taggedId={postId}
      taggedKind={TagKind.POST}
      maxTagLength={POST_TAGS_MAX_LENGTH}
      maxTotalChars={POST_TAGS_MAX_TOTAL_CHARS}
      showCount={true}
      showInput={false}
      showAddButton={true}
      addMode={true}
    />
  );

  return (
    <>
      <Card data-cy="single-post-card" className={cn('min-w-0 rounded-lg py-0', className)}>
        <CardContent className={cn('flex min-w-0 flex-col', !isMobile && isWideLayout ? 'p-0' : 'gap-4 p-6')}>
          {isMobile ? (
            <>
              <PostHeader postId={postId} />

              <PostContent postId={postId} />

              <Container
                className={cn(
                  'flex-col items-start gap-2 md:flex-row md:justify-between md:gap-4',
                  tagsExpanded ? 'md:items-end' : 'md:items-start',
                )}
              >
                {tagsSection}

                <PostActionsBar
                  postId={postId}
                  onTagClick={handleTagClick}
                  onReplyClick={handleReplyClick}
                  onRepostClick={handleRepostClick}
                  className="shrink-0 justify-start md:justify-end"
                />
              </Container>
            </>
          ) : isWideLayout ? (
            <Container className={WIDE_POST_LAYOUT_CLASSES.shell}>
              <Container className={WIDE_POST_LAYOUT_CLASSES.leftColumn}>
                <PostHeader postId={postId} size="large" timeAgoPlacement="bottom-left" />

                <PostContent postId={postId} textClassName={WIDE_POST_LAYOUT_CLASSES.bodyText} />

                {/* Spacer to push actions bar to bottom */}
                <Container overrideDefaults className="flex-1" />

                <Container
                  onClick={handleFooterClick}
                  className={cn(
                    'flex-col items-start gap-2 md:flex-row md:justify-between md:gap-4',
                    tagsExpanded ? 'md:items-end' : 'md:items-start',
                  )}
                >
                  <PostActionsBar
                    postId={postId}
                    onTagClick={handleTagClick}
                    onReplyClick={handleReplyClick}
                    onRepostClick={handleRepostClick}
                  />
                </Container>
              </Container>

              <Container className={WIDE_POST_LAYOUT_CLASSES.rightColumn}>
                <PostTagsPanel ref={desktopTagsPanelRef} postId={postId} widthMode="full" className="w-full" />
              </Container>
            </Container>
          ) : (
            <Container className="flex min-w-0 flex-col gap-4">
              <PostHeader postId={postId} size="normal" timeAgoPlacement="bottom-left" />

              <PostContent postId={postId} />

              {/* Spacer to push actions bar to bottom */}
              <Container overrideDefaults className="flex-1" />

              <Container
                onClick={handleFooterClick}
                className={cn(
                  'flex-col items-start gap-2 md:flex-row md:justify-between md:gap-4',
                  tagsExpanded ? 'md:items-end' : 'md:items-start',
                )}
              >
                {tagsSection}

                <PostActionsBar
                  postId={postId}
                  onTagClick={handleTagClick}
                  onReplyClick={handleReplyClick}
                  onRepostClick={handleRepostClick}
                />
              </Container>
            </Container>
          )}
        </CardContent>
      </Card>

      <DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
    </>
  );
}
