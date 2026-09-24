'use client';
import { Container } from '@/atoms/Container/Container';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isArticleContent } from '@/libs/post/articleContent';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { PostUnavailable } from '@/molecules/PostUnavailable/PostUnavailable';
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
export function PostContentBase({ postId, className, textClassName, mediaVariant = 'default' }: PostContentBaseProps) {
  const localAttachments = useLocalFilesStore((s) => s.posts[postId]);

  // Fetch post details for content
  const { postDetails, isLoading } = usePostDetails(postId);

  if (!postDetails) {
    // `undefined`/in-flight → skeleton; a settled `null` means the post 404'd,
    // so show the terminal "not found" message instead of skeletoning forever.
    return isLoading ? <PostContentBaseSkeleton /> : <PostUnavailable message={'Post not found.'} />;
  }

  const isDeleted = isPostDeleted(postDetails.content);
  const hasContent = postDetails.content.trim().length > 0;
  const isBlurred = postDetails.is_blurred;
  const isArticle = postDetails.kind === 'long' && isArticleContent(postDetails.content);
  const hasAttachments = (postDetails.attachments?.length ?? 0) > 0 || (localAttachments?.length ?? 0) > 0;
  const isCollection = postDetails.kind === 'collection';
  // Lock detection is by the top-level `lock` URL (points at the public lock.json), not by `kind`
  // (which now holds the teaser's real type). Nexus delivers `lock` (see NexusPostDetails.lock).
  const isLock = !!postDetails.lock;

  if (isDeleted) return <PostUnavailable message={'This post has been deleted by its author.'} />;

  if (isBlurred) return <PostContentBlurred postId={postId} className={className} />;

  if (isLock)
    return (
      <LockedPostContent
        key={postDetails.lock}
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
    // Embed cards skip their own TTL subscription — the enclosing surface
    // (`PostMain` / `PostPreviewCard`) already subscribes this composite id.
    return <CollectionCard authorPubky={pubky} postId={id} presentation="embed" className={className} />;
  }

  if (!hasContent && !hasAttachments) return null;

  return (
    <Container className={cn('min-w-0 gap-3', className)}>
      <PostBody
        content={postDetails.content}
        attachments={postDetails.attachments}
        localAttachments={localAttachments}
        textClassName={textClassName}
        {...(mediaVariant !== 'default' ? { mediaVariant } : {})}
      />
    </Container>
  );
}
