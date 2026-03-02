'use client';

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
  [POST_INPUT_VARIANT.REPLY]: undefined,
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
}: PostInputExpandableSectionProps) {
  const hasContent = content.trim().length > 0;
  const isUiDisabled = isSubmitting || isDisabled;
  // Use provided isPostDisabled or default to requiring content
  const isPostDisabled = isPostDisabledProp ?? (!hasContent || isUiDisabled);

  const postButtonLabel = getButtonLabel(submitMode, isArticle);
  const postButtonAriaLabel = postButtonLabel;

  const isEdit = submitMode === POST_INPUT_VARIANT.EDIT;

  return (
    <>
      <Atoms.Container
        className={`grid transition-all duration-300 ease-in-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        } ${className || ''}`}
        overrideDefaults
      >
        <Atoms.Container className="overflow-hidden" overrideDefaults>
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
              />
            </Atoms.Container>
          </Atoms.Container>
        </Atoms.Container>
      </Atoms.Container>

      <Molecules.EmojiPickerDialog
        open={showEmojiPicker && !isUiDisabled}
        onOpenChange={setShowEmojiPicker}
        onEmojiSelect={onEmojiSelect}
      />
    </>
  );
}
