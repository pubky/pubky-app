'use client';

import { Edit, MessageCircle, Repeat } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { EmojiPickerDialog } from '@/molecules/EmojiPickerDialog/EmojiPickerDialog';
import { PostLinkEmbeds } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
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
}: PostInputExpandableSectionProps) {
  const hasContent = content.trim().length > 0;
  const isUiDisabled = isSubmitting || isDisabled;
  // Use provided isPostDisabled or default to requiring content
  const isPostDisabled = isPostDisabledProp ?? (!hasContent || isUiDisabled);
  const postButtonLabel = submitLabel ?? getButtonLabel(submitMode, isArticle);
  const postButtonAriaLabel = postButtonLabel;
  const isEdit = submitMode === POST_INPUT_VARIANT.EDIT;

  return (
    <>
      <Container className="gap-4">
        {hasContent && !isArticle && <PostLinkEmbeds content={content} />}

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
          postButtonIcon={submitIcon ?? IconsButton[submitMode]}
        />
      </Container>

      <EmojiPickerDialog
        open={showEmojiPicker && !isUiDisabled}
        onOpenChange={setShowEmojiPicker}
        onEmojiSelect={onEmojiSelect}
      />
    </>
  );
}
