'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Typography } from '@/atoms/Typography/Typography';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { usePostInputAuthHandlers } from '@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { QuickReplyContentProps, QuickReplyProps } from './QuickReply.types';
import { QuickReplyCollapsedContent } from './QuickReplyCollapsedContent';
import { QuickReplyContent } from './QuickReplyContent';

const CONNECTOR_BORDER_OVERLAP = 2;

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

  const enterSubmitHandler = useEnterSubmit(isValid, handleSubmitWithAuth, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

  // Figma overlays the connector from 1px above to 1px below the card. Keep it
  // out of normal flow so its geometry cannot add space after QuickReply.
  const connectorHeight = cardHeight ? cardHeight + CONNECTOR_BORDER_OVERLAP : undefined;

  const effectiveTagsLayout = useEffectiveTagsLayout();
  const isWideLayout = effectiveTagsLayout === 'side';
  const characterLimit = isExpanded ? { count: getCharacterCount(content), max: POST_MAX_CHARACTER_LENGTH } : undefined;
  const focusTextareaOnExpandRef = React.useRef(false);

  const handleCollapsedExpand = () => {
    if (isAuthenticated) {
      focusTextareaOnExpandRef.current = true;
    }
    handleExpandWithAuth();
  };

  React.useEffect(() => {
    if (!isExpanded || !focusTextareaOnExpandRef.current) return;

    focusTextareaOnExpandRef.current = false;
    textareaRef.current?.focus();
  }, [isExpanded, textareaRef]);

  const contentProps: QuickReplyContentProps = {
    currentUserPubky,
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
      <Container overrideDefaults className="relative w-3 shrink-0" data-testid="quick-reply-connector-column">
        <Container overrideDefaults className="absolute -inset-y-px left-0">
          <PostThreadConnector
            height={connectorHeight}
            variant={connectorVariant}
            data-testid="quick-reply-connector"
          />
        </Container>
      </Container>

      <Container
        ref={containerRef}
        overrideDefaults
        className="relative w-full"
        onDragEnter={(event) => handleDragEventWithAuth(event, handleDragEnter)}
        onDragLeave={(event) => handleDragEventWithAuth(event, handleDragLeave)}
        onDragOver={(event) => handleDragEventWithAuth(event, handleDragOver)}
        onDrop={(event) => handleDragEventWithAuth(event, handleDrop)}
      >
        <Container ref={cardRef} overrideDefaults className="w-full">
          {isExpanded ? (
            <Container
              className={cn(
                'relative w-full cursor-pointer rounded-md border border-dashed transition-colors duration-200',
                isWideLayout ? 'p-12' : 'p-4',
                isDragging ? 'border-brand' : 'border-input',
              )}
              onClick={handleExpandWithAuth}
              overrideDefaults
              data-testid="quick-reply-expanded"
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

              <Container
                className={cn('flex gap-4', isAuthenticated ? 'flex-col' : 'flex-row items-center')}
                overrideDefaults
              >
                <QuickReplyContent {...contentProps} layout={effectiveTagsLayout} />
              </Container>
            </Container>
          ) : (
            <Button
              overrideDefaults
              type="button"
              className={cn(
                'flex w-full cursor-pointer items-center rounded-md border border-dashed border-input p-6 text-left',
                'transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                isWideLayout ? 'gap-5' : 'gap-3',
              )}
              onClick={handleCollapsedExpand}
              aria-expanded={false}
              data-testid="quick-reply-trigger"
            >
              <QuickReplyCollapsedContent
                currentUserPubky={currentUserPubky}
                displayPlaceholder={displayPlaceholder}
                isWideLayout={isWideLayout}
              />
            </Button>
          )}
        </Container>
      </Container>
    </Container>
  );
}
