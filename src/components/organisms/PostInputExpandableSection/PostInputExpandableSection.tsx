'use client';

import { Edit, MessageCircle, Repeat } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Container } from '@/atoms/Container/Container';
import { EmojiPickerDialog } from '@/molecules/EmojiPickerDialog/EmojiPickerDialog';
import { PostLinkEmbeds } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { POST_INPUT_VARIANT } from '../PostInput/PostInput.constants';
import { PostInputActionBar } from '../PostInputActionBar/PostInputActionBar';
import { PostInputTags } from '../PostInputTags/PostInputTags';
import type { PostInputExpandableSectionProps } from './PostInputExpandableSection.types';
import { getButtonLabel } from './PostInputExpandableSection.utils';

const IconsButton = {
  [POST_INPUT_VARIANT.EDIT]: Edit,
  [POST_INPUT_VARIANT.REPOST]: Repeat,
  [POST_INPUT_VARIANT.POST]: undefined,
  [POST_INPUT_VARIANT.REPLY]: MessageCircle,
} as const;
export function PostInputExpandableSection({
  isExpanded,
  content,
  tags,
  isSubmitting,
  isArticle,
  isDisabled = false,
  isPostDisabled: isPostDisabledProp,
  submitMode,
  submitLabel,
  submitIcon,
  setTags,
  onSubmit,
  showEmojiPicker,
  setShowEmojiPicker,
  onEmojiSelect,
  onImageClick,
  onArticleClick,
  className,
  parentGapPx = 0,
  characterLimit,
}: PostInputExpandableSectionProps) {
  const hasContent = content.trim().length > 0;
  const isUiDisabled = isSubmitting || isDisabled;
  // Use provided isPostDisabled or default to requiring content
  const isPostDisabled = isPostDisabledProp ?? (!hasContent || isUiDisabled);
  const postButtonLabel = submitLabel ?? getButtonLabel(submitMode, isArticle);
  const postButtonAriaLabel = postButtonLabel;
  const isEdit = submitMode === POST_INPUT_VARIANT.EDIT;
  const hasParentGapCompensation = parentGapPx > 0;
  const compensatedMarginTop = -parentGapPx;
  return (
    <>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{
              height: 0,
              opacity: 0,
            }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                height: {
                  duration: 0.2,
                  ease: 'linear',
                },
                opacity: {
                  duration: 0.4,
                  ease: 'linear',
                },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              ...(hasParentGapCompensation
                ? {
                    marginTop: compensatedMarginTop,
                  }
                : {}),
              // Fade out quickly so less content is repainted while height collapses.
              transition: {
                opacity: {
                  duration: 0.3,
                  ease: 'linear',
                },
                height: {
                  duration: 0.2,
                  ease: 'linear',
                },
                ...(hasParentGapCompensation
                  ? {
                      marginTop: {
                        duration: 0.2,
                        ease: 'linear',
                      },
                    }
                  : {}),
              },
            }}
            className={`overflow-hidden ${className || ''}`}
          >
            <Container className="gap-6">
              {hasContent && !isArticle && <PostLinkEmbeds content={content} />}

              {tags.length > 0 && (
                <Container className="flex flex-wrap items-center gap-2" overrideDefaults>
                  {tags.map((tag, index) => (
                    <PostTag
                      key={`${tag}-${index}`}
                      label={tag}
                      showClose={!isUiDisabled}
                      onClose={() => {
                        setTags((prevTags) => prevTags.filter((_, i) => i !== index));
                      }}
                    />
                  ))}
                </Container>
              )}
              <Container className="justify-between gap-4 md:flex-row md:gap-0">
                <PostInputTags tags={tags} onTagsChange={setTags} disabled={isUiDisabled || isEdit} />

                <PostInputActionBar
                  onPostClick={onSubmit}
                  onEmojiClick={() => setShowEmojiPicker(true)}
                  onImageClick={onImageClick}
                  onArticleClick={onArticleClick}
                  isPostDisabled={isPostDisabled}
                  isSubmitting={isSubmitting}
                  postButtonLabel={postButtonLabel}
                  postButtonAriaLabel={postButtonAriaLabel}
                  hideArticleButton={submitMode !== POST_INPUT_VARIANT.POST || !!isArticle}
                  isArticle={isArticle}
                  isEdit={isEdit}
                  postButtonIcon={submitIcon ?? IconsButton[submitMode]}
                  characterLimit={characterLimit}
                />
              </Container>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>

      <EmojiPickerDialog
        open={showEmojiPicker && !isUiDisabled}
        onOpenChange={setShowEmojiPicker}
        onEmojiSelect={onEmojiSelect}
      />
    </>
  );
}
