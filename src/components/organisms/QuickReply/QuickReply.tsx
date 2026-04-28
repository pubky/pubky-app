'use client';

import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { POST_MAX_CHARACTER_LENGTH } from '@/config';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms';
import { PostInputExpandableSection } from '@/organisms/PostInputExpandableSection';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { usePostMainLayout, WIDE_POST_LAYOUT_CLASSES } from '@/organisms/PostMain/PostMainLayout';
import { QUICK_REPLY_CONNECTOR_SPACER_HEIGHT } from './QuickReply.constants';
import type { QuickReplyProps } from './QuickReply.types';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';

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

  const { ref: cardRef, height: cardHeight } = useElementHeight();

  const isValid = React.useCallback(() => {
    return canSubmitPost(POST_INPUT_VARIANT.REPLY, content, attachments, isSubmitting);
  }, [content, attachments, isSubmitting]);

  const characterLimit = { count: getCharacterCount(content), max: POST_MAX_CHARACTER_LENGTH };

  const enterSubmitHandler = useEnterSubmit(isValid, handleSubmit, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleMentionKeyDown(e)) return;
    enterSubmitHandler(e);
  };

  // Account for spacing between main post and QuickReply in connector calculation
  const connectorHeight = cardHeight ? cardHeight + QUICK_REPLY_CONNECTOR_SPACER_HEIGHT : undefined;

  const isMobile = useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';
  const isWideLayout = !isMobile && inheritedTagsLayout === 'side';

  return (
    <Atoms.Container overrideDefaults className="relative flex" data-testid="quick-reply" aria-busy={isSubmitting}>
      <Atoms.Container overrideDefaults className="-mt-4 w-3 shrink-0">
        <Atoms.PostThreadConnector
          height={connectorHeight}
          variant={connectorVariant}
          data-testid="quick-reply-connector"
        />
      </Atoms.Container>

      <Atoms.Container
        ref={containerRef}
        className={cn(
          'relative w-full cursor-pointer rounded-md border border-dashed transition-colors duration-200',
          isWideLayout ? 'p-12' : 'p-4',
          isDragging ? 'border-brand' : 'border-input',
        )}
        onClick={handleExpand}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        overrideDefaults
      >
        {/* Drag overlay */}
        {isDragging && (
          <Atoms.Container
            className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-brand/10"
            overrideDefaults
          >
            <Atoms.Typography className="text-brand">Drop files here</Atoms.Typography>
          </Atoms.Container>
        )}

        <Atoms.Container ref={cardRef} className="gap-2" overrideDefaults>
          {/* Collapsed header row (avatar + input) */}
          <Atoms.Container className="flex items-center gap-4" overrideDefaults>
            <Organisms.AvatarWithFallback
              avatarUrl={avatarUrl}
              name={userDetails?.name || ''}
              fallbackSeed={currentUserPubky || userDetails?.name || 'user'}
              size={isWideLayout ? 'xl' : 'default'}
            />

            <Atoms.Container overrideDefaults className="relative flex-1">
              <Atoms.Textarea
                ref={textareaRef}
                aria-label="Reply"
                placeholder={displayPlaceholder}
                variant="inline"
                className={isWideLayout ? WIDE_POST_LAYOUT_CLASSES.bodyText : undefined}
                value={content}
                onChange={handleChange}
                onFocus={handleExpand}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isSubmitting}
                data-testid="quick-reply-textarea"
                aria-haspopup="listbox"
              />

              {/* Mention autocomplete popover */}
              {mentionIsOpen && (
                <Molecules.MentionPopover
                  users={mentionUsers}
                  selectedIndex={mentionSelectedIndex}
                  onSelect={handleMentionSelect}
                  onHover={setMentionSelectedIndex}
                />
              )}
            </Atoms.Container>
          </Atoms.Container>

          <PostInputAttachments
            ref={fileInputRef}
            attachments={attachments}
            setAttachments={setAttachments}
            handleFilesAdded={handleFilesAdded}
            isSubmitting={isSubmitting}
          />

          {/* Expandable section with animation (same transition as PostInput) */}
          <PostInputExpandableSection
            isExpanded={isExpanded}
            content={content}
            tags={tags}
            isSubmitting={isSubmitting}
            setTags={setTags}
            onSubmit={handleSubmit}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            onEmojiSelect={handleEmojiSelect}
            onImageClick={handleFileClick}
            isPostDisabled={!isValid()}
            submitMode={POST_INPUT_VARIANT.REPLY}
            className={isExpanded ? 'mt-4' : ''}
            characterLimit={characterLimit}
          />
        </Atoms.Container>
      </Atoms.Container>
    </Atoms.Container>
  );
}
