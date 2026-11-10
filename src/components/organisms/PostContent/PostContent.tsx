'use client';

import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { getInteractionPostId } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility.utils';
import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { PostPreviewCard } from '@/molecules/PostPreviewCard/PostPreviewCard';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { PostContentBase } from '../PostContentBase/PostContentBase';
import type { PostContentOrganismProps } from './PostContent.types';

/**
 * PostContent - Renders post content with repost preview support.
 *
 * **Rendering logic:**
 * - **Repost with content (quote)**: PostContentBase (quote text) + PostPreviewCard (original, with
 *   its own tags and actions)
 * - **Repost without content (plain repost)**: PostContentBase returns null + PostPreviewCard, without
 *   a footer: the repost's own footer already acts on the original (`getInteractionPostId`)
 * - **Web link embed**: PostContentBase previews the embedded link in place of the text's first link
 * - **Collection original**: PostPreviewCard renders embed `CollectionCard` (no post shell)
 *
 * The original stands on the embed surface (`bg-embed`), so an external resource inside it stands on
 * the post card's surface again (`ResourceSurfaceProvider` `card`): card, embed, card.
 */
export function PostContent({ postId, className, textClassName, mediaVariant = 'default' }: PostContentOrganismProps) {
  // Get repost information
  const { isRepost, originalPostId, embedUrl } = useRepostInfo(postId);

  // Determine if we should render the repost preview
  const shouldRenderRepostPreview = isRepost && !!originalPostId;
  // A plain repost's own footer already acts on the original, so its preview gets none; decided once the
  // repost is read, so no footer flashes in and out meanwhile.
  const repostVisibility = usePostHeaderVisibility(shouldRenderRepostPreview ? postId : '');
  const { isLoading: isRepostLoading } = usePostDetails(shouldRenderRepostPreview ? postId : null);
  const showOriginalTagsActions =
    !isRepostLoading &&
    repostVisibility.originalPostId !== null &&
    getInteractionPostId(postId, repostVisibility) !== originalPostId;

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
      {shouldRenderRepostPreview && (
        <ResourceSurfaceProvider surface="card">
          <PostPreviewCard postId={originalPostId} className="bg-embed" showTagsActions={showOriginalTagsActions} />
        </ResourceSurfaceProvider>
      )}
    </>
  );
}
