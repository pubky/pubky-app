'use client';

import React, { useRef } from 'react';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { usePostReplyRepostDialogs } from '@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
import { PostMissing } from '@/molecules/PostMissing/PostMissing';
import { RepostHeader } from '@/molecules/RepostHeader/RepostHeader';
import { PostActionsBar } from '../PostActionsBar/PostActionsBar';
import { PostContent } from '../PostContent/PostContent';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInlineTagsActions } from '../PostInlineTagsActions/PostInlineTagsActions';
import { PostTagsPanel } from '../PostTagsPanel/PostTagsPanel';
import type { PostTagsPanelHandle } from '../PostTagsPanel/PostTagsPanel.types';
import type { PostMainProps } from './PostMain.types';
import { usePostMainLayout } from './PostMainLayoutContext';
import { WIDE_POST_BODY_TEXT_CLASS } from './PostMainTypography';

// Stops click and middle-click from bubbling to the outer post-card navigation
// (so action buttons and tag panels don't trigger a navigate / new-tab open).
const stopCardPropagation = (event: React.MouseEvent) => event.stopPropagation();

export function PostMain({
  postId,
  className,
  isReply = false,
  isLastReply = false,
  pinActionsToBottom = false,
  isNavigable = true,
}: PostMainProps) {
  const isMobile = useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';
  const effectiveTagsLayout = inheritedTagsLayout === 'side' && isMobile ? 'inline' : inheritedTagsLayout;
  const isWideLayout = effectiveTagsLayout === 'side';
  const { postDetails, isLoading } = usePostDetails(postId);
  const isDeleted = isPostDeleted(postDetails?.content);
  // A settled `null` (cache miss after the fetch resolved) means the post 404'd.
  // Without this branch the card below would skeleton forever (PostHeader /
  // PostContent each wait on `postDetails`). `undefined` is still loading.
  const isMissing = postDetails === null && !isLoading;

  const { handlePostClick, handlePostAuxClick } = usePostNavigation();

  const { showRepostHeader, shouldShowPostHeader } = usePostHeaderVisibility(postId);
  const { openReplyDialog, openRepostDialog, dialogs } = usePostReplyRepostDialogs(postId);

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

  return (
    <>
      <Container
        ref={ttlRef}
        overrideDefaults
        onClick={isNavigable ? (e) => handlePostClick(postId, e) : undefined}
        onAuxClick={isNavigable ? (e) => handlePostAuxClick(postId, e) : undefined}
        className={cn('relative flex min-w-0 @max-xl/grid:h-full', isNavigable && 'cursor-pointer', isReply && 'pl-3')}
      >
        {isReply && (
          <Container overrideDefaults className="absolute top-0 bottom-0 left-0 w-3">
            <PostThreadConnector height={postHeight} variant={connectorVariant} />
          </Container>
        )}
        <Card ref={cardRef} className={cn('min-w-0 flex-1 gap-0 rounded-md py-0', className)}>
          {isMissing ? (
            <PostMissing />
          ) : isDeleted ? (
            <PostDeleted />
          ) : (
            <>
              {showRepostHeader && <RepostHeader />}
              <CardContent
                className={cn('flex min-w-0 flex-col @max-xl/grid:flex-1', isWideLayout ? 'p-0' : 'gap-4 p-6')}
              >
                {isWideLayout ? (
                  <Container className="flex min-w-0 flex-col lg:flex-row">
                    <Container className="flex min-w-0 flex-col gap-4 p-12 lg:flex-1">
                      {shouldShowPostHeader && (
                        <PostHeader postId={postId} size="large" timeAgoPlacement="bottom-left" />
                      )}
                      <PostContent postId={postId} textClassName={WIDE_POST_BODY_TEXT_CLASS} />
                      {pinActionsToBottom && <Container overrideDefaults className="flex-1" />}
                      <Container
                        overrideDefaults
                        onClick={stopCardPropagation}
                        onAuxClick={stopCardPropagation}
                        className="flex flex-col gap-4"
                      >
                        <PostTagsPanel
                          ref={mobileTagsPanelRef}
                          postId={postId}
                          widthMode="full"
                          className="lg:hidden"
                        />
                        <PostActionsBar
                          postId={postId}
                          onTagClick={() => {
                            mobileTagsPanelRef.current?.focus();
                            desktopTagsPanelRef.current?.focus();
                          }}
                          onReplyClick={openReplyDialog}
                          onRepostClick={openRepostDialog}
                        />
                      </Container>
                    </Container>
                    <Container
                      overrideDefaults
                      onClick={stopCardPropagation}
                      onAuxClick={stopCardPropagation}
                      className="hidden lg:flex lg:w-96 lg:shrink-0 lg:p-12"
                    >
                      <PostTagsPanel ref={desktopTagsPanelRef} postId={postId} widthMode="full" className="w-full" />
                    </Container>
                  </Container>
                ) : (
                  <>
                    {shouldShowPostHeader && <PostHeader postId={postId} />}
                    <PostContent postId={postId} />
                    <PostInlineTagsActions
                      postId={postId}
                      onReplyClick={openReplyDialog}
                      onRepostClick={openRepostDialog}
                      actionsClassName="w-full shrink-0 justify-start sm:w-auto md:justify-end @max-xl/grid:w-full! @max-xl/grid:justify-start!"
                    />
                  </>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </Container>
      {dialogs}
    </>
  );
}
