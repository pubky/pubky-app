'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Typography } from '@/atoms/Typography/Typography';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { usePostInputAuthHandlers } from '@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { QUICK_REPLY_CONNECTOR_SPACER_HEIGHT } from './QuickReply.constants';
import type { QuickReplyContentProps, QuickReplyProps } from './QuickReply.types';
import { QuickReplyDefaultContent } from './QuickReplyDefaultContent';
import { QuickReplyListContent } from './QuickReplyListContent';

export function QuickReply({
  parentPostId,
  connectorVariant = POST_THREAD_CONNECTOR_VARIANTS.LAST,
  onReplySubmitted,
}: QuickReplyProps) {
  const t = useTranslations();
  const rawPrompts = t.raw('quickReply.prompts');
  const prompts = Array.isArray(rawPrompts) ? rawPrompts : ['What are your thoughts on this?'];
  const [promptIndex] = React.useState(() => Math.floor(Math.random() * prompts.length));
  const prompt = prompts[promptIndex] || prompts[0];

  const { userDetails, currentUserPubky } = useCurrentUserProfile();
  const avatarUrl = useAvatarUrl(userDetails);

  const {
    textareaRef,
    containerRef,
    fileInputRef,
    content,
    tags,
    attachments,
    setAttachments,
    isDragging,
    isExpanded,
    isSubmitting,
    showEmojiPicker,
    setShowEmojiPicker,
    displayPlaceholder,
    handleExpand,
    handleSubmit,
    handleChange,
    handleEmojiSelect,
    handleFilesAdded,
    handleFileClick,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
    setTags,
    // Mention autocomplete
    mentionUsers,
    mentionIsOpen,
    mentionSelectedIndex,
    setMentionSelectedIndex,
    handleMentionSelect,
    handleMentionKeyDown,
  } = usePostInput({
    variant: POST_INPUT_VARIANT.REPLY,
    postId: parentPostId,
    placeholder: prompt,
    expanded: false,
    onSuccess: onReplySubmitted,
  });

  const {
    isAuthenticated,
    handleExpandWithAuth,
    handleSubmitWithAuth,
    setTagsWithAuth,
    setAttachmentsWithAuth,
    handleChangeWithAuth,
    handleFilesAddedWithAuth,
    handleFileClickWithAuth,
    handleEmojiSelectWithAuth,
    handlePasteWithAuth,
    handleDragEventWithAuth,
    createKeyDownHandler,
  } = usePostInputAuthHandlers({
    handleExpand,
    handleSubmit,
    setTags,
    setAttachments,
    handleChange,
    handleFilesAdded,
    handleFileClick,
    handleEmojiSelect,
    handlePaste,
  });

  const { ref: cardRef, height: cardHeight } = useElementHeight();

  const isValid = () => canSubmitPost(POST_INPUT_VARIANT.REPLY, content, attachments, isSubmitting);

  const characterLimit = { count: getCharacterCount(content), max: POST_MAX_CHARACTER_LENGTH };

  const enterSubmitHandler = useEnterSubmit(isValid, handleSubmitWithAuth, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

  // Account for spacing between main post and QuickReply in connector calculation
  const connectorHeight = cardHeight ? cardHeight + QUICK_REPLY_CONNECTOR_SPACER_HEIGHT : undefined;

  const effectiveTagsLayout = useEffectiveTagsLayout();
  const isWideLayout = effectiveTagsLayout === 'side';
  const isListLayout = effectiveTagsLayout === 'list';

  const contentProps: QuickReplyContentProps = {
    avatarUrl,
    userName: userDetails?.name || '',
    avatarFallbackSeed: currentUserPubky || userDetails?.name || 'user',
    textareaRef,
    content,
    displayPlaceholder,
    isSubmitting,
    isAuthenticated,
    onChange: handleChangeWithAuth,
    onFocus: handleExpandWithAuth,
    onKeyDown: handleKeyDown,
    onPaste: handlePasteWithAuth,
    mentionIsOpen,
    mentionUsers,
    mentionSelectedIndex,
    onMentionSelect: handleMentionSelect,
    onMentionHover: setMentionSelectedIndex,
    fileInputRef,
    attachments,
    setAttachments: setAttachmentsWithAuth,
    onFilesAdded: handleFilesAddedWithAuth,
    isExpanded,
    tags,
    setTags: setTagsWithAuth,
    onSubmit: handleSubmitWithAuth,
    showEmojiPicker,
    setShowEmojiPicker,
    onEmojiSelect: handleEmojiSelectWithAuth,
    onImageClick: handleFileClickWithAuth,
    isPostDisabled: isAuthenticated ? !isValid() : false,
    characterLimit,
  };

  return (
    <Container overrideDefaults className="relative flex" data-testid="quick-reply" aria-busy={isSubmitting}>
      <Container overrideDefaults className="-mt-4 w-3 shrink-0">
        <PostThreadConnector height={connectorHeight} variant={connectorVariant} data-testid="quick-reply-connector" />
      </Container>

      <Container
        ref={containerRef}
        className={cn(
          'relative w-full cursor-pointer rounded-md border border-dashed transition-colors duration-200',
          isWideLayout ? 'p-12' : 'p-4',
          isDragging ? 'border-brand' : 'border-input',
        )}
        onClick={handleExpandWithAuth}
        onDragEnter={(event) => handleDragEventWithAuth(event, handleDragEnter)}
        onDragLeave={(event) => handleDragEventWithAuth(event, handleDragLeave)}
        onDragOver={(event) => handleDragEventWithAuth(event, handleDragOver)}
        onDrop={(event) => handleDragEventWithAuth(event, handleDrop)}
        overrideDefaults
      >
        {/* Drag overlay */}
        {isDragging && (
          <Container
            className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-brand/10"
            overrideDefaults
          >
            <Typography className="text-brand">Drop files here</Typography>
          </Container>
        )}

        <Container ref={cardRef} className="gap-2" overrideDefaults>
          {isListLayout ? (
            <QuickReplyListContent {...contentProps} />
          ) : (
            <QuickReplyDefaultContent {...contentProps} isWideLayout={isWideLayout} />
          )}
        </Container>
      </Container>
    </Container>
  );
}
