'use client';

import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { PostContentBase } from '../PostContentBase/PostContentBase';
import type { PostContentOrganismProps } from './PostContent.types';

/**
 * PostContent - Renders post content with repost preview support.
 *
 * **Rendering logic:**
 * - **Regular post**: Renders PostContentBase (text, embeds, attachments)
 * - **Repost with content (quote)**: Renders PostContentBase (quote text) + PostPreviewCard (original post)
 * - **Repost without content (plain repost)**: PostContentBase returns null + PostPreviewCard (original post)
 */
export function PostContent({ postId, className, textClassName }: PostContentOrganismProps) {
  // Get repost information
  const { isRepost, originalPostId } = useRepostInfo(postId);

  // Determine if we should render the repost preview
  const shouldRenderRepostPreview = isRepost && !!originalPostId;

  return (
    <>
      {/* Always render PostContentBase - it's a structural wrapper for content elements */}
      <PostContentBase postId={postId} className={className} textClassName={textClassName} />

      {/* Show original post preview for reposts */}
      {shouldRenderRepostPreview && (
        <PostPreviewCard postId={originalPostId} className={'bg-muted'} contrast="strong" />
      )}
    </>
  );
}
