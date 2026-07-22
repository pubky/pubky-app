'use client';

import { Container } from '@/atoms/Container/Container';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isArticleContent } from '@/libs/post/articleContent';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
import { PostMissing } from '@/molecules/PostMissing/PostMissing';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { LockedPostContent } from '../LockedPostContent/LockedPostContent';
import { PostArticle } from '../PostArticle/PostArticle';
import { PostBody } from '../PostBody/PostBody';
import { PostContentBlurred } from '../PostContentBlurred/PostContentBlurred';
import { PostContentBaseSkeleton } from './PostContentBase.skeleton';
import type { PostContentBaseProps } from './PostContentBase.types';

/**
 * PostContentBase - Base component that renders post content without repost handling.
 *
 * Used internally by `PostContent` and `PostPreviewCard`. Renders text, link embeds,
 * and attachments for regular posts; delegates `kind=collection` posts to
 * `CollectionCard` with `presentation="embed"`.
 */
export function PostContentBase({ postId, className, textClassName }: PostContentBaseProps) {
  const localAttachments = useLocalFilesStore((s) => s.posts[postId]);

  // Fetch post details for content
  const { postDetails, isLoading } = usePostDetails(postId);

  if (!postDetails) {
    // `undefined`/in-flight → skeleton; a settled `null` means the post 404'd,
    // so show the terminal "not found" message instead of skeletoning forever.
    return isLoading ? <PostContentBaseSkeleton /> : <PostMissing />;
  }

  const isDeleted = isPostDeleted(postDetails.content);
  const hasContent = postDetails.content.trim().length > 0;
  const isBlurred = postDetails.is_blurred;
  const isArticle = postDetails.kind === 'long' && isArticleContent(postDetails.content);
  const isCollection = postDetails.kind === 'collection';
  // Lock detection is by the top-level `lock` URL (points at the public lock.json), not by `kind`
  // (which now holds the teaser's real type). Nexus delivers `lock` (see NexusPostDetails.lock).
  const isLock = !!postDetails.lock;

  if (isDeleted) return <PostDeleted />;

  if (isBlurred) return <PostContentBlurred postId={postId} className={className} />;

  if (isLock)
    return (
      <LockedPostContent
        content={postDetails.content}
        lock={postDetails.lock}
        authorId={parseCompositeId(postId).pubky}
        attachments={postDetails.attachments}
        localAttachments={localAttachments}
        className={className}
        textClassName={textClassName}
      />
    );

  if (isArticle)
    return (
      <PostArticle
        content={postDetails.content}
        attachments={postDetails.attachments}
        localAttachments={localAttachments}
        className={className}
      />
    );

  if (isCollection) {
    const { pubky, id } = parseCompositeId(postId);
    return <CollectionCard authorPubky={pubky} postId={id} presentation="embed" className={className} />;
  }

  if (!hasContent && !postDetails.attachments?.length && !localAttachments) return null;

  return (
    <Container className={cn('min-w-0 gap-3', className)}>
      <PostBody
        content={postDetails.content}
        attachments={postDetails.attachments}
        localAttachments={localAttachments}
        textClassName={textClassName}
      />
    </Container>
  );
}
