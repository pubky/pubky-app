'use client';

import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { WIDE_POST_BODY_TEXT_CLASS } from '@/organisms/PostMain/PostMainTypography';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import type { QuickReplyContentProps } from './QuickReply.types';
import { QuickReplyComposerRow } from './QuickReplyComposerRow';

interface QuickReplyDefaultContentProps extends QuickReplyContentProps {
  isWideLayout: boolean;
}

/**
 * Default (inline/wide) QuickReply content: composer row on top,
 * tags input and action bar inside the expandable section below.
 */
export function QuickReplyDefaultContent({
  isWideLayout,
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
}: QuickReplyDefaultContentProps) {
  return (
    <>
      <QuickReplyComposerRow
        {...composerRowProps}
        content={content}
        isSubmitting={isSubmitting}
        isAuthenticated={isAuthenticated}
        avatarSize={isWideLayout ? 'xl' : 'default'}
        textareaClassName={isWideLayout ? WIDE_POST_BODY_TEXT_CLASS : undefined}
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
      />
    </>
  );
}
