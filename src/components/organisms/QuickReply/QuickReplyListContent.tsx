'use client';

import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { LIST_POST_BODY_TEXT_CLASS } from '@/organisms/PostMain/PostMainTypography';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import type { QuickReplyContentProps } from './QuickReply.types';
import { QuickReplyComposerRow } from './QuickReplyComposerRow';

/**
 * List-layout QuickReply content: PostHeader on top (with character count when
 * expanded), composer textarea, then tags above the action bar (actions + submit
 * on the same row).
 */
export function QuickReplyListContent({
  currentUserPubky,
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
      {currentUserPubky && (
        <PostHeader
          postId={currentUserPubky}
          isReplyInput={true}
          characterLimit={characterLimit}
          showPopover={false}
          size="normal"
        />
      )}

      <QuickReplyComposerRow
        {...composerRowProps}
        content={content}
        isSubmitting={isSubmitting}
        isAuthenticated={isAuthenticated}
        textareaClassName={LIST_POST_BODY_TEXT_CLASS}
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
      />
    </>
  );
}
