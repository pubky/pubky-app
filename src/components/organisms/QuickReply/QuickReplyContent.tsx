'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Container } from '@/atoms/Container/Container';
import { getComposerDissolveVariants } from '@/libs/motion/composerMotion';
import { cn } from '@/libs/utils/utils';
import {
  AVATAR_CLASS_BY_HEADER_SIZE,
  AVATAR_SIZE_BY_HEADER_SIZE,
  GAP_CLASS_BY_HEADER_SIZE,
} from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
import { POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT } from '@/organisms/PostMain/PostMainLayoutRules';
import { BODY_TEXT_CLASS_BY_TAGS_LAYOUT } from '@/organisms/PostMain/PostMainTypography';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import type { QuickReplyContentProps } from './QuickReply.types';
import { QuickReplyComposerRow } from './QuickReplyComposerRow';

interface QuickReplyContentComponentProps extends QuickReplyContentProps {
  layout: TagsLayout;
}

/**
 * QuickReply content for every layout: avatar + composer on one row (character count
 * when expanded), attachments, then the expandable section holding tags and the
 * action bar. Body text size varies by layout.
 */
export function QuickReplyContent({
  layout,
  currentUserPubky,
  currentUserDetails,
  fileInputRef,
  attachments,
  setAttachments,
  onFilesAdded,
  isExpanded,
  content,
  tags,
  setTags,
  isSubmitting,
  isAuthenticated,
  onSubmit,
  showEmojiPicker,
  setShowEmojiPicker,
  onEmojiSelect,
  onImageClick,
  isPostDisabled,
  characterLimit,
  ...composerRowProps
}: QuickReplyContentComponentProps) {
  const headerSize = POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT[layout];
  const shouldReduceMotion = useReducedMotion();
  const dissolveVariants = getComposerDissolveVariants(shouldReduceMotion);

  return (
    <div className="relative">
      {currentUserPubky && (
        <div data-testid="quick-reply-stable-avatar" className="absolute top-0 left-0 z-10">
          <PostHeader
            postId={currentUserPubky}
            isReplyInput={true}
            userDetails={currentUserDetails}
            showPopover={false}
            showUserInfo={false}
            size={headerSize}
          />
        </div>
      )}

      <Container overrideDefaults className="relative flex min-w-0 flex-col gap-4">
        <Container overrideDefaults className="relative flex min-w-0 flex-col gap-4">
          <AnimatePresence initial={false} mode="popLayout">
            {isExpanded && currentUserPubky && (
              <motion.div
                key="quick-reply-expanded-header"
                data-testid="quick-reply-expanded-header"
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={dissolveVariants}
              >
                <PostHeader
                  postId={currentUserPubky}
                  isReplyInput={true}
                  userDetails={currentUserDetails}
                  characterLimit={characterLimit}
                  characterLimitPlacement={layout === 'inline' ? 'name-row' : 'metadata'}
                  showPopover={false}
                  visuallyHideAvatar={true}
                  size={headerSize}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <Container
            overrideDefaults
            className={cn('flex w-full min-w-0 items-center', GAP_CLASS_BY_HEADER_SIZE[headerSize])}
          >
            {!isExpanded && currentUserPubky && (
              <div
                data-testid="quick-reply-collapsed-avatar-placeholder"
                className={cn('shrink-0', AVATAR_CLASS_BY_HEADER_SIZE[headerSize])}
                aria-hidden="true"
              />
            )}

            {!currentUserPubky && (
              <AvatarWithFallback
                name=""
                fallbackSeed="user"
                size={AVATAR_SIZE_BY_HEADER_SIZE[headerSize]}
                data-testid="quick-reply-fallback-avatar"
              />
            )}

            <Container overrideDefaults className="relative min-w-0 flex-1">
              <QuickReplyComposerRow
                {...composerRowProps}
                content={content}
                isSubmitting={isSubmitting}
                isAuthenticated={isAuthenticated}
                textareaClassName={BODY_TEXT_CLASS_BY_TAGS_LAYOUT[layout]}
              />
            </Container>
          </Container>
        </Container>

        <PostInputAttachments
          ref={fileInputRef}
          attachments={attachments}
          setAttachments={setAttachments}
          handleFilesAdded={onFilesAdded}
          isSubmitting={isSubmitting}
        />

        <AnimatePresence initial={false} mode="popLayout">
          {isExpanded && (
            <motion.div
              key="quick-reply-expanded-content"
              data-testid="quick-reply-expanded-content"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={dissolveVariants}
            >
              <PostInputExpandableSection
                content={content}
                tags={tags}
                isSubmitting={isSubmitting}
                isDisabled={!isAuthenticated}
                setTags={setTags}
                onSubmit={onSubmit}
                showEmojiPicker={showEmojiPicker}
                setShowEmojiPicker={setShowEmojiPicker}
                onEmojiSelect={onEmojiSelect}
                onImageClick={onImageClick}
                isPostDisabled={isPostDisabled}
                submitMode={POST_INPUT_VARIANT.REPLY}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Container>
    </div>
  );
}
