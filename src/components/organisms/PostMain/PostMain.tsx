'use client';

import React, { useRef, useState } from 'react';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import type { PostTagsPanelHandle } from '@/organisms';
import { POST_TAGS_MAX_COUNT, POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms';

import type { PostMainProps } from './PostMain.types';
import { usePostMainLayout, WIDE_POST_LAYOUT_CLASSES } from './PostMainLayout';

export function PostMain({ postId, onClick, className, isReply = false, isLastReply = false }: PostMainProps) {
  const isMobile = Hooks.useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';
  const effectiveTagsLayout = inheritedTagsLayout === 'side' && isMobile ? 'inline' : inheritedTagsLayout;
  const isWideLayout = effectiveTagsLayout === 'side';
  const { postDetails } = Hooks.usePostDetails(postId);
  const isDeleted = Libs.isPostDeleted(postDetails?.content);

  const { showRepostHeader, shouldShowPostHeader } = Hooks.usePostHeaderVisibility(postId);

  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const mobileTagsPanelRef = useRef<PostTagsPanelHandle>(null);
  const desktopTagsPanelRef = useRef<PostTagsPanelHandle>(null);

  // Get post height for thread connector
  const { ref: cardRef, height: postHeight } = Hooks.useElementHeight();

  // Subscribe to TTL coordinator based on viewport visibility
  const { ref: ttlRef } = Hooks.useTtlSubscription({
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
      <Atoms.Container
        ref={ttlRef}
        overrideDefaults
        onClick={onClick}
        className={Libs.cn('relative flex min-w-0 cursor-pointer', isReply && 'pl-3')}
      >
        {isReply && (
          <Atoms.Container overrideDefaults className="absolute top-0 bottom-0 left-0 w-3">
            <Atoms.PostThreadConnector height={postHeight} variant={connectorVariant} />
          </Atoms.Container>
        )}
        <Atoms.Card ref={cardRef} className={Libs.cn('min-w-0 flex-1 gap-0 rounded-md py-0', className)}>
          {isDeleted ? (
            <Molecules.PostDeleted />
          ) : (
            <Atoms.CardContent className={Libs.cn('flex min-w-0 flex-col', isWideLayout ? 'p-0' : 'gap-4 p-6')}>
              {showRepostHeader && (
                <Atoms.Container overrideDefaults className={Libs.cn(isWideLayout && 'px-12 pt-12 pb-6')}>
                  <Molecules.RepostHeader />
                </Atoms.Container>
              )}
              {isWideLayout ? (
                <Atoms.Container className={WIDE_POST_LAYOUT_CLASSES.shell}>
                  <Atoms.Container className={WIDE_POST_LAYOUT_CLASSES.leftColumn}>
                    {shouldShowPostHeader && (
                      <Organisms.PostHeader postId={postId} size="large" timeAgoPlacement="bottom-left" />
                    )}
                    <Organisms.PostContent postId={postId} textClassName={WIDE_POST_LAYOUT_CLASSES.bodyText} />
                    <Atoms.Container overrideDefaults onClick={handleFooterClick} className="flex flex-col gap-4">
                      <Organisms.PostTagsPanel
                        ref={mobileTagsPanelRef}
                        postId={postId}
                        widthMode="full"
                        className="lg:hidden"
                      />
                      <Organisms.PostActionsBar
                        postId={postId}
                        onTagClick={() => {
                          mobileTagsPanelRef.current?.focus();
                          desktopTagsPanelRef.current?.focus();
                        }}
                        onReplyClick={handleReplyClick}
                        onRepostClick={handleRepostClick}
                      />
                    </Atoms.Container>
                  </Atoms.Container>
                  <Atoms.Container
                    overrideDefaults
                    onClick={handleFooterClick}
                    className={WIDE_POST_LAYOUT_CLASSES.rightColumn}
                  >
                    <Organisms.PostTagsPanel
                      ref={desktopTagsPanelRef}
                      postId={postId}
                      widthMode="full"
                      className="w-full"
                    />
                  </Atoms.Container>
                </Atoms.Container>
              ) : (
                <>
                  {shouldShowPostHeader && <Organisms.PostHeader postId={postId} />}
                  <Organisms.PostContent postId={postId} />
                  <Atoms.Container
                    onClick={handleFooterClick}
                    className={Libs.cn(
                      'flex-col items-start gap-2 md:flex-row md:justify-between md:gap-4',
                      tagsExpanded ? 'md:items-end' : 'md:items-start',
                    )}
                  >
                    {tagsExpanded ? (
                      <Organisms.PostTagsPanel
                        postId={postId}
                        widthMode="fit"
                        autoFocusInput
                        enableLoadingSkeleton={false}
                        className="flex-1"
                      />
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
                      onTagClick={() => setTagsExpanded((prev) => !prev)}
                      onReplyClick={handleReplyClick}
                      onRepostClick={handleRepostClick}
                      className="w-full shrink-0 justify-start sm:w-auto md:justify-end"
                    />
                  </Atoms.Container>
                </>
              )}
            </Atoms.CardContent>
          )}
        </Atoms.Card>
      </Atoms.Container>
      <Organisms.DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <Organisms.DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
    </>
  );
}
