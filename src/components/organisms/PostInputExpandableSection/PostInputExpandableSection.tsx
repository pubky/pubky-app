'use client';

import { Edit, MessageCircle, Newspaper, Repeat } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { EmojiPickerDialog } from '@/molecules/EmojiPickerDialog/EmojiPickerDialog';
import { PostLinkEmbeds } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
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
  lockSwitch,
  lockCard,
  leadingContent,
  fullscreen,
}: PostInputExpandableSectionProps) {
  const hasContent = content.trim().length > 0;
  const isUiDisabled = isSubmitting || isDisabled;
  // Use provided isPostDisabled or default to requiring content
  const isPostDisabled = isPostDisabledProp ?? (!hasContent || isUiDisabled);
  // Articles always submit with the newspaper icon, in create and in edit.
  const defaultSubmitIcon = isArticle ? Newspaper : IconsButton[submitMode];
  const postButtonLabel = submitLabel ?? getButtonLabel(submitMode, isArticle);
  const postButtonAriaLabel = postButtonLabel;
  const isEdit = submitMode === POST_INPUT_VARIANT.EDIT;

  return (
    <>
      <Container className="gap-4">
        {/* A link preview must not navigate away from the post being written. */}
        {hasContent && !isArticle && (
          <PostPreviewNavigableProvider navigable={false}>
            <PostLinkEmbeds content={content} isComposing />
          </PostPreviewNavigableProvider>
        )}

        {/* Stands in for the content the lock switch stashed away. */}
        {lockCard}

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
          hideArticleButton={submitMode !== POST_INPUT_VARIANT.POST || !!isArticle || !!lockCard}
          isArticle={isArticle}
          postButtonIcon={submitIcon ?? defaultSubmitIcon}
          lockSwitch={lockSwitch}
          leadingContent={leadingContent}
          fullscreen={fullscreen}
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
