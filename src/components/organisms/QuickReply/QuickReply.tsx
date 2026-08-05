'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Typography } from '@/atoms/Typography/Typography';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useComposerHeightAnimation } from '@/hooks/useComposerHeightAnimation/useComposerHeightAnimation';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { usePostInputAuthHandlers } from '@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { QUICK_REPLY_CONNECTOR_SPACER_HEIGHT } from './QuickReply.constants';
import type { QuickReplyContentProps, QuickReplyProps } from './QuickReply.types';
import { QuickReplyContent } from './QuickReplyContent';

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
    currentUserPubky,
    currentUserDetails,
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
  const shouldReduceMotion = useReducedMotion();
  const { animatedHeight, heightTransition, heightTransitionStyle, onHeightAnimationComplete } =
    useComposerHeightAnimation({
      isExpanded,
      measuredHeight: cardHeight,
      shouldReduceMotion,
    });

  const isValid = () => canSubmitPost(POST_INPUT_VARIANT.REPLY, content, attachments, isSubmitting);

  const enterSubmitHandler = useEnterSubmit(isValid, handleSubmitWithAuth, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

  // Account for spacing between main post and QuickReply in connector calculation
  const connectorHeight = cardHeight ? cardHeight + QUICK_REPLY_CONNECTOR_SPACER_HEIGHT : undefined;

  const effectiveTagsLayout = useEffectiveTagsLayout();
  const characterLimit = isExpanded ? { count: getCharacterCount(content), max: POST_MAX_CHARACTER_LENGTH } : undefined;

  const contentProps: QuickReplyContentProps = {
    currentUserPubky,
    currentUserDetails,
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
        <PostThreadConnector
          height={connectorHeight}
          variant={connectorVariant}
          style={heightTransitionStyle}
          data-testid="quick-reply-connector"
        />
      </Container>

      <Container
        ref={containerRef}
        data-state={isExpanded ? 'expanded' : 'collapsed'}
        className={cn(
          'relative w-full cursor-pointer rounded-md border border-dashed transition-colors duration-200',
          '[&_textarea::placeholder]:transition-opacity [&_textarea::placeholder]:duration-150',
          'focus-within:[&_textarea::placeholder]:opacity-0',
          'motion-reduce:[&_textarea::placeholder]:transition-none',
          'p-6',
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

        <motion.div
          data-testid="quick-reply-state-height"
          className="overflow-hidden"
          initial={false}
          animate={{ height: animatedHeight }}
          transition={{ height: heightTransition }}
          onAnimationComplete={onHeightAnimationComplete}
        >
          <Container
            ref={cardRef}
            data-testid="quick-reply-state-content"
            className="relative flex min-w-0 flex-col gap-4"
            overrideDefaults
          >
            <QuickReplyContent {...contentProps} layout={effectiveTagsLayout} />
          </Container>
        </motion.div>
      </Container>
    </Container>
  );
}
