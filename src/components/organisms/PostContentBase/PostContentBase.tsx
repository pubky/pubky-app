'use client';

import { Container } from '@/atoms/Container/Container';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
import { PostMissing } from '@/molecules/PostMissing/PostMissing';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
import { PostArticle } from '../PostArticle/PostArticle';
import { PostBody } from '../PostBody/PostBody';
import { PostContentBlurred } from '../PostContentBlurred/PostContentBlurred';
import { PostContentLock } from '../PostContentLock/PostContentLock';
import { PostContentBaseSkeleton } from './PostContentBase.skeleton';
import type { PostContentBaseProps } from './PostContentBase.types';

/**
 * PostContentBase - Base component that renders post content without repost handling.
 * This component is used internally by PostContent and PostPreviewCard.
 * It only renders the content elements: text, link embeds, and attachments.
 */
export function PostContentBase({ postId, className, textClassName, contrast }: PostContentBaseProps) {
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
  const isArticle = postDetails.kind === 'long';
  const isCollection = postDetails.kind === 'collection';
  // TODO:[Locks] #1998 — detection reads the top-level `lock` URL (points at the public
  // lock.json), which is mock-only today; Nexus/pubky-app-specs will deliver it for real
  // (see NexusPostDetails.lock). Confirm the real `.lock` lands, then remove this note.
  // Detection is by `lock` presence, not `kind` (which now holds the teaser's real type).
  const isLock = !!postDetails.lock;

  if (isDeleted) return <PostDeleted />;

  if (isBlurred) return <PostContentBlurred postId={postId} className={className} />;

  if (isLock)
    return (
      <PostContentLock
        content={postDetails.content}
        lock={postDetails.lock}
        attachments={postDetails.attachments}
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
    return (
      <CollectionCard authorPubky={pubky} postId={id} variant="preview" contrast={contrast} className={className} />
    );
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
