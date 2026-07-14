'use client';

import { Container } from '@/atoms/Container/Container';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { isArticleContent } from '@/libs/post/articleContent';
import { cn, isPostDeleted } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { LockedPostCard } from '@/molecules/LockedPostCard/LockedPostCard';
import { PostDeleted } from '@/molecules/PostDeleted/PostDeleted';
import { PostMissing } from '@/molecules/PostMissing/PostMissing';
import { CollectionCard } from '@/organisms/Collections/CollectionCard/CollectionCard';
import { LockContentParser } from '@/pipes/locks/locks.parser';
import { useLocalFilesStore } from '@/stores/localFiles/localFiles.store';
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
  // The announcement's content is the lock teaser envelope ({ lock_title, teaser_description }).
  // Parse once for both detection and the card/body below; null for non-lock posts.
  const lockTeaser = LockContentParser.parse(postDetails.content);
  // TODO:[Locks] #1998 — real detection reads the top-level `lock` URL (the public lock.json),
  // which Nexus/pubky-app-specs will deliver (see NexusPostDetails.lock). Detection is by `lock`
  // presence, not `kind` (which now holds the teaser's real type).
  //
  // TODO:[Locks][MOCK] — REMOVE. Temporary reader trigger for local visual testing while Nexus
  // does not send `.lock`: also treat a post whose content is a lock teaser envelope (non-empty
  // `lock_title`) as a lock post, so the card renders on live Nexus data. Delete `isMockLock` and
  // the `|| isMockLock`, keeping only `!!postDetails.lock`.
  const isMockLock = !!lockTeaser?.lock_title;
  const isLock = !!postDetails.lock || isMockLock;

  if (isDeleted) return <PostDeleted />;

  if (isBlurred) return <PostContentBlurred postId={postId} className={className} />;

  if (isLock)
    return (
      <Container className={cn('min-w-0 gap-3', className)}>
        {/* Teaser body — rendered like a normal post (PostBody), keyed on the teaser description. */}
        <PostBody
          content={lockTeaser?.teaser_description ?? ''}
          attachments={postDetails.attachments}
          localAttachments={localAttachments}
          textClassName={textClassName}
        />
        {/* TODO:[Locks] #2003 — inert card for now; the unlock flow adds interactive props
            (disabled / onUnlock / price) so the viewer can actually unlock. */}
        <LockedPostCard title={lockTeaser?.lock_title ?? ''} />
      </Container>
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
