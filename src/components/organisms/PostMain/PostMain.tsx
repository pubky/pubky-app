'use client';

import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import React, { useRef, useState } from 'react';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
import { RepostHeader } from '@/molecules/RepostHeader/RepostHeader';
import { ClickableTagsList } from '../ClickableTagsList/ClickableTagsList';
import { DialogReply } from '../DialogReply/DialogReply';
import { DialogRepost } from '../DialogRepost/DialogRepost';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostContent } from '../PostContent/PostContent';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../PostTagsPanel/PostTagsPanel.types';

import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config/tags';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';

import type { PostMainProps } from './PostMain.types';
import { usePostMainLayout, WIDE_POST_LAYOUT_CLASSES } from './PostMainLayout';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { TagKind } from '@/application/tag/tag.types';
export function PostMain({ postId, onClick, className, isReply = false, isLastReply = false }: PostMainProps) {
  const isMobile = useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';
  const effectiveTagsLayout = inheritedTagsLayout === 'side' && isMobile ? 'inline' : inheritedTagsLayout;
  const isWideLayout = effectiveTagsLayout === 'side';
  const { postDetails } = usePostDetails(postId);
  const isDeleted = isPostDeleted(postDetails?.content);

  const { showRepostHeader, shouldShowPostHeader } = usePostHeaderVisibility(postId);

  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const mobileTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const desktopTagsPanelRef = useRef<PostTagsPanelHandle>(null);

  // Get post height for thread connector
  const { ref: cardRef, height: postHeight } = useElementHeight();

  // Subscribe to TTL coordinator based on viewport visibility
  const { ref: ttlRef } = useTtlSubscription({
    type: 'post',
    id: postId,
  });

  // Determine thread connector variant based on reply status
  const connectorVariant = isLastReply ? POST_THREAD_CONNECTOR_VARIANTS.LAST : POST_THREAD_CONNECTOR_VARIANTS.REGULAR;

  const handleReplyClick = () => {
    setReplyDialogOpen(true);
  };

  const handleRepostClick = () => {
    setRepostDialogOpen(true);
  };

  const handleFooterClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return (
    <>
      <Container
        ref={ttlRef}
        overrideDefaults
        onClick={onClick}
        className={cn('relative flex min-w-0 cursor-pointer', isReply && 'pl-3')}
      >
        {isReply && (
          <Container overrideDefaults className="absolute top-0 bottom-0 left-0 w-3">
            <PostThreadConnector height={postHeight} variant={connectorVariant} />
          </Container>
        )}
        <Card ref={cardRef} className={cn('min-w-0 flex-1 gap-0 rounded-md py-0', className)}>
          {isDeleted ? (
            <PostDeleted />
          ) : (
            <CardContent className={cn('flex min-w-0 flex-col', isWideLayout ? 'p-0' : 'gap-4 p-6')}>
              {showRepostHeader && (
                <Container overrideDefaults className={cn(isWideLayout && 'px-12 pt-12 pb-6')}>
                  <RepostHeader />
                </Container>
              )}
              {isWideLayout ? (
                <Container className={WIDE_POST_LAYOUT_CLASSES.shell}>
                  <Container className={WIDE_POST_LAYOUT_CLASSES.leftColumn}>
                    {shouldShowPostHeader && <PostHeader postId={postId} size="large" timeAgoPlacement="bottom-left" />}
                    <PostContent postId={postId} textClassName={WIDE_POST_LAYOUT_CLASSES.bodyText} />
                    <Container overrideDefaults onClick={handleFooterClick} className="flex flex-col gap-4">
                      <PostTagsPanel ref={mobileTagsPanelRef} postId={postId} widthMode="full" className="lg:hidden" />
                      <PostActionsBar
                        postId={postId}
                        onTagClick={() => {
                          mobileTagsPanelRef.current?.focus();
                          desktopTagsPanelRef.current?.focus();
                        }}
                        onReplyClick={handleReplyClick}
                        onRepostClick={handleRepostClick}
                      />
                    </Container>
                  </Container>
                  <Container
                    overrideDefaults
                    onClick={handleFooterClick}
                    className={WIDE_POST_LAYOUT_CLASSES.rightColumn}
                  >
                    <PostTagsPanel ref={desktopTagsPanelRef} postId={postId} widthMode="full" className="w-full" />
                  </Container>
                </Container>
              ) : (
                <>
                  {shouldShowPostHeader && <PostHeader postId={postId} />}
                  <PostContent postId={postId} />
                  <Container
                    onClick={handleFooterClick}
                    className={cn(
                      'flex-col items-start gap-2 md:flex-row md:justify-between md:gap-4',
                      tagsExpanded ? 'md:items-end' : 'md:items-start',
                    )}
                  >
                    {tagsExpanded ? (
                      <PostTagsPanel
                        postId={postId}
                        widthMode="fit"
                        autoFocusInput
                        enableLoadingSkeleton={false}
                        className="flex-1"
                      />
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
                    )}
                    <PostActionsBar
                      postId={postId}
                      onTagClick={() => setTagsExpanded((prev) => !prev)}
                      onReplyClick={handleReplyClick}
                      onRepostClick={handleRepostClick}
                      className="w-full shrink-0 justify-start sm:w-auto md:justify-end"
                    />
                  </Container>
                </>
              )}
            </CardContent>
          )}
        </Card>
      </Container>
      <DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
    </>
  );
}
