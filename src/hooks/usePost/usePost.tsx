'use client';

import { useEffect, useState } from 'react';
import { ToastAction } from '@/atoms/Toast/Toast';
import { PostController } from '@/controllers/post/post';
import type { TEditPostAttachments } from '@/controllers/post/post.types';
import { getImageUploadSizeLimitToastMessage } from '@/libs/image/imageUploadSizeLimit';
import { Logger } from '@/libs/logger/logger';
import { useToast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import type {
  ExistingAttachment,
  UsePostEditOptions,
  UsePostPostOptions,
  UsePostReplyOptions,
  UsePostRepostOptions,
  UsePostReturn,
} from './usePost.types';

/**
 * Custom hook to handle post creation or edits (replies, reposts, and root posts)
 *
 * @returns Object containing content state, setContent function, tags state, setTags function, attachments state, setAttachments function, isArticle state, setIsArticle function, articleTitle state, setArticleTitle function, reply method, post method, repost method, isSubmitting state, and error state
 *
 * @example
 * ```tsx
 * const { content, setContent, tags, setTags, attachments, setAttachments, reply, post, repost, isSubmitting, error } = usePost();
 *
 * // For replies:
 * const handleSubmit = reply({ postId: 'post-123', onSuccess: () => {} });
 *
 * // For reposts:
 * const handleSubmit = repost({ originalPostId: 'post-123', onSuccess: () => {} });
 *
 * // For root posts:
 * const handleSubmit = post({ onSuccess: () => {} });
 *
 * // For edits:
 * const handleSubmit = edit({ editPostId: 'post-123', onSuccess: () => {} });
 * ```
 */
export function usePost(): UsePostReturn {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ExistingAttachment[]>([]);
  const [isArticle, setIsArticle] = useState(false);
  const [articleTitle, setArticleTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (post actions return early if null)
  const currentUserId = useAuthStore((state) => state.currentUserPubky);
  const { toast } = useToast();

  const reply = async ({ postId, onSuccess }: UsePostReplyOptions) => {
    // allow empty content and attachments
    if ((!content.trim() && attachments.length === 0) || !postId || !currentUserId) return;

    setIsSubmitting(true);

    try {
      const createdPostId = await PostController.commitCreate({
        parentPostId: postId,
        content: content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setContent('');
      setTags([]);
      setAttachments([]);
      toast({
        title: 'Reply posted',
        dismissButton: true,
      });
      onSuccess?.(createdPostId);
    } catch (err) {
      Logger.error('[usePost] Failed to submit reply:', err);
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(err) ?? 'Could not post reply. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const post = async ({ onSuccess }: UsePostPostOptions) => {
    // allow empty content and attachments if not article
    if (
      (!content.trim() && attachments.length === 0) ||
      (isArticle && (!content.trim() || !articleTitle.trim())) ||
      !currentUserId
    )
      return;

    setIsSubmitting(true);

    try {
      const createdPostId = await PostController.commitCreate({
        content: isArticle ? JSON.stringify({ title: articleTitle.trim(), body: content.trim() }) : content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        isArticle,
      });
      setContent('');
      setTags([]);
      setAttachments([]);
      setIsArticle(false);
      setArticleTitle('');
      toast({
        title: 'Post published',
      });
      onSuccess?.(createdPostId);
    } catch (err) {
      Logger.error('[usePost] Failed to create post:', err);
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(err) ?? 'Could not create post. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const repost = async ({
    originalPostId,
    originalAuthorName,
    successToastTitle,
    onSuccess,
    onUndo,
  }: UsePostRepostOptions) => {
    if (!originalPostId || !currentUserId) return;

    setIsSubmitting(true);

    try {
      const createdPostId = await PostController.commitCreate({
        originalPostId,
        content: content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setContent('');
      setTags([]);
      setAttachments([]);

      const toastInstance = toast({
        title: successToastTitle ?? (originalAuthorName ? `Reposted ${originalAuthorName}'s post` : 'Reposted'),
        action: (
          <ToastAction
            variant={'info'}
            altText={'Undo'}
            onClick={() => {
              toastInstance.dismiss();
              onUndo(createdPostId);
            }}
          >
            {'Undo'}
          </ToastAction>
        ),
      });

      onSuccess?.(createdPostId);
    } catch (err) {
      Logger.error('[usePost] Failed to repost:', err);
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(err) ?? 'Could not repost. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const edit = async ({ editPostId, originalAttachmentUris, onSuccess }: UsePostEditOptions) => {
    // allow empty content when attachments remain; articles require content and title
    const totalAttachments = existingAttachments.length + attachments.length;
    if (
      (!content.trim() && totalAttachments === 0) ||
      (isArticle && (!content.trim() || !articleTitle.trim())) ||
      !editPostId ||
      !currentUserId
    )
      return;

    setIsSubmitting(true);

    try {
      // Removal is the only mutation of kept attachments (no reordering), so a
      // count comparison against the seeded snapshot detects any change.
      const keptUris = existingAttachments.map((attachment) => attachment.uri);
      const originalUris = originalAttachmentUris ?? keptUris;
      const attachmentsChanged = attachments.length > 0 || keptUris.length !== originalUris.length;
      const editAttachments: TEditPostAttachments | undefined = attachmentsChanged
        ? { original: originalUris, kept: keptUris, added: attachments }
        : undefined;

      await PostController.commitEdit({
        compositePostId: editPostId,
        content: isArticle ? JSON.stringify({ title: articleTitle.trim(), body: content.trim() }) : content.trim(),
        attachments: editAttachments,
      });
      setContent('');
      setAttachments([]);
      setExistingAttachments([]);
      setIsArticle(false);
      setArticleTitle('');
      toast({
        title: 'Post updated',
      });
      onSuccess?.(editPostId);
    } catch (err) {
      Logger.error('[usePost] Failed to edit post:', err);
      toast({
        variant: 'error',
        description: getImageUploadSizeLimitToastMessage(err) ?? 'Could not update post. Try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear attachments when switching to article mode.
  // `existingAttachments` is deliberately excluded: it is only populated in
  // edit mode, where `isArticle` flips true during prefill in the same commit
  // window that seeds the article cover — including it here would wipe the
  // seeded cover on mount. The article button is hidden in edit mode, so a
  // user-initiated switch can never happen with `existingAttachments` set.
  useEffect(() => {
    if (isArticle && attachments.length > 0) {
      toast({
        variant: 'warning',
        title: 'Articles support one cover image',
      });
      setAttachments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on isArticle change, not attachments
  }, [isArticle]);

  return {
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
  };
}
