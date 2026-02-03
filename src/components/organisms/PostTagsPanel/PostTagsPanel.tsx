'use client';

import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Libs from '@/libs';
import * as Core from '@/core';
import type { PostTagsPanelProps } from './PostTagsPanel.types';

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
export function PostTagsPanel({ postId, className }: PostTagsPanelProps) {
  const t = useTranslations('common');
  const { tags, isLoading, handleTagAdd, handleTagToggle, hasMore, isLoadingMore, loadMore } =
    Hooks.usePostTags(postId);

  // Collect all unique tagger IDs from tags for bulk user details lookup
  const allTaggerIds = (() => {
    const ids = new Set<Core.Pubky>();
    for (const tag of tags) {
      for (const tagger of tag.taggers) {
        ids.add(tagger.id);
      }
    }
    return Array.from(ids);
  })();

  // Get user details (name, avatarUrl) for all taggers
  const { usersMap, isLoading: isLoadingUsers } = Hooks.useBulkUserAvatars(allTaggerIds);

  // Enrich tags with user details for proper avatar fallbacks
  const enrichedTags = tags.map((tag) => ({
    ...tag,
    taggers: tag.taggers.map((tagger) => {
      const userDetails = usersMap.get(tagger.id);
      return {
        ...tagger,
        name: userDetails?.name ?? tagger.name,
        // During loading: use existing avatarUrl (prevents flash for users with avatars)
        // After loading: use verified avatarUrl (undefined if user has no avatar)
        avatarUrl: isLoadingUsers ? tagger.avatarUrl : userDetails?.avatarUrl,
      };
    }),
  }));

  // Auth requirement for tag actions
  const { isAuthenticated, requireAuth } = Hooks.useRequireAuth();
  const setShowSignInDialog = Core.useAuthStore((state) => state.setShowSignInDialog);

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

  // Show loading state while fetching initial data
  if (isLoading) {
    return (
      <Atoms.Container className={Libs.cn('flex items-center justify-center gap-3', className)}>
        <Atoms.Spinner size="md" />
        <Atoms.Typography as="p" className="text-muted-foreground">
          {t('loadingTags')}
        </Atoms.Typography>
      </Atoms.Container>
    );
  }

  // Filter to get only viewer's tags for duplicate checking
  const viewerTags = tags.filter((t) => t.relationship);

  return (
    <Atoms.Container data-cy="post-tags-panel" className={Libs.cn('gap-2', className)}>
      {/* TagInput visible for all users - clicking opens sign-in for unauthenticated */}
      <Molecules.TagInput
        onTagAdd={handleTagAddWithAuth}
        existingTags={tags}
        viewerTags={viewerTags}
        disabled={!isAuthenticated}
        onClick={handleInputClick}
        enableApiSuggestions
        excludeFromApiSuggestions={tags.map((t) => t.label)}
        addOnSuggestionClick
      />

      {tags.length > 0 && (
        <Atoms.Container overrideDefaults className="max-h-80 overflow-x-hidden overflow-y-auto pr-1">
          <Molecules.TaggedList
            tags={enrichedTags}
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            onTagToggle={handleTagToggleWithAuth}
          />
        </Atoms.Container>
      )}
    </Atoms.Container>
  );
}
