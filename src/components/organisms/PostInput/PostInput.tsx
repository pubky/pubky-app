'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import { ARTICLE_TITLE_MAX_CHARACTER_LENGTH, POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useComposerHeightAnimation } from '@/hooks/useComposerHeightAnimation/useComposerHeightAnimation';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { usePostInputAuthHandlers } from '@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers';
import { getComposerDissolveVariants } from '@/libs/motion/composerMotion';
import { parseArticleContent } from '@/libs/post/articleContent';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';
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
import { toast } from '@/molecules/Toaster/toast';
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
  editContent,
  editIsArticle,
  editAttachments,
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
    existingAttachments,
    removeExistingAttachment,
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
    editAttachmentUris: editAttachments,
    onSuccess,
    placeholder,
    successToastTitle,
    expanded,
    onContentChange,
    onArticleModeChange,
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
    removeExistingAttachmentWithAuth,
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
    removeExistingAttachment,
  });

  const isValid = () => {
    return canSubmitPost(
      variant,
      content,
      [...existingAttachments, ...attachments],
      isSubmitting,
      isArticle,
      articleTitle,
    );
  };

  const enterSubmitHandler = useEnterSubmit(isValid, handleSubmitWithAuth, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

  const isEdit = variant === POST_INPUT_VARIANT.EDIT;

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

  React.useEffect(() => {
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
  React.useEffect(() => {
    if (initialContent && !isEdit) {
      setContent(initialContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  // Pre-fill attachments from share target or other external sources
  React.useEffect(() => {
    if (initialAttachments && initialAttachments.length > 0 && !isEdit) {
      handleFilesAdded(initialAttachments);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  const characterLimit =
    isExpanded && !isArticle ? { count: getCharacterCount(content), max: POST_MAX_CHARACTER_LENGTH } : undefined;

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
      onDragEnter={(event) => handleDragEventWithAuth(event, handleDragEnter)}
      onDragLeave={(event) => handleDragEventWithAuth(event, handleDragLeave)}
      onDragOver={(event) => handleDragEventWithAuth(event, handleDragOver)}
      onDrop={(event) => handleDragEventWithAuth(event, handleDrop)}
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
                        placeholder={displayPlaceholder}
                        variant="inline"
                        className={cn(
                          'field-sizing-fixed w-full rounded-none',
                          BODY_TEXT_CLASS_BY_TAGS_LAYOUT[tagsLayout],
                        )}
                        value={content}
                        onChange={handleChangeWithAuth}
                        onFocus={handleExpandWithAuth}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePasteWithAuth}
                        maxLength={POST_MAX_CHARACTER_LENGTH}
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

              <PostInputAttachments
                ref={fileInputRef}
                attachments={attachments}
                setAttachments={setAttachmentsWithAuth}
                handleFilesAdded={handleFilesAddedWithAuth}
                isSubmitting={isSubmitting}
                isArticle={isArticle}
                handleFileClick={handleFileClickWithAuth}
                existingAttachments={isEdit ? existingAttachments : undefined}
                onRemoveExisting={isEdit ? removeExistingAttachmentWithAuth : undefined}
              />

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
                      isSubmitting={isSubmitting}
                      isArticle={isArticle}
                      isDisabled={!isAuthenticated}
                      setTags={setTagsWithAuth}
                      onSubmit={handleSubmitWithAuth}
                      showEmojiPicker={showEmojiPicker}
                      setShowEmojiPicker={setShowEmojiPicker}
                      onEmojiSelect={handleEmojiSelectWithAuth}
                      onImageClick={handleFileClickWithAuth}
                      onArticleClick={handleArticleClickWithAuth}
                      isPostDisabled={isAuthenticated ? !isValid() : false}
                      submitMode={variant}
                      submitLabel={submitLabel}
                      submitIcon={submitIcon}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </Container>
    </Container>
  );
}
