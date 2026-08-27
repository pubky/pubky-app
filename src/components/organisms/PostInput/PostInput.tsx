'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
import { useComposerHeightAnimation } from '@/hooks/useComposerHeightAnimation/useComposerHeightAnimation';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { usePostInputAuthHandlers } from '@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers';
import { usePostInputLock } from '@/hooks/usePostInputLock/usePostInputLock';
import { getComposerDissolveVariants } from '@/libs/motion/composerMotion';
import { parseArticleContent } from '@/libs/post/articleContent';
import { isLockTeaserWithinLimit } from '@/libs/post/lockTeaser';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';
import { DialogLockContent } from '@/molecules/DialogLockContent/DialogLockContent';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { sanitizeCodeBlockLanguages } from '@/molecules/MarkdownEditor/InitializedMDXEditor.utils';
import { MarkdownEditor } from '@/molecules/MarkdownEditor/MarkdownEditor';
import { MentionPopover } from '@/molecules/MentionPopover/MentionPopover';
import {
  AVATAR_CLASS_BY_HEADER_SIZE,
  AVATAR_SIZE_BY_HEADER_SIZE,
  GAP_CLASS_BY_HEADER_SIZE,
} from '@/molecules/PostHeaderUserInfo/PostHeaderUserInfo.utils';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { useToast } from '@/molecules/Toaster/use-toast';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';
import { POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT } from '@/organisms/PostMain/PostMainLayoutRules';
import { BODY_TEXT_CLASS_BY_TAGS_LAYOUT } from '@/organisms/PostMain/PostMainTypography';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import { POST_INPUT_VARIANT } from './PostInput.constants';
import type { PostInputProps } from './PostInput.types';

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
  layoutOverride,
}: PostInputProps) {
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
    lockConfig,
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
  const shouldReduceMotion = useReducedMotion();
  const { ref: stateContentMeasureRef, height: stateContentHeight } = useElementHeight();
  // Forced-expanded dialog composers must not use Framer height at all — even
  // `animate={{ height: 'auto' }}` measures and can lock a tall inline height
  // during the dialog zoom-in, leaving empty space in the composer.
  const skipHeightMotion = Boolean(expanded || shouldReduceMotion);
  const { animatedHeight, heightTransition, onHeightAnimationComplete } = useComposerHeightAnimation({
    isExpanded,
    measuredHeight: stateContentHeight,
    shouldReduceMotion,
    skipAnimation: expanded,
  });
  const dissolveVariants = getComposerDissolveVariants(shouldReduceMotion);

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
            description: 'Could not parse article content',
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
  const characterLimit =
    isExpanded && !isArticle ? { count: getCharacterCount(content), max: composerMaxLength } : undefined;

  useEffect(() => {
    onLockModeChange?.(isLockEnabled);
  }, [isLockEnabled, onLockModeChange]);

  const inheritedTagsLayout = useEffectiveTagsLayout();
  const tagsLayout = layoutOverride ?? inheritedTagsLayout;
  const usesWidePadding = tagsLayout === 'side';
  const headerSize = POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT[tagsLayout];

  return (
    <Container
      data-cy={dataCy}
      id={id}
      ref={containerRef}
      data-state={isExpanded ? 'expanded' : 'collapsed'}
      className={cn(
        'relative cursor-pointer rounded-md border border-dashed transition-colors duration-200',
        'max-w-full min-w-0',
        usesWidePadding ? 'p-12' : 'p-6',
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
          <Typography className="text-brand">{'Drop files here'}</Typography>
        </Container>
      )}

      {showThreadConnector && <PostThreadConnector variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY} />}
      <Container
        className={cn(
          'min-w-0 contain-inline-size',
          '[&_textarea::placeholder]:transition-opacity [&_textarea::placeholder]:duration-150',
          'focus-within:[&_textarea::placeholder]:opacity-0',
          'motion-reduce:[&_textarea::placeholder]:transition-none',
        )}
      >
        <motion.div
          data-testid="post-input-state-height"
          className={skipHeightMotion ? undefined : 'overflow-hidden'}
          initial={false}
          // `false` disables Framer height control entirely (needed for dialogs).
          animate={skipHeightMotion ? false : { height: animatedHeight }}
          transition={skipHeightMotion ? undefined : { height: heightTransition }}
          onAnimationComplete={skipHeightMotion ? undefined : onHeightAnimationComplete}
        >
          <div ref={stateContentMeasureRef} className="relative">
            {!isArticle && currentUserPubky && (
              <div data-testid="post-input-stable-avatar" className="absolute top-0 left-0 z-10">
                <PostHeader
                  postId={currentUserPubky}
                  isReplyInput={true}
                  userDetails={currentUserDetails}
                  showPopover={false}
                  showUserInfo={false}
                  size={headerSize}
                />
              </div>
            )}

            <div data-testid="post-input-state-content" className="relative flex min-w-0 flex-col gap-4">
              {isArticle && (
                <Input
                  placeholder={'Article Title'}
                  defaultValue={articleTitle}
                  onChange={handleArticleTitleChangeWithAuth}
                  maxLength={ARTICLE_TITLE_MAX_CHARACTER_LENGTH}
                  disabled={isSubmitting || !isAuthenticated}
                  className="h-auto border-none p-0 text-3xl font-bold md:text-6xl"
                />
              )}

              {isArticle && currentUserPubky && (
                <PostHeader
                  postId={currentUserPubky}
                  isReplyInput={true}
                  userDetails={currentUserDetails}
                  showPopover={false}
                  showUserInfo={false}
                  size={headerSize}
                />
              )}

              {!isArticle && (
                <Container overrideDefaults className="relative flex min-w-0 flex-col gap-4">
                  <AnimatePresence initial={false} mode="popLayout">
                    {isExpanded && currentUserPubky && (
                      <motion.div
                        key="post-input-expanded-header"
                        data-testid="post-input-expanded-header"
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        variants={dissolveVariants}
                      >
                        <PostHeader
                          postId={currentUserPubky}
                          isReplyInput={true}
                          userDetails={currentUserDetails}
                          characterLimit={characterLimit}
                          characterLimitPlacement={tagsLayout === 'inline' ? 'name-row' : 'metadata'}
                          showPopover={false}
                          visuallyHideAvatar={true}
                          size={headerSize}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Container
                    overrideDefaults
                    className={cn('flex w-full min-w-0 items-stretch', GAP_CLASS_BY_HEADER_SIZE[headerSize])}
                  >
                    {!isExpanded && currentUserPubky && (
                      <div
                        data-testid="post-input-collapsed-avatar-placeholder"
                        className={cn('shrink-0 self-start', AVATAR_CLASS_BY_HEADER_SIZE[headerSize])}
                        aria-hidden="true"
                      />
                    )}
                    {!currentUserPubky && (
                      <div className="shrink-0 self-start">
                        <AvatarWithFallback
                          name=""
                          fallbackSeed="user"
                          size={AVATAR_SIZE_BY_HEADER_SIZE[headerSize]}
                          data-testid="post-input-fallback-avatar"
                        />
                      </div>
                    )}
                    <Container overrideDefaults className="relative flex min-w-0 flex-1 items-center">
                      <Textarea
                        name="post-input-textarea"
                        ref={textareaRef}
                        placeholder={
                          isLockEnabled ? 'Write a short announcement to tease your content.' : displayPlaceholder
                        }
                        variant="inline"
                        className={cn(
                          'field-sizing-fixed w-full rounded-none',
                          BODY_TEXT_CLASS_BY_TAGS_LAYOUT[tagsLayout],
                        )}
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
                          anchorRef={textareaRef}
                          users={mentionUsers}
                          selectedIndex={mentionSelectedIndex}
                          onSelect={handleMentionSelect}
                          onHover={setMentionSelectedIndex}
                        />
                      )}
                    </Container>
                  </Container>
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

              <AnimatePresence initial={false} mode="popLayout">
                {isExpanded && (
                  <motion.div
                    key="post-input-expanded-controls"
                    data-testid="post-input-expanded-controls"
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={dissolveVariants}
                  >
                    <PostInputExpandableSection
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
                      lockSwitch={lockSwitch}
                      lockCard={
                        isLockConfigured ? (
                          <LockedPostCard
                            unlockInfo={lockConfig}
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
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
  );
}
