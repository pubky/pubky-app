'use client';

import { AnimatePresence, motion, useReducedMotion, type Variants } from 'motion/react';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import {
  AVATAR_SIZE_BY_HEADER_SIZE,
  GAP_CLASS_BY_HEADER_SIZE,
} from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
import { POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT } from '@/organisms/PostMain/PostMainLayoutRules';
import { LIST_POST_BODY_TEXT_CLASS, WIDE_POST_BODY_TEXT_CLASS } from '@/organisms/PostMain/PostMainTypography';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import type { QuickReplyContentProps } from './QuickReply.types';
import { QuickReplyComposerRow } from './QuickReplyComposerRow';

const BODY_TEXT_CLASS_BY_LAYOUT: Record<TagsLayout, string | undefined> = {
  side: WIDE_POST_BODY_TEXT_CLASS,
  list: LIST_POST_BODY_TEXT_CLASS,
  inline: undefined,
};

const QUICK_REPLY_REVEAL_EASE = [0.19, 1, 0.22, 1] as const;
const QUICK_REPLY_SELECTIVE_DISSOLVE_VARIANTS = {
  hidden: {
    opacity: 0,
    filter: 'blur(2px)',
  },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.22,
      delay: 0.04,
      ease: QUICK_REPLY_REVEAL_EASE,
    },
  },
  exit: {
    opacity: 0,
    filter: 'blur(2px)',
    transition: {
      duration: 0.14,
      ease: QUICK_REPLY_REVEAL_EASE,
    },
  },
} satisfies Variants;
const REDUCED_QUICK_REPLY_SELECTIVE_DISSOLVE_VARIANTS = {
  hidden: {
    opacity: 0.6,
    filter: 'blur(0px)',
  },
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.14, ease: QUICK_REPLY_REVEAL_EASE },
  },
  exit: {
    opacity: 0.6,
    filter: 'blur(0px)',
    transition: { duration: 0.1, ease: QUICK_REPLY_REVEAL_EASE },
  },
} satisfies Variants;

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
                variants={
                  shouldReduceMotion
                    ? REDUCED_QUICK_REPLY_SELECTIVE_DISSOLVE_VARIANTS
                    : QUICK_REPLY_SELECTIVE_DISSOLVE_VARIANTS
                }
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
              <div data-testid="quick-reply-collapsed-avatar-placeholder" className="shrink-0">
                <PostHeader
                  postId={currentUserPubky}
                  isReplyInput={true}
                  userDetails={currentUserDetails}
                  showPopover={false}
                  showUserInfo={false}
                  visuallyHideAvatar={true}
                  size={headerSize}
                />
              </div>
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
                textareaClassName={BODY_TEXT_CLASS_BY_LAYOUT[layout]}
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
              variants={
                shouldReduceMotion
                  ? REDUCED_QUICK_REPLY_SELECTIVE_DISSOLVE_VARIANTS
                  : QUICK_REPLY_SELECTIVE_DISSOLVE_VARIANTS
              }
            >
              <PostInputExpandableSection
                isExpanded
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
