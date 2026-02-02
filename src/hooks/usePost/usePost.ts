'use client';

import { useState, useEffect } from 'react';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import { PubkyAppPostKind } from 'pubky-app-specs';
import type {
  UsePostEditOptions,
  UsePostPostOptions,
  UsePostReplyOptions,
  UsePostRepostOptions,
  UsePostReturn,
} from './usePost.types';

/**
 * Hook for creating and editing posts: replies, reposts, root posts, and edits.
 *
 * @returns UsePostReturn - Content and attachment state, setters, and methods: reply, post, repost, edit. Also isSubmitting.
 *
 * @example
 * ```tsx
 * const { content, setContent, tags, setTags, attachments, setAttachments, reply, post, repost, edit, isSubmitting } = usePost();
 *
 * // Reply to a post
 * await reply({ postId: 'author:postId', onSuccess: (id) => {} });
 *
 * // Repost (quote or with attachments)
 * await repost({ originalPostId: 'author:postId', onSuccess: (id) => {} });
 *
 * // Create root post
 * await post({ onSuccess: (id) => {} });
 *
 * // Edit existing post
 * await edit({ editPostId: 'author:postId', onSuccess: (id) => {} });
 * ```
 */
export function usePost(): UsePostReturn {
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isArticle, setIsArticle] = useState(false);
  const [articleTitle, setArticleTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // selectCurrentUserPubky() throws when not authenticated; use currentUserPubky for null
  const currentUserId = Core.useAuthStore((state) => state.currentUserPubky);
  const { toast } = Molecules.useToast();

  function showErrorToast(description: string) {
    toast({
      title: 'Error',
      description,
      className: 'destructive border-destructive bg-destructive text-destructive-foreground',
    });
  }

  function showSuccessToast(title: string, description: string) {
    toast({
      title,
      description,
    });
  }

  async function reply({ postId, onSuccess }: UsePostReplyOptions) {
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
  }

  async function post({ onSuccess }: UsePostPostOptions) {
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
  }

  async function repost({ originalPostId, onSuccess }: UsePostRepostOptions) {
    if (!originalPostId || !currentUserId) return;

    setIsSubmitting(true);
    try {
      const createdPostId = await Core.PostController.commitCreate({
        originalPostId,
        content: content.trim(),
        authorId: currentUserId,
        tags: tags.length > 0 ? tags : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setContent('');
      setTags([]);
      setAttachments([]);
      showSuccessToast('Repost successful', 'Your repost has been created successfully.');
      onSuccess?.(createdPostId);
    } catch (err) {
      Libs.Logger.error('[usePost] Failed to repost:', err);
      showErrorToast('Failed to repost. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function edit({ editPostId, onSuccess }: UsePostEditOptions) {
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
  }

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
