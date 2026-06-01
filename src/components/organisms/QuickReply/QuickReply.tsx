'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import { POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';
import { MentionPopover } from '@/molecules/MentionPopover/MentionPopover';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { usePostMainLayout } from '@/organisms/PostMain/PostMainLayoutContext';
import { WIDE_POST_BODY_TEXT_CLASS } from '@/organisms/PostMain/PostMainTypography';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import { QUICK_REPLY_CONNECTOR_SPACER_HEIGHT } from './QuickReply.constants';
import type { QuickReplyProps } from './QuickReply.types';

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
  const { isAuthenticated, requireAuth } = useRequireAuth();

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

  const openSignInDialog = () => {
    requireAuth(() => undefined);
  };

  const handleExpandWithAuth = () => {
    requireAuth(handleExpand);
  };

  const handleSubmitWithAuth = () => {
    return requireAuth(handleSubmit);
  };

  const setTagsWithAuth: React.Dispatch<React.SetStateAction<string[]>> = (value) => {
    if (!isAuthenticated) {
      openSignInDialog();
      return;
    }
    setTags(value);
  };

  const setAttachmentsWithAuth: React.Dispatch<React.SetStateAction<File[]>> = (value) => {
    if (!isAuthenticated) {
      openSignInDialog();
      return;
    }
    setAttachments(value);
  };

  const handleChangeWithAuth = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isAuthenticated) {
      openSignInDialog();
      return;
    }
    handleChange(event);
  };

  const handleFilesAddedWithAuth = (files: File[]) => {
    if (!isAuthenticated) {
      openSignInDialog();
      return;
    }
    handleFilesAdded(files);
  };

  const handleFileClickWithAuth = () => {
    requireAuth(handleFileClick);
  };

  const handleEmojiSelectWithAuth = (emoji: { native: string }) => {
    if (!isAuthenticated) {
      openSignInDialog();
      return;
    }
    handleEmojiSelect(emoji);
  };

  const handlePasteWithAuth = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!isAuthenticated) {
      event.preventDefault();
      openSignInDialog();
      return;
    }
    handlePaste(event);
  };

  const handleDragEventWithAuth = (event: React.DragEvent, handler: (event: React.DragEvent) => void) => {
    if (!isAuthenticated) {
      event.preventDefault();
      event.stopPropagation();
      openSignInDialog();
      return;
    }
    handler(event);
  };

  const { ref: cardRef, height: cardHeight } = useElementHeight();

  const isValid = () => canSubmitPost(POST_INPUT_VARIANT.REPLY, content, attachments, isSubmitting);

  const characterLimit = { count: getCharacterCount(content), max: POST_MAX_CHARACTER_LENGTH };

  const enterSubmitHandler = useEnterSubmit(isValid, handleSubmitWithAuth, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isAuthenticated) {
      e.preventDefault();
      openSignInDialog();
      return;
    }
    if (handleMentionKeyDown(e)) return;
    enterSubmitHandler(e);
  };

  // Account for spacing between main post and QuickReply in connector calculation
  const connectorHeight = cardHeight ? cardHeight + QUICK_REPLY_CONNECTOR_SPACER_HEIGHT : undefined;

  const isMobile = useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';
  const isWideLayout = !isMobile && inheritedTagsLayout === 'side';

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
          {/* Collapsed header row (avatar + input) */}
          <Container className="flex items-center gap-4" overrideDefaults>
            <AvatarWithFallback
              avatarUrl={avatarUrl}
              name={userDetails?.name || ''}
              fallbackSeed={currentUserPubky || userDetails?.name || 'user'}
              size={isWideLayout ? 'xl' : 'default'}
            />

            <Container overrideDefaults className="relative flex-1">
              <Textarea
                ref={textareaRef}
                aria-label="Reply"
                placeholder={displayPlaceholder}
                variant="inline"
                className={isWideLayout ? WIDE_POST_BODY_TEXT_CLASS : undefined}
                value={content}
                onChange={handleChangeWithAuth}
                onFocus={handleExpandWithAuth}
                onKeyDown={handleKeyDown}
                onPaste={handlePasteWithAuth}
                rows={1}
                disabled={isSubmitting}
                readOnly={!isAuthenticated}
                data-testid="quick-reply-textarea"
                aria-haspopup="listbox"
              />

              {/* Mention autocomplete popover */}
              {mentionIsOpen && (
                <MentionPopover
                  users={mentionUsers}
                  selectedIndex={mentionSelectedIndex}
                  onSelect={handleMentionSelect}
                  onHover={setMentionSelectedIndex}
                />
              )}
            </Container>
          </Container>

          <PostInputAttachments
            ref={fileInputRef}
            attachments={attachments}
            setAttachments={setAttachmentsWithAuth}
            handleFilesAdded={handleFilesAddedWithAuth}
            isSubmitting={isSubmitting}
          />

          {/* Expandable section with animation (same transition as PostInput) */}
          <PostInputExpandableSection
            isExpanded={isExpanded}
            content={content}
            tags={tags}
            isSubmitting={isSubmitting}
            isDisabled={!isAuthenticated}
            setTags={setTagsWithAuth}
            onSubmit={handleSubmitWithAuth}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            onEmojiSelect={handleEmojiSelectWithAuth}
            onImageClick={handleFileClickWithAuth}
            isPostDisabled={isAuthenticated ? !isValid() : false}
            submitMode={POST_INPUT_VARIANT.REPLY}
            className={isExpanded ? 'mt-4' : ''}
            characterLimit={characterLimit}
          />
        </Container>
      </Container>
    </Container>
  );
}
