'use client';

import * as Molecules from '@/molecules';
import * as Libs from '@/libs';
import * as Hooks from '@/hooks';
import * as Organisms from '@/organisms';
import type { PostContentOrganismProps } from './PostContent.types';

/**
 * PostContent - Renders post content with repost preview support.
 *
 * **Rendering logic:**
 * - **Regular post**: Renders PostContentBase (text, embeds, attachments)
 * - **Repost with content (quote)**: Renders PostContentBase (quote text) + PostPreviewCard (original post)
 * - **Repost without content (plain repost)**: Renders PostContentBase (empty wrapper, may have attachments) + PostPreviewCard (original post)
 *
 * PostContentBase is always rendered as it's a structural wrapper that maintains layout
 * and handles attachments even when there's no text content.
 */
export function PostContent({ postId, className }: PostContentOrganismProps) {
  // Get repost information
  const { isRepost, originalPostId } = Hooks.useRepostInfo(postId);

  // Determine if we should render the repost preview
  const shouldRenderRepostPreview = isRepost && !!originalPostId;

  return (
    <>
      {/* Always render PostContentBase - it's a structural wrapper for content elements */}
      <Organisms.PostContentBase postId={postId} className={className} />

      {/* Show original post preview for reposts */}
      {shouldRenderRepostPreview && (
        <Molecules.PostPreviewCard postId={originalPostId} className={Libs.cn('bg-muted')} />
      )}
    </>
  );
}
