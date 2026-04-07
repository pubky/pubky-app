'use client';

import * as Molecules from '@/molecules';

import * as Hooks from '@/hooks';
import * as Organisms from '@/organisms';
import type { PostContentOrganismProps } from './PostContent.types';

/**
 * PostContent - Renders post content with repost preview support.
 *
 * **Rendering logic:**
 * - **Regular post**: Renders PostContentBase (text, embeds, attachments)
 * - **Repost with content (quote)**: Renders PostContentBase (quote text) + PostPreviewCard (original post)
 * - **Repost without content (plain repost)**: PostContentBase returns null + PostPreviewCard (original post)
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
      {shouldRenderRepostPreview && <Molecules.PostPreviewCard postId={originalPostId} className={'bg-muted'} />}
    </>
  );
}
