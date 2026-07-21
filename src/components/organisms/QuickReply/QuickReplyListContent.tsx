'use client';

import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { LIST_POST_BODY_TEXT_CLASS } from '@/organisms/PostMain/PostMainTypography';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import { getButtonLabel } from '../PostInputExpandableSection/PostInputExpandableSection.utils';
import type { QuickReplyContentProps } from './QuickReply.types';
import { QuickReplyComposerRow } from './QuickReplyComposerRow';
import { QuickReplyListActions } from './QuickReplyListActions';

/**
 * List-layout QuickReply content: single composer row with the actions inline
 * on the top right (character count, emoji, image, reply), and the tags input
 * below the post content.
 */
export function QuickReplyListContent({
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
}: QuickReplyContentProps) {
  return (
    <>
      <QuickReplyComposerRow
        {...composerRowProps}
        content={content}
        isSubmitting={isSubmitting}
        isAuthenticated={isAuthenticated}
        avatarSize="md"
        textareaClassName={LIST_POST_BODY_TEXT_CLASS}
        trailing={
          isExpanded ? (
            <QuickReplyListActions
              onEmojiClick={() => setShowEmojiPicker(true)}
              onImageClick={onImageClick}
              onSubmit={onSubmit}
              isPostDisabled={isPostDisabled}
              isSubmitting={isSubmitting}
              characterLimit={characterLimit}
              submitLabel={getButtonLabel(POST_INPUT_VARIANT.REPLY)}
            />
          ) : undefined
        }
      />

      <PostInputAttachments
        ref={fileInputRef}
        attachments={attachments}
        setAttachments={setAttachments}
        handleFilesAdded={onFilesAdded}
        isSubmitting={isSubmitting}
      />

      <PostInputExpandableSection
        isExpanded={isExpanded}
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
        className={isExpanded ? 'mt-4' : ''}
        characterLimit={characterLimit}
        hideActionBar
        inline
      />
    </>
  );
}
