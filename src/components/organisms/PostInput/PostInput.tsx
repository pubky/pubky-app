'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import * as Atoms from '@/atoms';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import { ARTICLE_TITLE_MAX_CHARACTER_LENGTH, POST_MAX_CHARACTER_LENGTH } from '@/config';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms';
import { POST_INPUT_VARIANT } from './PostInput.constants';
import type { PostInputProps } from './PostInput.types';
import { PostInputExpandableSection } from '../PostInputExpandableSection';
import { PostInputAttachments } from '@/molecules/PostInputAttachments/PostInputAttachments';
import type { ArticleJSON } from '@/hooks';

export function PostInput({
  dataCy,
  variant,
  postId,
  originalPostId,
  editPostId,
  onSuccess,
  placeholder,
  showThreadConnector = false,
  expanded = false,
  onContentChange,
  onArticleModeChange,
  editContent,
  editIsArticle,
}: PostInputProps) {
  const t = useTranslations('post');
  const tCommon = useTranslations('common');
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
  } = Hooks.usePostInput({
    variant,
    postId,
    originalPostId,
    editPostId,
    onSuccess,
    placeholder,
    expanded,
    onContentChange,
    onArticleModeChange,
  });

  const isValid = React.useCallback(() => {
    return Libs.canSubmitPost(variant, content, attachments, isSubmitting, isArticle, articleTitle);
  }, [variant, content, attachments, isSubmitting, isArticle, articleTitle]);

  const enterSubmitHandler = Hooks.useEnterSubmit(isValid, handleSubmit, {
    requireModifier: true,
  });

  // Combined keyboard handler: mention popover takes priority, then enter submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (handleMentionKeyDown(e)) return;
    enterSubmitHandler(e);
  };

  const isEdit = variant === POST_INPUT_VARIANT.EDIT;

  const { toast } = Molecules.useToast();

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
            title: tCommon('error'),
            description: tToast('parseError'),
          });
        }
      } else {
        setContent(editContent);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is an external side-effect, not a dependency
  }, [variant, editContent, editIsArticle]);

  return (
    <Atoms.Container
      data-cy={dataCy}
      ref={containerRef}
      className={Libs.cn(
        'relative cursor-pointer rounded-md border border-dashed p-4 transition-colors duration-200',
        isDragging ? 'border-brand' : 'border-input',
      )}
      onClick={handleExpand}
      onDragEnter={isEdit ? undefined : handleDragEnter}
      onDragLeave={isEdit ? undefined : handleDragLeave}
      onDragOver={isEdit ? undefined : handleDragOver}
      onDrop={isEdit ? undefined : handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <Atoms.Container
          className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-brand/10"
          overrideDefaults
        >
          <Atoms.Typography className="text-brand">{t('dropFiles')}</Atoms.Typography>
        </Atoms.Container>
      )}

      {showThreadConnector && <Atoms.PostThreadConnector variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY} />}
      <Atoms.Container className="gap-4 contain-inline-size">
        {isArticle && (
          <Atoms.Input
            placeholder={t('articleTitle')}
            defaultValue={articleTitle}
            onChange={handleArticleTitleChange}
            maxLength={ARTICLE_TITLE_MAX_CHARACTER_LENGTH}
            disabled={isSubmitting}
            className="h-auto border-none p-0 text-3xl font-bold md:text-6xl"
          />
        )}

        {currentUserPubky && (
          <Organisms.PostHeader
            postId={currentUserPubky}
            isReplyInput={true}
            characterLimit={
              isArticle ? undefined : { count: Libs.getCharacterCount(content), max: POST_MAX_CHARACTER_LENGTH }
            }
            showPopover={false}
          />
        )}

        {!isArticle && (
          <Atoms.Container overrideDefaults className="relative">
            <Atoms.Textarea
              ref={textareaRef}
              placeholder={displayPlaceholder}
              className="min-h-6 resize-none border-none p-0 font-medium text-secondary-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={content}
              onChange={handleChange}
              onFocus={handleExpand}
              onKeyDown={handleKeyDown}
              onPaste={isEdit ? undefined : handlePaste}
              maxLength={POST_MAX_CHARACTER_LENGTH}
              rows={1}
              disabled={isSubmitting}
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
        )}

        {!isEdit && (
          <PostInputAttachments
            ref={fileInputRef}
            attachments={attachments}
            setAttachments={setAttachments}
            handleFilesAdded={handleFilesAdded}
            isSubmitting={isSubmitting}
            isArticle={isArticle}
            handleFileClick={handleFileClick}
          />
        )}

        {isArticle && (
          <Molecules.MarkdownEditor
            ref={markdownEditorRef}
            autoFocus
            markdown={content}
            onChange={handleArticleBodyChange}
            readOnly={isSubmitting}
          />
        )}

        {/* Show original post preview for reposts */}
        {variant === POST_INPUT_VARIANT.REPOST && originalPostId && (
          <Molecules.PostPreviewCard postId={originalPostId} className="bg-card" />
        )}

        <PostInputExpandableSection
          isExpanded={isExpanded}
          content={content}
          tags={tags}
          isSubmitting={isSubmitting}
          isArticle={isArticle}
          setTags={setTags}
          onSubmit={handleSubmit}
          showEmojiPicker={showEmojiPicker}
          setShowEmojiPicker={setShowEmojiPicker}
          onEmojiSelect={handleEmojiSelect}
          onImageClick={handleFileClick}
          onArticleClick={handleArticleClick}
          isPostDisabled={!isValid()}
          submitMode={variant}
        />
      </Atoms.Container>
    </Atoms.Container>
  );
}
