'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { PostThreadConnector } from '@/atoms/PostThreadConnector/PostThreadConnector';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { Tabs, TabsContent } from '@/atoms/Tabs/Tabs';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { Typography } from '@/atoms/Typography/Typography';
import {
  ARTICLE_TITLE_MAX_CHARACTER_LENGTH,
  LOCK_ATTACHMENT_MAX_FILES,
  LOCK_ATTACHMENT_MAX_SIZE,
  LOCK_TEASER_MAX_CHARACTER_LENGTH,
  LOCK_TITLE_MAX_CHARACTER_LENGTH,
  POST_MAX_CHARACTER_LENGTH,
} from '@/config/posts';
import { useArticleComposerTab } from '@/hooks/useArticleComposerTab/useArticleComposerTab';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useCharacterLimitWarning } from '@/hooks/useCharacterLimitWarning/useCharacterLimitWarning';
import { useComposerHeightAnimation } from '@/hooks/useComposerHeightAnimation/useComposerHeightAnimation';
import { useEffectiveTagsLayout } from '@/hooks/useEffectiveTagsLayout/useEffectiveTagsLayout';
import { useElementHeight } from '@/hooks/useElementHeight/useElementHeight';
import { useEnterSubmit } from '@/hooks/useEnterSubmit/useEnterSubmit';
import { useFullscreen } from '@/hooks/useFullscreen/useFullscreen';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { usePostInput } from '@/hooks/usePostInput/usePostInput';
import { usePostInputAuthHandlers } from '@/hooks/usePostInputAuthHandlers/usePostInputAuthHandlers';
import { usePostInputLock } from '@/hooks/usePostInputLock/usePostInputLock';
import type { TLockDraft } from '@/hooks/usePostInputLock/usePostInputLock.types';
import { getComposerDissolveVariants } from '@/libs/motion/composerMotion';
import { parseArticleContent } from '@/libs/post/articleContent';
import { deserializeArticleBody } from '@/libs/post/articleInlineMedia';
import { areLockAttachmentsWithinLimit, hasSvgAttachment } from '@/libs/post/lockAttachments';
import { isLockTeaserWithinLimit } from '@/libs/post/lockTeaser';
import { canSubmitPost, cn, getEnforcedCharacterCount, resolveUserDisplayName } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { ArticleComposerTabs } from '@/molecules/ArticleComposerTabs/ArticleComposerTabs';
import { ARTICLE_COMPOSER_TAB } from '@/molecules/ArticleComposerTabs/ArticleComposerTabs.constants';
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
import { toast } from '@/molecules/Toaster/toast';
import { ArticleComposerPreview } from '@/organisms/ArticleComposerPreview/ArticleComposerPreview';
import { DialogLocksAuth } from '@/organisms/DialogLocksAuth/DialogLocksAuth';
import { POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT } from '@/organisms/PostMain/PostMainLayoutRules';
import { BODY_TEXT_CLASS_BY_TAGS_LAYOUT } from '@/organisms/PostMain/PostMainTypography';
import { selectDisplayUserPubky } from '@/stores/auth/auth.selectors';
import { useAuthStore } from '@/stores/auth/auth.store';
import { AvatarWithFallback } from '../AvatarWithFallback/AvatarWithFallback';
import { PostHeader } from '../PostHeader/PostHeader';
import { PostInputExpandableSection } from '../PostInputExpandableSection/PostInputExpandableSection';
import { POST_INPUT_VARIANT } from './PostInput.constants';
import type { PostInputProps } from './PostInput.types';

// In MiB like the app's other size labels, rounded down so a file under the label is never refused.
const LOCK_ATTACHMENT_MAX_SIZE_LABEL = `${Math.floor((LOCK_ATTACHMENT_MAX_SIZE / (1024 * 1024)) * 10) / 10}MB`;
const LOCK_LIMITS_MESSAGE = `Locked content supports up to ${LOCK_ATTACHMENT_MAX_FILES} files of ${LOCK_ATTACHMENT_MAX_SIZE_LABEL} each.`;

// An article panel that stays mounted while another tab shows: the rich editor imports its markdown
// once and the cover strip owns the file input, so unmounting either would lose state.
const PERSISTENT_PANEL_PROPS = { forceMount: true, tabIndex: -1, className: 'data-[state=inactive]:hidden' } as const;

export function PostInput({
  active = true,
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
  isCollectionShare,
  showThreadConnector = false,
  expanded = false,
  onContentChange,
  onArticleModeChange,
  onLockModeChange,
  editContent,
  editIsArticle,
  editAttachments,
  editLock,
  autoFocusTextarea = false,
  initialContent,
  initialAttachments,
  layoutOverride,
}: PostInputProps) {
  const [lockDraft, setLockDraft] = useState<TLockDraft | null>(null);
  const isMobile = useIsMobile();

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
    restoreComposerDraft,
    lockTitle: editLockTitle,
    setLockTitle: setEditLockTitle,
    handleArticleTitleChange,
    handleArticleBodyChange,
    isDragging,
    isExpanded,
    isSubmitting: isWriting,
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
    inlineMedia,
    isEditInlineMediaLoading,
    uploadingCount,
    serializeArticleForLock,
    getLatestArticle,
    // Mention autocomplete
    mentionUsers,
    mentionIsOpen,
    mentionSelectedIndex,
    setMentionSelectedIndex,
    handleMentionSelect,
    handleMentionKeyDown,
    handleSelectionChange,
  } = usePostInput({
    active,
    variant,
    postId,
    originalPostId,
    editPostId,
    editLock,
    editAttachmentUris: editAttachments,
    editContent,
    editIsArticle,
    onSuccess,
    placeholder,
    successToastTitle,
    isCollectionShare,
    expanded,
    onContentChange,
    onArticleModeChange,
    hasExternalContent: () => isLockEnabled,
    // TODO:[Locks] #2684 — once this goes false the public copies are deleted best-effort; a failed
    // deletion leaves paid images public and nobody is told.
    keepInlineMedia: lockDraft?.isArticle === true,
  });

  const {
    isWaiting,
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
    active,
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
  const isSubmitting = isWriting || isWaiting;
  const restoreStatus = useAuthStore((state) => state.restoreStatus);
  const displayUserPubky = selectDisplayUserPubky({ currentUserPubky, restoreStatus });

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

  const refuseFilesForLock = (files: File[]) => {
    // TODO:[Locks] #2683 — temporary, until a locked SVG renders after an unlock.
    if (hasSvgAttachment(files)) {
      toast({ variant: 'error', description: 'Locked content cannot include SVG images yet.' });
      return true;
    }
    // The Lock Server refuses an oversized lock only after its files were uploaded, which orphans them.
    if (!areLockAttachmentsWithinLimit(files)) {
      toast({ variant: 'error', description: LOCK_LIMITS_MESSAGE });
      return true;
    }
    return false;
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
    active,
    isEnabled: isPostVariant,
    // Something to lock: any body text or at least one attachment. An article needs a title and a
    // body, as it does to be published.
    canEnable:
      (isArticle
        ? articleTitle.trim().length > 0 && content.trim().length > 0
        : content.trim().length > 0 || attachments.length > 0) && uploadingCount === 0,
    lockDraft,
    setLockDraft,
    captureComposer: () => {
      if (!isArticle) {
        if (refuseFilesForLock(attachments)) return null;
        return { content, attachments, isArticle: false, articleTitle };
      }

      // `articleTitle` and `content` trail the inputs by the debounce: a capture from them would
      // leave out an image inserted since, and its upload is deleted after publishing.
      const { title, body } = getLatestArticle();
      if (!title.trim() || !body.trim()) {
        toast({ variant: 'error', description: 'Add a title and a body to lock this article.' });
        return null;
      }
      const serializedArticle = serializeArticleForLock(body);
      if (!serializedArticle) return null;
      if (refuseFilesForLock([...attachments, ...serializedArticle.inlineFiles])) return null;

      return { content: body, attachments, isArticle: true, articleTitle: title, serializedArticle };
    },
    // One commit through `usePost`, which knows to keep the restored cover: setting the fields here
    // would make article mode flip next to a non-empty attachment list and clear it as a switch.
    restoreComposer: restoreComposerDraft,
    clearComposer: clearComposerForLock,
    // Announcement (public teaser) = the current composer state once the switch is on.
    announcementContent: content,
    announcementAttachments: attachments,
    announcementTags: tags,
    clearTags: () => setTags([]),
    onPublished: onSuccess,
    onNormalSubmit: handleSubmitWithAuth,
  });

  const { priceSats: editLockPriceSats } = useLockFile(editLock?.lockUrl);
  const isLockMode = isLockEnabled || editLock != null;
  const activeLockTitle = editLock ? editLockTitle : lockTitle;

  const isValid = () => {
    // `isPublishingLock` counts as submitting: the action-bar button only disables through this check,
    // so leaving it out lets a second click publish a duplicate lock while the first is in flight.
    return (
      canSubmitPost(
        variant,
        content,
        [...existingAttachments, ...attachments],
        isSubmitting || isPublishingLock,
        isArticle,
        articleTitle,
        uploadingCount > 0,
      ) &&
      // Validate the serialized announcement envelope before publish or edit reaches its write. The
      // title is required like an article's: the card only shows a placeholder when it is blank, so an
      // empty one reads as set and would be written as an empty string.
      (!isLockMode ||
        (activeLockTitle.trim().length > 0 &&
          isLockTeaserWithinLimit({ lock_title: activeLockTitle, teaser_description: content })))
    );
  };

  const enterSubmitHandler = useEnterSubmit(isValid, submitOrPublish, {
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

  useEffect(() => {
    if (isEdit) {
      if (editIsArticle) {
        setIsArticle(true);

        const parsed = parseArticleContent(editContent);
        if (parsed) {
          setArticleTitle(parsed.title);
          // Resolve published attachment:{n} image references back to their
          // homeserver file URIs so the composer edits real destinations.
          // Unresolvable references are removed (never a hard failure — the
          // article must stay editable so the user can repair it).
          let articleAuthorPubky = '';
          try {
            articleAuthorPubky = editPostId ? parseCompositeId(editPostId).pubky : '';
          } catch {
            // Malformed composite id — no reference can resolve to an author-owned file
          }
          const deserialized = deserializeArticleBody({
            body: parsed.body,
            attachments: editAttachments ?? [],
            authorPubky: articleAuthorPubky,
          });
          setContent(deserialized.body);
          if (deserialized.warnings.length > 0) {
            toast({
              variant: 'warning',
              description:
                deserialized.warnings.length === 1
                  ? 'An attachment with a broken reference was removed from the article.'
                  : `${deserialized.warnings.length} attachments with broken references were removed from the article.`,
            });
          }
        } else {
          toast({
            variant: 'error',
            description: 'Could not parse article content',
          });
        }
      } else {
        setContent(editContent);
      }
      // Seeded with the body: a failed save rolls the stored row back, and reverting only one of the
      // two would let the next save write the new title over the old body.
      setEditLockTitle(editLock?.title ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is an external side-effect, not a dependency
  }, [variant, editContent, editIsArticle, editLock?.title]);

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
  const composerMaxLength = isLockMode ? LOCK_TEASER_MAX_CHARACTER_LENGTH : POST_MAX_CHARACTER_LENGTH;
  const characterLimit =
    isExpanded && !isArticle ? { count: getEnforcedCharacterCount(content), max: composerMaxLength } : undefined;
  useCharacterLimitWarning(characterLimit);

  useEffect(() => {
    onLockModeChange?.(isLockEnabled);
  }, [isLockEnabled, onLockModeChange]);

  // Phones have a Title tab of their own; wider viewports keep the title with the body.
  const articleTab = useArticleComposerTab({ isArticle, isMobile, coverCount: attachments.length });
  // Leaving article mode takes the toggle away, so fullscreen entered from it ends with it.
  const {
    isFullscreen,
    isSupported: isFullscreenSupported,
    toggle: toggleFullscreen,
  } = useFullscreen({ enabled: isArticle });
  const currentUserAvatarUrl = useAvatarUrl(currentUserDetails);

  // The title the field shows. `articleTitle` commits through a debounce, so binding the field to
  // it would lag the keystrokes; the draft follows every keystroke and takes `articleTitle` whenever
  // that changes underneath it (an edit opening, a lock draft restored). A commit always carries the
  // value the field already holds, so it never moves the draft. State over an uncontrolled field: the
  // field moves between the tab row and the Title panel at the phone breakpoint, and a remount must
  // not lose the keystrokes the debounce has not committed yet.
  const [articleTitleDraft, setArticleTitleDraft] = useState(articleTitle);
  const [syncedArticleTitle, setSyncedArticleTitle] = useState(articleTitle);
  if (articleTitle !== syncedArticleTitle) {
    setSyncedArticleTitle(articleTitle);
    setArticleTitleDraft(articleTitle);
  }

  const inheritedTagsLayout = useEffectiveTagsLayout();
  const tagsLayout = layoutOverride ?? inheritedTagsLayout;
  const usesWidePadding = tagsLayout === 'side';
  const headerSize = POST_INPUT_HEADER_SIZE_BY_TAGS_LAYOUT[tagsLayout];

  // The dashed frame: the whole composer for a post, the body box under the tab row for an article.
  const dashedFrameClassName = cn(
    'rounded-md border border-dashed transition-colors duration-200',
    usesWidePadding ? 'p-12' : 'p-6',
    !isAuthenticated ? 'px-6' : '',
    isDragging ? 'border-brand' : 'border-input',
  );

  // Desktop renders the title as a field between the tabs and the body box; phones give it a tab of
  // its own, styled as the heading it becomes.
  const articleTitleInput = (
    <Input
      placeholder={'Title'}
      value={articleTitleDraft}
      onChange={(event) => {
        // The same cap the composer applies: a value it refuses must not show in the field either
        if (event.target.value.length > ARTICLE_TITLE_MAX_CHARACTER_LENGTH) return;
        setArticleTitleDraft(event.target.value);
        handleArticleTitleChangeWithAuth?.(event);
      }}
      maxLength={ARTICLE_TITLE_MAX_CHARACTER_LENGTH}
      disabled={isSubmitting || !isAuthenticated}
      data-cy="article-title-input"
      className={
        isMobile
          ? 'h-auto rounded-none border-none bg-transparent p-0 text-2xl leading-none font-bold shadow-none'
          : 'h-auto cursor-text border-dashed bg-background/20 px-6 py-4 font-medium'
      }
    />
  );

  // One element for both modes: only one of the two places below mounts at a time, so the file input
  // ref stays valid, and the article flag is the only difference between them.
  const attachmentsInput = (
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
  );

  return (
    <Tabs
      asChild
      value={articleTab.value}
      onValueChange={articleTab.onValueChange}
      // Only the article composer has tabs: the root stays the same element in both modes so a
      // switch never remounts the composer, and an unused tabs context costs nothing.
      className={isArticle ? 'gap-3' : 'gap-0'}
    >
      <Container
        data-cy={dataCy}
        id={id}
        ref={containerRef}
        data-state={isExpanded ? 'expanded' : 'collapsed'}
        className={cn('relative max-w-full min-w-0 cursor-pointer rounded-md', !isArticle && dashedFrameClassName)}
        onClick={handleExpandWithAuth}
        onDragEnter={(event) => handleDragEventWithAuth(event, handleDragEnter)}
        onDragLeave={(event) => handleDragEventWithAuth(event, handleDragLeave)}
        onDragOver={(event) => handleDragEventWithAuth(event, handleDragOver)}
        onDrop={(event) => handleDragEventWithAuth(event, handleDrop)}
      >
        {/* Drag overlay — visual only: it must not intercept the drop, or the
            article body editors underneath never receive their inline-image
            drops (the container's bubbled handler would treat them as covers) */}
        {isDragging && (
          <Container
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-brand/10"
            overrideDefaults
          >
            <Typography className="text-brand">{'Drop files here'}</Typography>
          </Container>
        )}

        {showThreadConnector && <PostThreadConnector variant={POST_THREAD_CONNECTOR_VARIANTS.DIALOG_REPLY} />}

        {isArticle && (
          <>
            <ArticleComposerTabs isMobile={isMobile} />
            {/* The title belongs to the Content tab; it stays mounted so switching tabs keeps its focus state */}
            {!isMobile && (
              <div className={cn(articleTab.value !== ARTICLE_COMPOSER_TAB.CONTENT && 'hidden')}>
                {articleTitleInput}
              </div>
            )}
          </>
        )}

        <Container
          className={cn(
            'min-w-0 contain-inline-size',
            isArticle && dashedFrameClassName,
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
              {!isArticle && displayUserPubky && (
                <div data-testid="post-input-stable-avatar" className="absolute top-0 left-0 z-10">
                  <PostHeader
                    postId={displayUserPubky}
                    isReplyInput={true}
                    userDetails={currentUserDetails}
                    showPopover={false}
                    showUserInfo={false}
                    size={headerSize}
                  />
                </div>
              )}

              <div data-testid="post-input-state-content" className="relative flex min-w-0 flex-col gap-4">
                {!isArticle && (
                  <Container overrideDefaults className="relative flex min-w-0 flex-col gap-4">
                    <AnimatePresence initial={false} mode="popLayout">
                      {isExpanded && displayUserPubky && (
                        <motion.div
                          key="post-input-expanded-header"
                          data-testid="post-input-expanded-header"
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          variants={dissolveVariants}
                        >
                          <PostHeader
                            postId={displayUserPubky}
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
                      {!isExpanded && displayUserPubky && (
                        <div
                          data-testid="post-input-collapsed-avatar-placeholder"
                          className={cn('shrink-0 self-start', AVATAR_CLASS_BY_HEADER_SIZE[headerSize])}
                          aria-hidden="true"
                        />
                      )}
                      {!displayUserPubky && (
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
                            isLockMode ? 'Write a short announcement to tease your content.' : displayPlaceholder
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
                          onKeyUp={handleSelectionChange}
                          onSelect={handleSelectionChange}
                          onPaste={handlePasteWithAuth}
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

                {/* The article sections. Preview mounts on demand, it is derived from state. */}
                {isArticle ? (
                  <>
                    <TabsContent
                      value={ARTICLE_COMPOSER_TAB.CONTENT}
                      {...PERSISTENT_PANEL_PROPS}
                      data-testid="article-composer-panel-content"
                    >
                      <MarkdownEditor
                        ref={markdownEditorRef}
                        autoFocus
                        markdown={sanitizeCodeBlockLanguages(content)}
                        onChange={handleArticleBodyChangeWithAuth}
                        readOnly={isSubmitting || !isAuthenticated}
                        inlineMedia={{ ...inlineMedia, uploadingCount }}
                        isLoading={isEditInlineMediaLoading}
                      />
                    </TabsContent>

                    {isMobile && (
                      <TabsContent
                        value={ARTICLE_COMPOSER_TAB.TITLE}
                        {...PERSISTENT_PANEL_PROPS}
                        data-testid="article-composer-panel-title"
                      >
                        {articleTitleInput}
                      </TabsContent>
                    )}

                    <TabsContent
                      value={ARTICLE_COMPOSER_TAB.HEADER}
                      {...PERSISTENT_PANEL_PROPS}
                      data-testid="article-composer-panel-header"
                    >
                      {attachmentsInput}
                    </TabsContent>

                    <TabsContent
                      value={ARTICLE_COMPOSER_TAB.PREVIEW}
                      tabIndex={-1}
                      data-testid="article-composer-panel-preview"
                    >
                      {displayUserPubky && (
                        <ArticleComposerPreview
                          // The draft, not the debounced state: the preview must show what was just typed
                          title={articleTitleDraft}
                          body={content}
                          authorPubky={displayUserPubky}
                          userDetails={currentUserDetails}
                          coverFile={attachments[0]}
                          // Only the edit variant has a persisted cover; a new one picked this session wins
                          coverAttachment={isEdit ? existingAttachments[0] : undefined}
                          inlineMedia={inlineMedia}
                        />
                      )}
                    </TabsContent>
                  </>
                ) : (
                  attachmentsInput
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
                          isLockConfigured || editLock ? (
                            <LockedPostCard
                              priceSats={editLock ? editLockPriceSats : lockConfig?.amountSats}
                              editableTitle={{
                                value: activeLockTitle,
                                onChange: editLock ? setEditLockTitle : setLockTitle,
                                disabled: editLock ? isSubmitting : isPublishingLock,
                                maxLength: LOCK_TITLE_MAX_CHARACTER_LENGTH,
                              }}
                            />
                          ) : undefined
                        }
                        // The article's byline moves into the action row (the body box has no header)
                        leadingContent={
                          isArticle && displayUserPubky ? (
                            <AvatarWithFallback
                              avatarUrl={currentUserAvatarUrl}
                              name={resolveUserDisplayName(currentUserDetails)}
                              fallbackSeed={displayUserPubky}
                              size="md"
                              data-testid="article-composer-avatar"
                            />
                          ) : isArticle ? (
                            <AvatarWithFallback
                              name=""
                              fallbackSeed="user"
                              size="md"
                              data-testid="post-input-fallback-avatar"
                            />
                          ) : undefined
                        }
                        fullscreen={
                          isArticle && isFullscreenSupported
                            ? { isFullscreen, onToggle: () => void toggleFullscreen() }
                            : undefined
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </Container>

        {isPostVariant && lockServerPubky && (
          <>
            <DialogLocksAuth
              open={isAuthDialogOpen}
              onOpenChange={(open) => {
                if (!open) closeAuthDialog();
              }}
              onSuccess={handleAuthSuccess}
            />
            <DialogLockContent open={isLockDialogOpen} onOpenChange={closeLockDialog} onApplied={handleLockApplied} />
          </>
        )}
      </Container>
    </Tabs>
  );
}
