'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type MDXEditorMethods, type MDXEditorProps } from '@mdxeditor/editor';
import { useDebounceCallback } from 'usehooks-ts';
import { REPOST_OPTIMISTIC_PREPEND_VARIANTS } from '@/config/feed';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import {
  ARTICLE_COVER_MAX_FILES,
  ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES,
  ARTICLE_SUPPORTED_FILE_TYPES,
  ARTICLE_TITLE_MAX_CHARACTER_LENGTH,
  ATTACHMENT_MAX_OTHER_SIZE,
  POST_ATTACHMENT_MAX_FILES,
  POST_MAX_CHARACTER_LENGTH,
  POST_SUPPORTED_ATTACHMENT_MIME_TYPES,
  POST_SUPPORTED_FILE_TYPES,
} from '@/config/posts';
import { PostController } from '@/controllers/post/post';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useDeletePost } from '@/hooks/useDeletePost/useDeletePost';
import { useEditAttachments } from '@/hooks/useEditAttachments/useEditAttachments';
import { useEmojiInsert } from '@/hooks/useEmojiInsert/useEmojiInsert';
import { useMentionAutocomplete } from '@/hooks/useMentionAutocomplete/useMentionAutocomplete';
import { getContentWithMention } from '@/hooks/useMentionAutocomplete/useMentionAutocomplete.utils';
import { usePost } from '@/hooks/usePost/usePost';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { Logger } from '@/libs/logger/logger';
import { parseArticleContent } from '@/libs/post/articleContent';
import { collectAttachmentRefIndexes } from '@/libs/post/articleInlineImages';
import { isViewerExcludedWotStream } from '@/models/stream/post/postStream.types';
import { toast } from '@/molecules/Toaster/toast';
import { POST_INPUT_PLACEHOLDER, POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { postKindBelongsToStream } from '@/stores/home/home.utils';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
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
  editAttachmentUris,
  editContent,
  editIsArticle,
  onSuccess,
  placeholder,
  successToastTitle,
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
  const { currentUserPubky, userDetails: currentUserDetails } = useCurrentUserProfile();
  const {
    content,
    setContent,
    tags,
    setTags,
    attachments,
    setAttachments,
    existingAttachments,
    setExistingAttachments,
    isArticle,
    setIsArticle,
    articleTitle,
    setArticleTitle,
    reply,
    post,
    repost,
    edit,
    isSubmitting,
    inlineImages,
    uploadingCount,
  } = usePost();
  const timelineFeed = useTimelineFeedContext();
  const { deletePost } = useDeletePost();

  // Article edits show only the cover in the attachment strip — inline images
  // live in the body. The cover is attachments[0] unless the published body
  // references attachment:0 (slot-0 rule: slot 0 is inline, no cover).
  const articleEditBody =
    variant === POST_INPUT_VARIANT.EDIT && editIsArticle ? parseArticleContent(editContent)?.body : undefined;
  const editRefIndexes = articleEditBody === undefined ? undefined : collectAttachmentRefIndexes(articleEditBody);
  const editDisplayUris =
    editRefIndexes === undefined ? undefined : editRefIndexes.has(0) ? [] : (editAttachmentUris ?? []).slice(0, 1);
  // Original attachments the user is never shown (not the cover, not
  // referenced by the body at open) — carried through the edit untouched so
  // saving cannot delete files the user did not see and remove
  const editPreservedUris =
    editRefIndexes === undefined
      ? undefined
      : (editAttachmentUris ?? []).filter((_uri, index) => {
          const isCover = index === 0 && !editRefIndexes.has(0);
          return !isCover && !editRefIndexes.has(index);
        });

  // Seed and resolve the post's current attachments for the edit composer
  const { seededUris: seededAttachmentUris } = useEditAttachments({
    enabled: variant === POST_INPUT_VARIANT.EDIT,
    postId: editPostId,
    uris: editAttachmentUris,
    displayUris: editDisplayUris,
    existingAttachments,
    setExistingAttachments,
  });

  // Get original post author's name for repost toast message
  const originalPostAuthorId = originalPostId ? originalPostId.split(':')[0] : null;
  const { userDetails: originalPostAuthor } = useUserDetails(originalPostAuthorId);

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
    onContentChange?.(content, tags, attachments, articleTitle, existingAttachments);
  }, [content, tags, attachments, articleTitle, existingAttachments, onContentChange]);

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

  // Autosize textarea height (Safari doesn't support `field-sizing: content` yet).
  // Never measure an empty textarea: in a stretched layout its scrollHeight can
  // equal the available container height and persist that height inline.
  useLayoutEffect(() => {
    if (isArticle) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (content.length === 0) {
      textarea.style.height = '1lh';
      return;
    }

    // Measure from a collapsed height so a stretched flex/grid measurement cannot
    // become the next explicit textarea height.
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [content, isArticle, isExpanded]);

  // Handle submit using reply, repost, post, or edit method from hook
  const handleSubmit = useCallback(async () => {
    if (isSubmitting || uploadingCount > 0) return;

    // For replies, posts, and edits, require content or attachments. For reposts, content is optional. Content and title is required for articles.
    const totalAttachments = attachments.length + existingAttachments.length;
    if (
      (variant !== POST_INPUT_VARIANT.REPOST && !content.trim() && totalAttachments === 0) ||
      (isArticle && (!content.trim() || !articleTitle.trim()))
    )
      return;

    // Maps a newly added File to a local-store attachment backed by a fresh object URL
    const newFileToLocalAttachment = (file: File) => {
      const url = URL.createObjectURL(file);
      const isImage = file.type.startsWith('image');
      return { type: file.type, name: file.name, urls: { main: url, feed: isImage ? url : undefined } };
    };

    // Wrapper that prepends to timeline and calls original onSuccess.
    // Article store seeding is owned by usePost: the entry must be
    // index-aligned with the full `[cover?, ...inline]` attachment list,
    // which only usePost knows. Seeding here would overwrite it.
    const handleSuccess = (createdPostId: string) => {
      if (variant === POST_INPUT_VARIANT.EDIT) {
        if (!isArticle) {
          // Replace the optimistic store entry with the resulting attachment set:
          // kept attachments reuse their already-resolved URLs (the store's
          // set-difference revoke keeps reused blob: URLs alive), new files get
          // fresh object URLs. If a kept attachment never resolved, clear the
          // entry instead and let the Dexie/CDN render path take over.
          const allKeptResolved = existingAttachments.every((attachment) => attachment.urls !== null);
          const merged = allKeptResolved
            ? [
                ...existingAttachments.map((attachment) => ({
                  type: attachment.type,
                  name: attachment.name,
                  urls: attachment.urls as { main: string; feed?: string },
                })),
                ...attachments.map(newFileToLocalAttachment),
              ]
            : [];

          useLocalFilesStore.getState().setPostAttachments(createdPostId, merged);
        }
        onSuccess?.(createdPostId);
        return;
      }

      if (!isArticle && attachments.length) {
        useLocalFilesStore.getState().setPostAttachments(createdPostId, attachments.map(newFileToLocalAttachment));
      }

      if (variant === POST_INPUT_VARIANT.REPLY) {
        onSuccess?.(createdPostId);
        return;
      }

      const feedVariant = timelineFeed?.variant;
      const shouldPrepend =
        variant === POST_INPUT_VARIANT.POST ||
        (variant === POST_INPUT_VARIANT.REPOST &&
          feedVariant != null &&
          REPOST_OPTIMISTIC_PREPEND_VARIANTS.has(feedVariant));

      if (shouldPrepend) {
        void (async () => {
          try {
            const streamId = timelineFeed?.streamId;
            if (!streamId) {
              await timelineFeed?.prependPosts(createdPostId);
              return;
            }

            /*
              WoT-sourced streams ('My network', 'Tagged as') never contain the
              viewer's own posts (Nexus excludes them and the local create path
              never writes into them), so prepending would flash the post and
              lose it on the next stream reset (#2308). Unlike the kind gate
              below, this check is NOT mirrored in `NewPostsSection`: unread ids
              there come from polling the WoT stream itself, so they belong.
            */
            if (isViewerExcludedWotStream(streamId)) {
              return;
            }

            const details = await PostController.getDetails({ compositeId: createdPostId });
            if (!details?.kind || postKindBelongsToStream(details.kind, streamId)) {
              await timelineFeed.prependPosts(createdPostId);
            }
          } catch (error) {
            Logger.error('[usePostInput] Failed to prepend created post to timeline', {
              error,
              createdPostId,
              streamId: timelineFeed?.streamId,
            });
          } finally {
            setIsExpanded(false);
          }
        })();
      } else {
        setIsExpanded(false);
      }

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
          successToastTitle,
          onSuccess: handleSuccess,
          onUndo: deletePost,
        });
        break;
      case POST_INPUT_VARIANT.EDIT:
        await edit({
          editPostId: editPostId!,
          originalAttachmentUris: seededAttachmentUris,
          preservedAttachmentUris: editPreservedUris,
          onSuccess: handleSuccess,
        });
        break;
      case POST_INPUT_VARIANT.POST:
      default:
        await post({ onSuccess: handleSuccess });
        break;
    }
  }, [
    content,
    attachments,
    existingAttachments,
    isArticle,
    articleTitle,
    variant,
    postId,
    originalPostId,
    originalPostAuthor,
    successToastTitle,
    reply,
    post,
    repost,
    edit,
    editPostId,
    seededAttachmentUris,
    editPreservedUris,
    isSubmitting,
    uploadingCount,
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
  const handleEmojiSelect = useEmojiInsert({
    inputRef: textareaRef,
    value: content,
    onChange: handleEmojiChange,
  });

  // File handling - shared logic for both file input and drag/drop
  const handleFilesAdded = useCallback(
    (files: File[]) => {
      if (isSubmitting || files.length === 0) return;

      // Articles cap the picker at the cover; inline body images are uploaded separately.
      const ATTACHMENT_MAX_FILES = isArticle ? ARTICLE_COVER_MAX_FILES : POST_ATTACHMENT_MAX_FILES;
      const SUPPORTED_ATTACHMENT_MIME_TYPES = isArticle
        ? ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES
        : POST_SUPPORTED_ATTACHMENT_MIME_TYPES;
      const SUPPORTED_FILE_TYPES = isArticle ? ARTICLE_SUPPORTED_FILE_TYPES : POST_SUPPORTED_FILE_TYPES;

      const currentCount = attachments.length + existingAttachments.length;
      const availableSlots = ATTACHMENT_MAX_FILES - currentCount;

      if (availableSlots <= 0) {
        toast({
          variant: 'error',
          description: isArticle
            ? 'Articles support one cover image. Remove it first, or drop the image in the editor to add it inline.'
            : `Maximum ${ATTACHMENT_MAX_FILES} files allowed`,
        });
        return;
      }

      const validFiles: File[] = [];
      const errors: string[] = [];

      for (const file of files) {
        if (validFiles.length >= availableSlots) {
          errors.push(`Maximum ${ATTACHMENT_MAX_FILES} files allowed. Some files were not added.`);
          break;
        }

        // Check against specific supported MIME types from pubky-app-specs
        const isAcceptedType = SUPPORTED_ATTACHMENT_MIME_TYPES.includes(file.type);
        if (!isAcceptedType) {
          errors.push(`Unsupported file type for ${file.name}. Supported: ${SUPPORTED_FILE_TYPES}.`);
          continue;
        }

        const isImage = file.type.startsWith('image/');
        const maxImageSizeLabel = `${Math.round(IMAGE_MAX_RAW_SIZE / (1024 * 1024))}MB`;
        const maxOtherSizeLabel = `${Math.round(ATTACHMENT_MAX_OTHER_SIZE / (1024 * 1024))}MB`;

        if (isImage && file.size > IMAGE_MAX_RAW_SIZE) {
          errors.push(`${file.name} exceeds the ${maxImageSizeLabel} limit.`);
          continue;
        }

        if (!isImage && file.size > ATTACHMENT_MAX_OTHER_SIZE) {
          errors.push(`${file.name} exceeds the ${maxOtherSizeLabel} limit.`);
          continue;
        }

        validFiles.push(file);
      }

      if (errors.length > 0) {
        toast({
          variant: 'error',
          description: errors.join('\n'),
        });
      }

      if (validFiles.length > 0) {
        setAttachments((prev) => [...prev, ...validFiles]);
      }
    },
    [isArticle, isSubmitting, attachments.length, existingAttachments.length, setAttachments],
  );

  // Remove an existing attachment from the edit composer (removed from the post on submit)
  const removeExistingAttachment = (uri: string) => {
    setExistingAttachments((prev) => prev.filter((attachment) => attachment.uri !== uri));
  };

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

  // Uploads image files and inserts their markdown at the rich-text editor's
  // caret. Fallback for drops Lexical ignores (see handleDrop); the viewport
  // uploading pill provides the in-flight feedback.
  const insertInlineImagesAtCaret = async (files: File[]) => {
    for (const file of files) {
      try {
        const uri = await inlineImages.upload(file);
        markdownEditorRef.current?.focus();
        markdownEditorRef.current?.insertMarkdown(`![](${uri})`);
      } catch {
        // The upload handler already surfaced the failure to the user
      }
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const alreadyHandled = e.defaultPrevented;
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      // In article mode the body editors consume image drops themselves
      // (Lexical's DROP_COMMAND / the markdown textarea handler) and call
      // preventDefault before the event bubbles here. Drag state is still
      // reset above; only the cover-attachment handling is skipped.
      if (isArticle && alreadyHandled) return;

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

      // Drops landing on non-editable islands inside the rich-text editor
      // (an already-inserted image) are ignored by Lexical — no
      // preventDefault — so they'd fall through to the cover. The user aimed
      // at the editor: insert inline instead. Unsupported files fall through
      // to handleFilesAdded for its standard unsupported-type toast.
      if (isArticle && e.target instanceof Element && e.target.closest('.mdxeditor')) {
        const imageFiles = files.filter((file) => ARTICLE_SUPPORTED_ATTACHMENT_MIME_TYPES.includes(file.type));
        if (imageFiles.length > 0) {
          void insertInlineImagesAtCaret(imageFiles);
          return;
        }
      }

      handleFilesAdded(files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- insertInlineImagesAtCaret only uses stable refs and the upload handle
    [handleFilesAdded, isArticle, inlineImages],
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
  const displayPlaceholder = placeholder ?? POST_INPUT_PLACEHOLDER[variant];

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
    existingAttachments,
    setExistingAttachments,
    isArticle,
    setIsArticle,
    articleTitle,
    setArticleTitle,
    isDragging,
    isExpanded,
    isSubmitting,
    showEmojiPicker,
    setShowEmojiPicker,
    inlineImages,
    uploadingCount,

    // Mention autocomplete state
    mentionUsers,
    mentionIsOpen,
    mentionSelectedIndex,
    setMentionSelectedIndex,

    // Derived values
    hasContent,
    displayPlaceholder,
    currentUserPubky,
    currentUserDetails,

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
    removeExistingAttachment,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handlePaste,
    handleMentionSelect,
    handleMentionKeyDown: mentionHandleKeyDown,
  };
}
