'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { type MDXEditorProps, type MDXEditorMethods } from '@mdxeditor/editor';
import { useDebounceCallback } from 'usehooks-ts';
import { useTranslations } from 'next-intl';
import * as Hooks from '@/hooks';
import * as Molecules from '@/molecules';
import {
  POST_MAX_CHARACTER_LENGTH,
  ATTACHMENT_MAX_IMAGE_SIZE,
  ATTACHMENT_MAX_OTHER_SIZE,
  ARTICLE_ATTACHMENT_MAX_FILES,
  POST_ATTACHMENT_MAX_FILES,
  ARTICLE_SUPPORTED_FILE_TYPES,
  POST_SUPPORTED_FILE_TYPES,
  POST_SUPPORTED_ATTACHMENT_MIME_TYPES,
  ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES,
  ARTICLE_TITLE_MAX_CHARACTER_LENGTH,
} from '@/config';
import { useTimelineFeedContext } from '@/organisms/TimelineFeed/TimelineFeed';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { useMentionAutocomplete, getContentWithMention } from '@/hooks/useMentionAutocomplete';
import type { UsePostInputOptions, UsePostInputReturn } from './usePostInput.types';

/**
 * Hook that encapsulates all PostInput logic.
 *
 * Manages:
 * - Content, tags, attachments, article state (via usePost)
 * - Expand/collapse behavior
 * - Emoji picker integration
 * - Form submission (post or reply)
 * - Click outside detection for collapse
 * - Content change notifications to parent
 * - File drag and drop handling
 * - Mention autocomplete (@username and pubky ID patterns)
 * - Clipboard paste handling for file attachments
 */
export function usePostInput({
  variant,
  postId,
  originalPostId,
  editPostId,
  onSuccess,
  placeholder,
  expanded = false,
  onContentChange,
  onArticleModeChange,
}: UsePostInputOptions): UsePostInputReturn {
  // State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [isDragging, setIsDragging] = useState(false);

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const markdownEditorRef = useRef<MDXEditorMethods>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Hooks
  const t = useTranslations('post.placeholder');
  const { currentUserPubky } = Hooks.useCurrentUserProfile();
  const {
    content,
    setContent,
    tags,
    setTags,
    attachments,
    setAttachments,
    isArticle,
    setIsArticle,
    articleTitle,
    setArticleTitle,
    reply,
    post,
    repost,
    edit,
    isSubmitting,
  } = Hooks.usePost();
  const timelineFeed = useTimelineFeedContext();
  const { toast } = Molecules.useToast();
  const { deletePost } = Hooks.useDeletePost();

  // Get original post author's name for repost toast message
  const originalPostAuthorId = originalPostId ? originalPostId.split(':')[0] : null;
  const { userDetails: originalPostAuthor } = Hooks.useUserDetails(originalPostAuthorId);

  // Handle mention selection - inserts pubky{userId} into content
  const handleMentionSelect = useCallback(
    (userId: string) => {
      const newContent = getContentWithMention(content, userId);
      if (newContent.length <= POST_MAX_CHARACTER_LENGTH) {
        setContent(newContent);
      }
      // Focus textarea after selection
      textareaRef.current?.focus();
    },
    [content, setContent],
  );

  // Mention autocomplete
  const {
    users: mentionUsers,
    isOpen: mentionIsOpen,
    selectedIndex: mentionSelectedIndex,
    setSelectedIndex: setMentionSelectedIndex,
    handleKeyDown: mentionHandleKeyDown,
  } = useMentionAutocomplete({ content, onSelect: handleMentionSelect });

  // Notify parent of content changes
  useEffect(() => {
    onContentChange?.(content, tags, attachments, articleTitle);
  }, [content, tags, attachments, articleTitle, onContentChange]);

  // Notify parent of article mode changes
  useEffect(() => {
    onArticleModeChange?.(isArticle);
  }, [isArticle, onArticleModeChange]);

  // Handle click outside to collapse (only when expanded prop is false)
  useEffect(() => {
    if (expanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check if click is inside the container
      if (containerRef.current?.contains(target)) return;

      // Check if click is inside MDXEditor popup containers (portaled outside the container)
      const mdxEditorPopup = document.querySelector('.mdxeditor-popup-container');
      if (mdxEditorPopup?.contains(target)) return;

      // Check if click is inside a dialog (portaled outside the container, e.g., EmojiPickerDialog)
      const dialogContent = document.querySelector('[data-slot="dialog-content"]');
      if (dialogContent?.contains(target)) return;

      // Collapse only if there's no content
      if (!content.trim() && tags.length === 0 && attachments.length === 0 && !articleTitle.trim()) {
        setIsExpanded(false);
        setIsArticle(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expanded, content, tags, attachments, setIsArticle, articleTitle]);

  // Handle expand on interaction
  const handleExpand = useCallback(() => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  }, [isExpanded]);

  // Handle submit using reply, repost, post, or edit method from hook
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;

    // For replies and posts, require content or attachments. For reposts, content is optional. Content and title is required for articles. Content is required for edits.
    if (
      (variant !== POST_INPUT_VARIANT.REPOST && !content.trim() && attachments.length === 0) ||
      (isArticle && (!content.trim() || !articleTitle.trim())) ||
      (variant === POST_INPUT_VARIANT.EDIT && !content.trim())
    )
      return;

    // Wrapper that prepends to timeline and calls original onSuccess
    const handleSuccess = (createdPostId: string) => {
      // Only prepend to timeline for posts and reposts, not replies or edits
      if (variant !== POST_INPUT_VARIANT.REPLY && variant !== POST_INPUT_VARIANT.EDIT) {
        timelineFeed?.prependPosts(createdPostId);
      }
      // Call original onSuccess callback if provided
      onSuccess?.(createdPostId);
    };

    switch (variant) {
      case POST_INPUT_VARIANT.REPLY:
        await reply({ postId: postId!, onSuccess: handleSuccess });
        break;
      case POST_INPUT_VARIANT.REPOST:
        await repost({
          originalPostId: originalPostId!,
          originalAuthorName: originalPostAuthor?.name,
          onSuccess: handleSuccess,
          onUndo: deletePost,
        });
        break;
      case POST_INPUT_VARIANT.EDIT:
        await edit({ editPostId: editPostId!, onSuccess: handleSuccess });
        break;
      case POST_INPUT_VARIANT.POST:
      default:
        await post({ onSuccess: handleSuccess });
        break;
    }
  }, [
    content,
    attachments,
    isArticle,
    articleTitle,
    variant,
    postId,
    originalPostId,
    originalPostAuthor,
    reply,
    post,
    repost,
    edit,
    editPostId,
    isSubmitting,
    onSuccess,
    timelineFeed,
    deletePost,
  ]);

  // Handle textarea change with validation
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length <= POST_MAX_CHARACTER_LENGTH) {
        setContent(value);
      }
    },
    [setContent],
  );

  // Wrapper to apply validation when emoji is inserted
  const handleEmojiChange = useCallback(
    (newValue: string) => {
      if (newValue.length <= POST_MAX_CHARACTER_LENGTH) {
        setContent(newValue);
      }
    },
    [setContent],
  );

  // Handle article title change with validation
  const handleArticleTitleChange = useDebounceCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= ARTICLE_TITLE_MAX_CHARACTER_LENGTH) {
      setArticleTitle(value);
    }
  }, 500);

  // Handle article body change - length validation is handled via MDXEditor's maxLength plugin
  const handleArticleBodyChange = useDebounceCallback<NonNullable<MDXEditorProps['onChange']>>(
    (markdown) => setContent(markdown),
    500,
  );

  // Emoji insert handler
  const handleEmojiSelect = Hooks.useEmojiInsert({
    inputRef: textareaRef,
    value: content,
    onChange: handleEmojiChange,
  });

  // File handling - shared logic for both file input and drag/drop
  const handleFilesAdded = useCallback(
    (files: File[]) => {
      if (isSubmitting || files.length === 0) return;

      const ATTACHMENT_MAX_FILES = isArticle ? ARTICLE_ATTACHMENT_MAX_FILES : POST_ATTACHMENT_MAX_FILES;
      const SUPPORTED_ATTACHMENT_MIME_TYPES = isArticle
        ? ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES
        : POST_SUPPORTED_ATTACHMENT_MIME_TYPES;
      const SUPPORTED_FILE_TYPES = isArticle ? ARTICLE_SUPPORTED_FILE_TYPES : POST_SUPPORTED_FILE_TYPES;

      const currentCount = attachments.length;
      const availableSlots = ATTACHMENT_MAX_FILES - currentCount;

      if (availableSlots <= 0) {
        toast({
          title: 'Error',
          description: `Maximum of ${ATTACHMENT_MAX_FILES} files allowed`,
        });
        return;
      }

      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of files) {
        if (validFiles.length >= availableSlots) {
          errors.push(`Maximum of ${ATTACHMENT_MAX_FILES} files allowed. Some files were not added.`);
          break;
        }

        // Check against specific supported MIME types from pubky-app-specs
        const isAcceptedType = SUPPORTED_ATTACHMENT_MIME_TYPES.includes(file.type);
        if (!isAcceptedType) {
          errors.push(
            `"${file.name}" has unsupported type "${file.type}". Supported formats: ${SUPPORTED_FILE_TYPES}.`,
          );
          continue;
        }

        const isImage = file.type.startsWith('image/');
        const maxSize = isImage ? ATTACHMENT_MAX_IMAGE_SIZE : ATTACHMENT_MAX_OTHER_SIZE;
        const maxSizeLabel = isImage ? '5MB' : '20MB';

        if (file.size > maxSize) {
          errors.push(`"${file.name}" exceeds the maximum size of ${maxSizeLabel}.`);
          continue;
        }

        validFiles.push(file);
      }

      if (errors.length > 0) {
        toast({
          title: errors.length > 1 ? 'Errors' : 'Error',
          description: errors.join('\n'),
        });
      }

      if (validFiles.length > 0) {
        setAttachments((prev) => [...prev, ...validFiles]);
      }
    },
    [isArticle, isSubmitting, attachments.length, setAttachments, toast],
  );

  // Drag and drop handlers
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;

      // Only set dragging if there are files being dragged
      if (e.dataTransfer.types.includes('Files')) {
        setIsDragging(true);
        // Auto-expand when dragging files over
        if (!isExpanded) {
          setIsExpanded(true);
        }
      }
    },
    [isExpanded],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;

    // Only set isDragging to false when we've left all nested elements
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const dataTransfer = e.dataTransfer;
      if (!dataTransfer) return;

      // Extract files from drag event
      const files: File[] = [];

      for (const item of dataTransfer.items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();

          if (file) {
            files.push(file);
          }
        }
      }

      handleFilesAdded(files);
    },
    [handleFilesAdded],
  );

  // Trigger file input click
  const handleFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle paste events - extract files from clipboard
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      // Only prevent default if we have files - allow normal text paste
      e.preventDefault();
      handleFilesAdded(files);
    }
  };

  const handleArticleClick = () => setIsArticle(true);

  // Derived values
  const hasContent = content.trim().length > 0;
  const displayPlaceholder = placeholder ?? t(variant);

  return {
    // Refs
    textareaRef,
    markdownEditorRef,
    containerRef,
    fileInputRef,

    // State
    content,
    setContent,
    tags,
    setTags,
    attachments,
    setAttachments,
    isArticle,
    setIsArticle,
    articleTitle,
    setArticleTitle,
    isDragging,
    isExpanded,
    isSubmitting,
    showEmojiPicker,
    setShowEmojiPicker,

    // Mention autocomplete state
    mentionUsers,
    mentionIsOpen,
    mentionSelectedIndex,
    setMentionSelectedIndex,

    // Derived values
    hasContent,
    displayPlaceholder,
    currentUserPubky,

    // Handlers
    handleExpand,
    handleSubmit,
    handleChange,
    handleArticleClick,
    handleArticleTitleChange,
    handleArticleBodyChange,
    handleEmojiSelect,
    handleFilesAdded,
    handleFileClick,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
    handleMentionSelect,
    handleMentionKeyDown: mentionHandleKeyDown,
  };
}
