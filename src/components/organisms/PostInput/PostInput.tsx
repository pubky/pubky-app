'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import {
  ARTICLE_TITLE_MAX_CHARACTER_LENGTH,
  LOCK_TEASER_MAX_CHARACTER_LENGTH,
  LOCK_TITLE_MAX_CHARACTER_LENGTH,
  POST_MAX_CHARACTER_LENGTH,
} from '@/config/posts';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { usePostInputAuthHandlers } from '@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers';
import { usePostInputLock } from '@/hooks/usePostInputLock/usePostInputLock';
import { parseArticleContent } from '@/libs/post/articleContent';
import { isLockTeaserWithinLimit } from '@/libs/post/lockTeaser';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';
import { DialogLockContent } from '@/molecules/DialogLockContent/DialogLockContent';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { sanitizeCodeBlockLanguages } from '@/molecules/MarkdownEditor/InitializedMDXEditor.utils';
import { MarkdownEditor } from '@/molecules/MarkdownEditor/MarkdownEditor';
import { MentionPopover } from '@/molecules/MentionPopover/MentionPopover';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { useToast } from '@/molecules/Toaster/use-toast';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';
import { WIDE_POST_BODY_TEXT_CLASS } from '@/organisms/PostMain/PostMainTypography';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import { POST_INPUT_VARIANT } from './PostInput.constants';
import type { PostInputProps } from './PostInput.types';

const EXPANDABLE_SECTION_PARENT_GAP_PX = 16;

export function PostInput({
  dataCy,
  id,
  variant,
  postId,
  originalPostId,
  editPostId,
  onSuccess,
  placeholder,
  submitLabel,
  submitIcon,
  successToastTitle,
  showThreadConnector = false,
  expanded = false,
  onContentChange,
  onArticleModeChange,
  onLockModeChange,
  editContent,
  editIsArticle,
  autoFocusTextarea = false,
  initialContent,
  initialAttachments,
}: PostInputProps) {
  const t = useTranslations('post');
  const tToast = useTranslations('toast.post');
  const {
    textareaRef,
    markdownEditorRef,
    containerRef,
    fileInputRef,
    content,
    setContent,
    tags,
    setTags,
    attachments,
    setAttachments,
    isArticle,
    setIsArticle,
    handleArticleClick,
    articleTitle,
    setArticleTitle,
    handleArticleTitleChange,
    handleArticleBodyChange,
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
    // Mention autocomplete
    mentionUsers,
    mentionIsOpen,
    mentionSelectedIndex,
    setMentionSelectedIndex,
    handleMentionSelect,
    handleMentionKeyDown,
  } = usePostInput({
    variant,
    postId,
    originalPostId,
    editPostId,
    onSuccess,
    placeholder,
    successToastTitle,
    expanded,
    onContentChange,
    onArticleModeChange,
    hasExternalContent: () => isLockEnabled,
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
    handleArticleTitleChangeWithAuth,
    handleArticleBodyChangeWithAuth,
    handleArticleClickWithAuth,
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
    handleArticleTitleChange,
    handleArticleBodyChange,
    handleArticleClick,
  });

  const isPostVariant = variant === POST_INPUT_VARIANT.POST;

  // Lock flow only — normal posts clear themselves inside `usePost`. Empties the composer body but
  // keeps the tags (they belong to the announcement). Used by the switch-on capture and the
  // lock-publish cleanup.
  const clearComposerForLock = () => {
    setContent('');
    setAttachments([]);
    setIsArticle(false);
    setArticleTitle('');
  };

  const {
    lockSwitch,
    isLockEnabled,
    isLockConfigured,
    lockServerPubky,
    isAuthDialogOpen,
    closeAuthDialog,
    handleAuthSuccess,
    isLockDialogOpen,
    closeLockDialog,
    handleLockApplied,
    lockTitle,
    setLockTitle,
    submitOrPublish,
    isPublishing: isPublishingLock,
  } = usePostInputLock({
    isEnabled: isPostVariant,
    // Something to lock: any body text or at least one attachment.
    canEnable: content.trim().length > 0 || attachments.length > 0,
    captureComposer: () => ({ content, attachments, isArticle, articleTitle }),
    restoreComposer: (draft) => {
      setContent(draft.content);
      setAttachments(draft.attachments);
      setIsArticle(draft.isArticle);
      setArticleTitle(draft.articleTitle);
    },
    clearComposer: clearComposerForLock,
    // Announcement (public teaser) = the current composer state once the switch is on.
    announcementContent: content,
    announcementAttachments: attachments,
    announcementTags: tags,
    clearTags: () => setTags([]),
    onPublished: onSuccess,
    onNormalSubmit: handleSubmitWithAuth,
  });

  const isValid = () => {
    // `isPublishingLock` counts as submitting: the action-bar button only disables through this check,
    // so leaving it out lets a second click publish a duplicate lock while the first is in flight.
    return (
      canSubmitPost(variant, content, attachments, isSubmitting || isPublishingLock, isArticle, articleTitle) &&
      // Blocking the click is what prevents an orphaned lock: the publish creates the lock first.
      (!isLockEnabled || isLockTeaserWithinLimit({ lock_title: lockTitle, teaser_description: content }))
    );
  };

  const enterSubmitHandler = useEnterSubmit(isValid, submitOrPublish, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

  const isEdit = variant === POST_INPUT_VARIANT.EDIT;

  const { toast } = useToast();

  useEffect(() => {
    if (isEdit) {
      if (editIsArticle) {
        setIsArticle(true);

        const parsed = parseArticleContent(editContent);
        if (parsed) {
          setArticleTitle(parsed.title);
          setContent(parsed.body);
        } else {
          toast({
            variant: 'error',
            description: tToast('parseError'),
          });
        }
      } else {
        setContent(editContent);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is an external side-effect, not a dependency
  }, [variant, editContent, editIsArticle]);

  // Pre-fill content from share target or other external sources
  useEffect(() => {
    if (initialContent && !isEdit) {
      setContent(initialContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  // Pre-fill attachments from share target or other external sources
  useEffect(() => {
    if (initialAttachments && initialAttachments.length > 0 && !isEdit) {
      handleFilesAdded(initialAttachments);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  // With the lock on the body is the teaser, sharing the post budget with the title in one envelope.
  const composerMaxLength = isLockEnabled ? LOCK_TEASER_MAX_CHARACTER_LENGTH : POST_MAX_CHARACTER_LENGTH;
  const characterLimit = isArticle ? undefined : { count: getCharacterCount(content), max: composerMaxLength };

  useEffect(() => {
    onLockModeChange?.(isLockEnabled);
  }, [isLockEnabled, onLockModeChange]);

  const isWideLayout = useEffectiveTagsLayout() === 'side';

  return (
    <>
      <Container
        data-cy={dataCy}
        id={id}
        ref={containerRef}
        className={cn(
          'relative cursor-pointer rounded-md border border-dashed transition-colors duration-200',
          isWideLayout ? 'p-12' : 'p-4',
          !isAuthenticated ? 'px-6' : '',
          isDragging ? 'border-brand' : 'border-input',
        )}
        onClick={handleExpandWithAuth}
        onDragEnter={isEdit ? undefined : (event) => handleDragEventWithAuth(event, handleDragEnter)}
        onDragLeave={isEdit ? undefined : (event) => handleDragEventWithAuth(event, handleDragLeave)}
        onDragOver={isEdit ? undefined : (event) => handleDragEventWithAuth(event, handleDragOver)}
        onDrop={isEdit ? undefined : (event) => handleDragEventWithAuth(event, handleDrop)}
      >
        {/* Drag overlay */}
        {isDragging && (
          <Container
            className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-brand/10"
            overrideDefaults
          >
            <Typography className="text-brand">{t('dropFiles')}</Typography>
          </Container>
        )}

        {showThreadConnector && <PostThreadConnector variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY} />}
        <Container className="gap-4 contain-inline-size">
          {isArticle && (
            <Input
              placeholder={t('articleTitle')}
              defaultValue={articleTitle}
              onChange={handleArticleTitleChangeWithAuth}
              maxLength={ARTICLE_TITLE_MAX_CHARACTER_LENGTH}
              disabled={isSubmitting || !isAuthenticated}
              className="h-auto border-none p-0 text-3xl font-bold md:text-6xl"
            />
          )}

          {currentUserPubky && (
            <PostHeader
              postId={currentUserPubky}
              isReplyInput={true}
              characterLimit={characterLimit}
              showPopover={false}
              size={isWideLayout ? 'large' : 'normal'}
            />
          )}

          {!isArticle && (
            <Container overrideDefaults className="relative">
              <Textarea
                ref={textareaRef}
                placeholder={isLockEnabled ? t('lock.teaserPlaceholder') : displayPlaceholder}
                variant="inline"
                className={isWideLayout ? WIDE_POST_BODY_TEXT_CLASS : undefined}
                value={content}
                onChange={handleChangeWithAuth}
                onFocus={handleExpandWithAuth}
                onKeyDown={handleKeyDown}
                onPaste={isEdit ? undefined : handlePasteWithAuth}
                maxLength={composerMaxLength}
                rows={1}
                disabled={isSubmitting}
                readOnly={!isAuthenticated}
                aria-haspopup="listbox"
                autoFocus={autoFocusTextarea}
                // Suppress the iOS keyboard autofill accessory bar (passwords/cards/contacts)
                autoComplete="off"
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
          )}

          {!isEdit && (
            <PostInputAttachments
              ref={fileInputRef}
              attachments={attachments}
              setAttachments={setAttachmentsWithAuth}
              handleFilesAdded={handleFilesAddedWithAuth}
              isSubmitting={isSubmitting}
              isArticle={isArticle}
              handleFileClick={handleFileClickWithAuth}
            />
          )}

          {isArticle && (
            <MarkdownEditor
              ref={markdownEditorRef}
              autoFocus
              markdown={sanitizeCodeBlockLanguages(content)}
              onChange={handleArticleBodyChangeWithAuth}
              readOnly={isSubmitting || !isAuthenticated}
            />
          )}

          {/* Show original post preview for reposts */}
          {variant === POST_INPUT_VARIANT.REPOST && originalPostId && (
            <PostPreviewCard postId={originalPostId} className="bg-card" interactiveActions={false} />
          )}

          <PostInputExpandableSection
            isExpanded={isExpanded}
            content={content}
            tags={tags}
            isSubmitting={isSubmitting || isPublishingLock}
            isArticle={isArticle}
            isDisabled={!isAuthenticated}
            setTags={setTagsWithAuth}
            onSubmit={submitOrPublish}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            onEmojiSelect={handleEmojiSelectWithAuth}
            onImageClick={handleFileClickWithAuth}
            onArticleClick={handleArticleClickWithAuth}
            isPostDisabled={isAuthenticated ? !isValid() : false}
            submitMode={variant}
            submitLabel={submitLabel}
            submitIcon={submitIcon}
            parentGapPx={EXPANDABLE_SECTION_PARENT_GAP_PX}
            characterLimit={characterLimit}
            lockSwitch={lockSwitch}
            lockCard={
              isLockConfigured ? (
                <LockedPostCard
                  editableTitle={{
                    value: lockTitle,
                    onChange: setLockTitle,
                    disabled: isPublishingLock,
                    maxLength: LOCK_TITLE_MAX_CHARACTER_LENGTH,
                  }}
                />
              ) : undefined
            }
          />
        </Container>

        {isPostVariant && (
          <>
            {lockServerPubky && (
              <DialogLocksAuth
                open={isAuthDialogOpen}
                onOpenChange={(open) => {
                  if (!open) closeAuthDialog();
                }}
                onSuccess={handleAuthSuccess}
              />
            )}
            <DialogLockContent open={isLockDialogOpen} onOpenChange={closeLockDialog} onApplied={handleLockApplied} />
          </>
        )}
      </Container>
    </>
  );
}
