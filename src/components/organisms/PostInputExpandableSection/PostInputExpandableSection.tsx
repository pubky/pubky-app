'use client';

import { AnimatePresence, motion } from 'motion/react';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Icons from '@/libs/icons';
import { PostInputActionBar } from '../PostInputActionBar';
import { PostInputTags } from '../PostInputTags';
import { getButtonLabel } from './PostInputExpandableSection.utils';
import type { PostInputExpandableSectionProps } from './PostInputExpandableSection.types';
import { POST_INPUT_VARIANT } from '../PostInput/PostInput.constants';

const IconsButton = {
  [POST_INPUT_VARIANT.EDIT]: Icons.Edit,
  [POST_INPUT_VARIANT.REPOST]: Icons.Repeat,
  [POST_INPUT_VARIANT.POST]: undefined,
  [POST_INPUT_VARIANT.REPLY]: Icons.MessageCircle,
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

  const postButtonLabel = getButtonLabel(submitMode, isArticle);
  const postButtonAriaLabel = postButtonLabel;

  const isEdit = submitMode === POST_INPUT_VARIANT.EDIT;
  const hasParentGapCompensation = parentGapPx > 0;
  const compensatedMarginTop = -parentGapPx;

  return (
    <>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                height: { duration: 0.2, ease: 'linear' },
                opacity: { duration: 0.4, ease: 'linear' },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              ...(hasParentGapCompensation ? { marginTop: compensatedMarginTop } : {}),
              // Fade out quickly so less content is repainted while height collapses.
              transition: {
                opacity: { duration: 0.3, ease: 'linear' },
                height: { duration: 0.2, ease: 'linear' },
                ...(hasParentGapCompensation ? { marginTop: { duration: 0.2, ease: 'linear' } } : {}),
              },
            }}
            className={`overflow-hidden ${className || ''}`}
          >
            <Atoms.Container className="gap-6">
              {hasContent && !isArticle && <Molecules.PostLinkEmbeds content={content} />}

              {tags.length > 0 && (
                <Atoms.Container className="flex flex-wrap items-center gap-2" overrideDefaults>
                  {tags.map((tag, index) => (
                    <Molecules.PostTag
                      key={`${tag}-${index}`}
                      label={tag}
                      showClose={!isUiDisabled}
                      onClose={() => {
                        setTags((prevTags) => prevTags.filter((_, i) => i !== index));
                      }}
                    />
                  ))}
                </Atoms.Container>
              )}
              <Atoms.Container className="justify-between gap-4 md:flex-row md:gap-0">
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
                  postButtonIcon={IconsButton[submitMode]}
                  characterLimit={characterLimit}
                />
              </Atoms.Container>
            </Atoms.Container>
          </motion.div>
        )}
      </AnimatePresence>

      <Molecules.EmojiPickerDialog
        open={showEmojiPicker && !isUiDisabled}
        onOpenChange={setShowEmojiPicker}
        onEmojiSelect={onEmojiSelect}
      />
    </>
  );
}
