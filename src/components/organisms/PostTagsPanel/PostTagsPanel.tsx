'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { TagKind } from '@/application/tag/tag.types';
import { Container } from '@/atoms/Container/Container';
import { SidebarButton } from '@/atoms/SidebarButton/SidebarButton';
import { useEnrichedTags } from '@/hooks/useEnrichedTags/useEnrichedTags';
import { usePostTags } from '@/hooks/usePostTags/usePostTags';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { TaggedList } from '@/molecules/TaggedList/TaggedList';
import { TagInput } from '@/molecules/TagInput/TagInput';
import type { TagInputHandle } from '@/molecules/TagInput/TagInput.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PostTagsPanelSkeleton } from './PostTagsPanel.skeleton';
import type { PostTagsPanelHandle, PostTagsPanelProps } from './PostTagsPanel.types';

const INITIAL_VISIBLE_TAGS = 3;

/**
 * PostTagsPanel Organism
 *
 * Displays and manages tags for a post.
 * This organism is responsible for:
 * - Fetching and displaying post tags using usePostTags hook
 * - Handling tag add/toggle operations
 * - Managing loading and empty states
 *
 * For unauthenticated users:
 * - TagInput is visible but clicking it opens sign-in dialog
 * - Clicking on tags shows sign-in dialog
 *
 * Uses the same TaggedSection pattern as ProfileTagged but adapted for posts.
 */
export const PostTagsPanel = forwardRef<PostTagsPanelHandle, PostTagsPanelProps>(function PostTagsPanel(
  { postId, widthMode = 'fit', autoFocusInput, enableLoadingSkeleton = true, className },
  ref,
) {
  const t = useTranslations('common');
  const tagInputRef = useRef<TagInputHandle>(null);
  const [isExpanded, setIsExpanded] = useState(widthMode !== 'full');
  useImperativeHandle(ref, () => ({
    focus: () => tagInputRef.current?.focus(),
  }));
  const { tags, isLoading, handleTagAdd, handleTagToggle, hasMore, isLoadingMore, loadMore } = usePostTags(postId);

  // Enrich tags with user details for proper avatar fallbacks
  const { enrichedTags } = useEnrichedTags(tags);

  // Auth requirement for tag actions
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);

  // Wrap tag toggle with auth requirement
  const handleTagToggleWithAuth = (tag: Parameters<typeof handleTagToggle>[0]) => {
    requireAuth(() => handleTagToggle(tag));
  };

  // Wrap tag add with auth requirement
  const handleTagAddWithAuth = (label: string) => {
    return requireAuth(() => handleTagAdd(label));
  };

  // For unauthenticated users, clicking input opens sign-in dialog
  const handleInputClick = !isAuthenticated ? () => setShowSignInDialog(true) : undefined;

  // Show skeleton while fetching initial data
  if (isLoading && enableLoadingSkeleton) {
    return <PostTagsPanelSkeleton className={className} widthMode={widthMode} />;
  }

  // Filter to get only viewer's tags for duplicate checking
  const viewerTags = tags.filter((t) => t.relationship);
  const isCollapsedPreview = widthMode === 'full' && !isExpanded;
  const visibleTags = isCollapsedPreview ? enrichedTags.slice(0, INITIAL_VISIBLE_TAGS) : enrichedTags;
  const showSeeAllButton =
    isCollapsedPreview &&
    tags.length > 0 &&
    (tags.length > INITIAL_VISIBLE_TAGS || (hasMore && tags.length >= INITIAL_VISIBLE_TAGS));
  return (
    <Container data-cy="post-tags-panel" className={cn('gap-2', className)}>
      <Container
        overrideDefaults
        className={cn('flex flex-col gap-2', widthMode === 'fit' ? 'w-fit max-w-full' : 'w-full')}
      >
        {/* TagInput visible for all users - clicking opens sign-in for unauthenticated */}
        <TagInput
          ref={tagInputRef}
          onTagAdd={handleTagAddWithAuth}
          existingTags={tags}
          viewerTags={viewerTags}
          disabled={!isAuthenticated}
          onClick={handleInputClick}
          enableApiSuggestions
          excludeFromApiSuggestions={tags.map((t) => t.label)}
          addOnSuggestionClick
          autoFocus={autoFocusInput}
        />

        {tags.length > 0 && (
          <Container overrideDefaults className="max-h-80 overflow-x-hidden overflow-y-auto pr-1">
            <TaggedList
              tags={visibleTags}
              taggedId={postId}
              taggedKind={TagKind.POST}
              hasMore={isCollapsedPreview ? false : hasMore}
              isLoadingMore={isCollapsedPreview ? false : isLoadingMore}
              onLoadMore={isCollapsedPreview ? undefined : loadMore}
              onTagToggle={handleTagToggleWithAuth}
            />
          </Container>
        )}
        {showSeeAllButton && (
          <SidebarButton
            icon={Tag}
            onClick={() => setIsExpanded(true)}
            data-testid="post-tags-panel-see-all"
            aria-label={t('seeAll')}
          >
            {t('seeAll')}
          </SidebarButton>
        )}
      </Container>
    </Container>
  );
});
