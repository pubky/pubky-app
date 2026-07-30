'use client';

import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { TagsLayout } from '@/organisms/PostMain/PostMain.types';
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

interface QuickReplyContentComponentProps extends QuickReplyContentProps {
  layout: TagsLayout;
}

/**
 * QuickReply content for every layout: PostHeader on top (with character count
 * when expanded), composer textarea, attachments, then the expandable section
 * holding tags and the action bar. Only the body text size varies by layout.
 */
export function QuickReplyContent({
  layout,
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
}: QuickReplyContentComponentProps) {
  return (
    <>
      {currentUserPubky ? (
        <PostHeader
          postId={currentUserPubky}
          isReplyInput={true}
          characterLimit={characterLimit}
          showPopover={false}
          size={layout === 'side' ? 'large' : 'normal'}
        />
      ) : (
        <AvatarWithFallback
          name=""
          fallbackSeed="user"
          size={layout === 'side' ? 'xl' : 'default'}
          data-testid="quick-reply-fallback-avatar"
        />
      )}

      <QuickReplyComposerRow
        {...composerRowProps}
        content={content}
        isSubmitting={isSubmitting}
        isAuthenticated={isAuthenticated}
        textareaClassName={BODY_TEXT_CLASS_BY_LAYOUT[layout]}
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
