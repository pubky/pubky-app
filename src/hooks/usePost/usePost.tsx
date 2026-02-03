'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import { PubkyAppPostKind } from 'pubky-app-specs';
import type {
  UsePostReplyOptions,
  UsePostPostOptions,
  UsePostRepostOptions,
  UsePostEditOptions,
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
export function usePost() {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isArticle, setIsArticle] = useState(false);
  const [articleTitle, setArticleTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // selectCurrentUserPubky() throws an error when user is not authenticated;
  // access currentUserPubky directly to get null instead (post actions return early if null)
  const currentUserId = Core.useAuthStore((state) => state.currentUserPubky);
  const { toast } = Molecules.useToast();
  const tToast = useTranslations('toast.post');

  const showErrorToast = (description: string) => {
    toast({
      title: 'Error',
      description,
      className: 'destructive border-destructive bg-destructive text-destructive-foreground',
    });
  };

  const showSuccessToast = (title: string, description: string) => {
    toast({
      title,
      description,
    });
  };

  const reply = async ({ postId, onSuccess }: UsePostReplyOptions) => {
    // allow empty content and attachments
    if ((!content.trim() && attachments.length === 0) || !postId || !currentUserId) return;

    setIsSubmitting(true);

    try {
      const createdPostId = await Core.PostController.commitCreate({
        parentPostId: postId,
        content: content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setContent('');
      setTags([]);
      setAttachments([]);
      showSuccessToast('Reply posted', 'Your reply has been posted successfully.');
      onSuccess?.(createdPostId);
    } catch (err) {
      Libs.Logger.error('[usePost] Failed to submit reply:', err);
      showErrorToast('Failed to post reply. Please try again.');
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
      const createdPostId = await Core.PostController.commitCreate({
        content: isArticle ? JSON.stringify({ title: articleTitle.trim(), body: content.trim() }) : content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        kind: isArticle ? PubkyAppPostKind.Long : PubkyAppPostKind.Short,
      });
      setContent('');
      setTags([]);
      setAttachments([]);
      setIsArticle(false);
      setArticleTitle('');
      showSuccessToast('Post created', 'Your post has been created successfully.');
      onSuccess?.(createdPostId);
    } catch (err) {
      Libs.Logger.error('[usePost] Failed to create post:', err);
      showErrorToast('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const repost = async ({ originalPostId, originalAuthorName, onSuccess, onUndo }: UsePostRepostOptions) => {
    if (!originalPostId || !currentUserId) return;

    setIsSubmitting(true);

    try {
      const createdPostId = await Core.PostController.commitCreate({
        originalPostId,
        content: content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
      });
      setContent('');
      setTags([]);

      const toastInstance = toast({
        title: tToast('repostSuccess'),
        description: originalAuthorName
          ? tToast('repostSuccessDesc', { author: originalAuthorName })
          : tToast('repostSuccessDescFallback'),
        action: (
          <Atoms.ToastAction
            altText={tToast('repostUndo')}
            onClick={() => {
              toastInstance.dismiss();
              onUndo(createdPostId);
            }}
          >
            {tToast('repostUndo')}
          </Atoms.ToastAction>
        ),
      });

      onSuccess?.(createdPostId);
    } catch (err) {
      Libs.Logger.error('[usePost] Failed to repost:', err);
      showErrorToast(tToast('repostFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const edit = async ({ editPostId, onSuccess }: UsePostEditOptions) => {
    // requires content if normal edit and title if article
    if (!content.trim() || (isArticle && (!content.trim() || !articleTitle.trim())) || !editPostId || !currentUserId)
      return;

    setIsSubmitting(true);

    try {
      await Core.PostController.commitEdit({
        compositePostId: editPostId,
        content: isArticle ? JSON.stringify({ title: articleTitle.trim(), body: content.trim() }) : content.trim(),
      });
      setContent('');
      setIsArticle(false);
      setArticleTitle('');
      showSuccessToast('Post edited', 'Your post has been edited successfully.');
      onSuccess?.(editPostId);
    } catch (err) {
      Libs.Logger.error('[usePost] Failed to edit post:', err);
      showErrorToast('Failed to edit post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear attachments when switching to article mode
  useEffect(() => {
    if (isArticle && attachments.length > 0) {
      toast({
        title: 'Attachments cleared',
        description: 'Articles support one cover image only.',
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
