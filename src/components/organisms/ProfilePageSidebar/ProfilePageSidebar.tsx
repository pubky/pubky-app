'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import * as Providers from '@/providers';
import * as Config from '@/config';
import { MAX_SIDEBAR_TAGS } from './ProfilePageSidebar.constants';
import { cn } from '@/libs/utils/utils';

export function ProfilePageSidebar() {
  const pathname = usePathname();
  const { isAuthenticated, requireAuth } = Hooks.useRequireAuth();

  // Get the profile pubky and isOwnProfile from context
  const { pubky, isOwnProfile } = Providers.useProfileContext();

  // Get user profile data for the target user
  const { profile } = Hooks.useUserProfile(pubky ?? '');

  const {
    tags,
    isLoading: isLoadingTags,
    handleTagToggle,
  } = Hooks.useTagged(pubky, {
    enablePagination: false,
    enableStats: false,
  });

  // Show only top 5 most popular tags (sorted by taggers_count)
  const topTags = useMemo(() => {
    return [...tags].sort((a, b) => (b.taggers_count ?? 0) - (a.taggers_count ?? 0)).slice(0, MAX_SIDEBAR_TAGS);
  }, [tags]);

  const isTaggedPage = pathname?.endsWith('/tagged');

  // Only apply sticky when content fits in viewport
  const { ref, stickyTop } = Hooks.useStickyWhenFits({
    topOffset: Config.LAYOUT.HEADER_HEIGHT_PROFILE,
    bottomOffset: Config.LAYOUT.SIDEBAR_BOTTOM_OFFSET,
  });

  // Handle tag click - require auth for unauthenticated users
  const handleTagClick = (tag: Parameters<typeof handleTagToggle>[0]) => {
    requireAuth(() => handleTagToggle(tag));
  };

  return (
    <Atoms.Container
      ref={ref}
      overrideDefaults={true}
      className={cn('hidden w-(--filter-bar-width) flex-col gap-6 self-start lg:flex', 'sticky')}
      style={{ top: `${stickyTop}px` }}
    >
      {!isTaggedPage && (
        <Molecules.ProfilePageTaggedAs
          tags={topTags}
          isLoading={isLoadingTags}
          onTagClick={handleTagClick}
          pubky={pubky ?? ''}
        />
      )}
      <Molecules.ProfilePageLinks links={profile?.links} isOwnProfile={isOwnProfile} />
      {isAuthenticated && <Organisms.FeedbackCard />}
    </Atoms.Container>
  );
}
