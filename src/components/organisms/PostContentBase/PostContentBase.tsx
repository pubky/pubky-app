'use client';

import { Container } from '@/atoms/Container/Container';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
import { PostLinkEmbeds } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
import { PostText } from '@/molecules/PostText/PostText';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { PostArticle } from '../PostArticle/PostArticle';
import { PostAttachments } from '../PostAttachments/PostAttachments';
import { PostContentBlurred } from '../PostContentBlurred/PostContentBlurred';
import { PostContentBaseSkeleton } from './PostContentBase.skeleton';
import type { PostContentBaseProps } from './PostContentBase.types';

/**
 * PostContentBase - Base component that renders post content without repost handling.
 * This component is used internally by PostContent and PostPreviewCard.
 * It only renders the content elements: text, link embeds, and attachments.
 */
export function PostContentBase({ postId, className, textClassName, contentLayout = 'default' }: PostContentBaseProps) {
  const localAttachments = useLocalFilesStore((s) => s.posts[postId]);

  // Fetch post details for content
  const { postDetails } = usePostDetails(postId);

  if (!postDetails) {
    return <PostContentBaseSkeleton />;
  }

  const isDeleted = isPostDeleted(postDetails.content);
  const hasContent = postDetails.content.trim().length > 0;
  const isBlurred = postDetails.is_blurred;
  const isArticle = postDetails.kind === 'long';
  const hasAttachments = (postDetails.attachments?.length ?? 0) > 0 || (localAttachments?.length ?? 0) > 0;

  if (isDeleted) return <PostDeleted />;

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

  if (!hasContent && !hasAttachments) return null;

  if (contentLayout === 'media-side' && hasAttachments) {
    if (!hasContent) {
      return (
        <Container className={cn('min-w-0 gap-3', className)}>
          {/* Attachments on this post */}
          <PostAttachments attachments={postDetails.attachments} localAttachments={localAttachments} />
        </Container>
      );
    }

    return (
      <Container display="grid" className={cn('min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_40%]', className)}>
        <Container className="min-w-0 gap-3">
          {/* Post text */}
          {hasContent && <PostText content={postDetails.content} className={textClassName} />}

          {/* Link previews from text */}
          {hasContent && <PostLinkEmbeds content={postDetails.content} />}
        </Container>

        {/* Attachments on this post */}
        <PostAttachments
          attachments={postDetails.attachments}
          localAttachments={localAttachments}
          mediaSize="compact"
        />
      </Container>
    );
  }

  return (
    <Container className={cn('min-w-0 gap-3', className)}>
      {/* Post text */}
      {hasContent && <PostText content={postDetails.content} className={textClassName} />}

      {/* Link previews from text */}
      {hasContent && <PostLinkEmbeds content={postDetails.content} />}

      {/* Attachments on this post */}
      <PostAttachments attachments={postDetails.attachments} localAttachments={localAttachments} />
    </Container>
  );
}
