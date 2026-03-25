'use client';

import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Providers from '@/providers';
import { ProfilePageHeader } from '@/organisms';
import { MAX_SIDEBAR_TAGS } from '../ProfilePageSidebar/ProfilePageSidebar.constants';

/**
 * ProfileProfile
 *
 * Displays the user's profile page for mobile view.
 * Shows profile header, tagged section, and links.
 * Uses ProfileContext to get the target user's pubky.
 */
export function ProfileProfile() {
  // Get the profile pubky and isOwnProfile from context
  const { pubky, isOwnProfile } = Providers.useProfileContext();

  // Note: useProfileHeader guarantees a non-null profile with default values during loading
  const { profile, actions, isLoading } = Hooks.useProfileHeader(pubky ?? '');

  // Handle follow/unfollow for other users' profiles (with auth check)
  const { requireAuth } = Hooks.useRequireAuth();
  const { toggleFollow, isLoading: isFollowLoading, loadingAction: followLoadingAction } = Hooks.useFollowUser();
  const { isFollowing } = Hooks.useIsFollowing(pubky ?? '');

  // Get tags for the user
  const {
    tags: allTags,
    isLoading: isLoadingTags,
    handleTagToggle,
  } = Hooks.useTagged(pubky, {
    enablePagination: false,
    enableStats: false,
  });

  // Show only top 3 most popular tags (sorted by taggers_count)
  const tags = React.useMemo(() => {
    return [...allTags].sort((a, b) => (b.taggers_count ?? 0) - (a.taggers_count ?? 0)).slice(0, MAX_SIDEBAR_TAGS);
  }, [allTags]);

  const handleFollowToggle = () => {
    if (!pubky) return;
    requireAuth(async () => {
      await toggleFollow(pubky, isFollowing);
    });
  };

  const mergedActions = {
    ...actions,
    onFollowToggle: handleFollowToggle,
    isFollowLoading,
    followLoadingAction,
    isFollowing,
  };

  return (
    <Atoms.Container
      overrideDefaults={true}
      className="mt-6 flex min-w-0 flex-col gap-6 overflow-hidden lg:mt-0 lg:hidden"
    >
      {!isLoading && (
        <ProfilePageHeader profile={profile} actions={mergedActions} isOwnProfile={isOwnProfile} userId={pubky ?? ''} />
      )}

      {/* Tagged as section */}
      <Molecules.ProfilePageTaggedAs
        tags={tags}
        isLoading={isLoadingTags}
        onTagClick={handleTagToggle}
        pubky={pubky ?? ''}
      />

      {/* Links section */}
      <Molecules.ProfilePageLinks links={profile?.links} isOwnProfile={isOwnProfile} />
    </Atoms.Container>
  );
}
