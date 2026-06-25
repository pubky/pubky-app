'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import { ARTICLE_TITLE_MAX_CHARACTER_LENGTH, POST_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import type { ArticleJSON } from '@/hooks/usePostArticle/usePostArticle.types';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { usePostInputAuthHandlers } from '@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers';
import { canSubmitPost, cn, getCharacterCount } from '@/libs/utils/utils';
import { sanitizeCodeBlockLanguages } from '@/molecules/MarkdownEditor/InitializedMDXEditor.utils';
import { MarkdownEditor } from '@/molecules/MarkdownEditor/MarkdownEditor';
import { MentionPopover } from '@/molecules/MentionPopover/MentionPopover';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { useToast } from '@/molecules/Toaster/use-toast';
import { usePostMainLayout } from '@/organisms/PostMain/PostMainLayoutContext';
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

  const isValid = () => {
    return canSubmitPost(variant, content, attachments, isSubmitting, isArticle, articleTitle);
  };

  const enterSubmitHandler = useEnterSubmit(isValid, handleSubmitWithAuth, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = createKeyDownHandler({ handleMentionKeyDown, enterSubmitHandler });

  const isEdit = variant === POST_INPUT_VARIANT.EDIT;

  const { toast } = useToast();

  React.useEffect(() => {
    if (isEdit) {
      if (editIsArticle) {
        setIsArticle(true);

        try {
          const parsed = JSON.parse(editContent) as ArticleJSON;
          setArticleTitle(parsed.title || '');
          setContent(parsed.body || '');
        } catch {
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

  const characterLimit = isArticle ? undefined : { count: getCharacterCount(content), max: POST_MAX_CHARACTER_LENGTH };

  const isMobile = useIsMobile();
  const inheritedTagsLayout = usePostMainLayout() ?? 'inline';
  const isWideLayout = !isMobile && inheritedTagsLayout === 'side';

  return (
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
              placeholder={displayPlaceholder}
              variant="inline"
              className={isWideLayout ? WIDE_POST_BODY_TEXT_CLASS : undefined}
              value={content}
              onChange={handleChangeWithAuth}
              onFocus={handleExpandWithAuth}
              onKeyDown={handleKeyDown}
              onPaste={isEdit ? undefined : handlePasteWithAuth}
              maxLength={POST_MAX_CHARACTER_LENGTH}
              rows={1}
              disabled={isSubmitting}
              readOnly={!isAuthenticated}
              aria-haspopup="listbox"
              autoFocus={autoFocusTextarea}
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
          <PostPreviewCard postId={originalPostId} className="bg-card" />
        )}

        <PostInputExpandableSection
          isExpanded={isExpanded}
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
          parentGapPx={EXPANDABLE_SECTION_PARENT_GAP_PX}
          characterLimit={characterLimit}
        />
      </Container>
    </Container>
  );
}
