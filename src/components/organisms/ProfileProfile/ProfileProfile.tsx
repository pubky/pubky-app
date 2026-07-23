'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import { useProfileHeader } from '@/hooks/useProfileHeader/useProfileHeader';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useTagged } from '@/hooks/useTagged/useTagged';
import { ProfilePageLinks } from '@/molecules/ProfilePageLinks/ProfilePageLinks';
import { ProfilePageTaggedAs } from '@/molecules/ProfilePageTaggedAs/ProfilePageTaggedAs';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { ProfilePageHeader } from '../ProfilePageHeader/ProfilePageHeader';
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
  const { pubky, isOwnProfile } = useProfileContext();

  // Note: useProfileHeader guarantees a non-null profile with default values during loading
  const { profile, stats, actions, isProfileLoading } = useProfileHeader(pubky ?? '');

  // Handle follow/unfollow for other users' profiles (with auth check)
  const { requireAuth } = useRequireAuth();
  const { toggleFollow, isLoading: isFollowLoading, loadingAction: followLoadingAction } = useFollowUser();
  const { isFollowing } = useIsFollowing(pubky ?? '');

  // Get tags for the user
  const {
    tags: allTags,
    isLoading: isLoadingTags,
    handleTagToggle,
  } = useTagged(pubky, {
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
      await toggleFollow(pubky, isFollowing, profile.name);
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
    <Container overrideDefaults={true} className="flex min-w-0 flex-col gap-6 overflow-hidden lg:hidden">
      {!isProfileLoading && (
        <ProfilePageHeader
          profile={profile}
          actions={mergedActions}
          isOwnProfile={isOwnProfile}
          userId={pubky ?? ''}
          stats={stats}
        />
      )}

      {/* Tagged as section */}
      <ProfilePageTaggedAs tags={tags} isLoading={isLoadingTags} onTagClick={handleTagToggle} pubky={pubky ?? ''} />

      {/* Links section */}
      <ProfilePageLinks links={profile?.links} isOwnProfile={isOwnProfile} />
    </Container>
  );
}
