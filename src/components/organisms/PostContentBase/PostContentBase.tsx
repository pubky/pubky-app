'use client';
import { Container } from '@/atoms/Container/Container';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isArticleContent } from '@/libs/post/articleContent';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { PostLinkEmbeds } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
import { PostText } from '@/molecules/PostText/PostText';
import { PostUnavailable } from '@/molecules/PostUnavailable/PostUnavailable';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { PostArticle } from '../PostArticle/PostArticle';
import { PostAttachments } from '../PostAttachments/PostAttachments';
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

  if (isDeleted) return <PostUnavailable message={'This post has been deleted by its author.'} />;

  if (isBlurred) return <PostContentBlurred postId={postId} className={className} />;

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

  if (!hasContent && !hasAttachments) return null;

  return (
    <Container className={cn('min-w-0 gap-3', className)}>
      {/* Post text */}
      {hasContent && <PostText content={postDetails.content} className={textClassName} />}

      {/* Link previews from text */}
      {hasContent && <PostLinkEmbeds content={postDetails.content} />}

      {/* Attachments on this post */}
      <PostAttachments
        attachments={postDetails.attachments}
        localAttachments={localAttachments}
        {...(mediaVariant !== 'default' ? { mediaVariant } : {})}
      />
    </Container>
  );
}
