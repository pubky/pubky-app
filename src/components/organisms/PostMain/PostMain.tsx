'use client';

import React, { useState } from 'react';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { POST_TAGS_MAX_COUNT, POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS } from '@/config';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms';

export interface PostMainProps {
  postId: string;
  onClick?: () => void;
  className?: string;
  isReply?: boolean;
  isLastReply?: boolean;
}

export function PostMain({ postId, onClick, className, isReply = false, isLastReply = false }: PostMainProps) {
  const { postDetails } = Hooks.usePostDetails(postId);
  const isDeleted = Libs.isPostDeleted(postDetails?.content);

  const { showRepostHeader, shouldShowPostHeader } = Hooks.usePostHeaderVisibility(postId);

  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [repostDialogOpen, setRepostDialogOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);

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
      <Atoms.Container ref={ttlRef} overrideDefaults onClick={onClick} className="relative flex min-w-0 cursor-pointer">
        {isReply && (
          <Atoms.Container overrideDefaults className="w-3 shrink-0">
            <Atoms.PostThreadConnector height={postHeight} variant={connectorVariant} />
          </Atoms.Container>
        )}
        <Atoms.Card ref={cardRef} className={Libs.cn('min-w-0 flex-1 gap-0 rounded-md py-0', className)}>
          {isDeleted ? (
            <Molecules.PostDeleted />
          ) : (
            <>
              {showRepostHeader && <Molecules.RepostHeader />}
              <Atoms.CardContent className="flex min-w-0 flex-col gap-4 p-6">
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
                    <Organisms.PostTagsPanel postId={postId} className="flex-1" />
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
                    className="shrink-0 justify-start md:justify-end"
                  />
                </Atoms.Container>
              </Atoms.CardContent>
            </>
          )}
        </Atoms.Card>
      </Atoms.Container>
      <Organisms.DialogReply postId={postId} open={replyDialogOpen} onOpenChangeAction={setReplyDialogOpen} />
      <Organisms.DialogRepost postId={postId} open={repostDialogOpen} onOpenChangeAction={setRepostDialogOpen} />
    </>
  );
}
