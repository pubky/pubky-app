'use client';

import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { PostContentBase } from '../PostContentBase/PostContentBase';
import type { PostContentOrganismProps } from './PostContent.types';

/**
 * PostContent - Renders post content with repost preview support.
 *
 * **Rendering logic:**
 * - **Repost with content (quote)**: PostContentBase (quote text) + PostPreviewCard (original)
 * - **Repost without content (plain repost)**: PostContentBase returns null + PostPreviewCard
 * - **Web link embed**: PostContentBase previews the embedded link in place of the text's first link
 * - **Collection original**: PostPreviewCard renders embed `CollectionCard` (no post shell)
 */
export function PostContent({ postId, className, textClassName, mediaVariant = 'default' }: PostContentOrganismProps) {
  // Get repost information
  const { isRepost, originalPostId, embedUrl } = useRepostInfo(postId);

  // Determine if we should render the repost preview
  const shouldRenderRepostPreview = isRepost && !!originalPostId;

  return (
    <>
      {/* Always render PostContentBase - it's a structural wrapper for content elements */}
      <PostContentBase
        postId={postId}
        className={className}
        textClassName={textClassName}
        mediaVariant={mediaVariant}
        embedUrl={embedUrl}
      />

      {/* Show original post preview for reposts */}
      {shouldRenderRepostPreview && <PostPreviewCard postId={originalPostId} className="bg-embed" />}
    </>
  );
}
