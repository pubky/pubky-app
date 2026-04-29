'use client';

import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { useIsFollowing } from '@/hooks/useIsFollowing/useIsFollowing';
import { useProfileHeader } from '@/hooks/useProfileHeader/useProfileHeader';
import { useProfileNavigation } from '@/hooks/useProfileNavigation/useProfileNavigation';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { useProfileContext } from '@/providers/ProfileProvider/ProfileProvider';
import { useAuthStore } from '@/stores/auth/auth.store';
export interface ProfilePageContainerProps {
  /** Child pages to render in the main content area */
  children: React.ReactNode;
}

/**
 * ProfilePageContainer - Smart component that handles business logic for profile pages
 *
 * This container is responsible for:
 * - Reading profile context (pubky, isOwnProfile)
 * - Data fetching (profile, stats)
 * - Navigation state (active pages, routing)
 * - Action handlers (edit, copy, sign out, follow, etc.)
 * - Handling user not found state
 *
 * It delegates presentation concerns to ProfilePageLayout, which is a dumb component
 * that only receives props and renders UI.
 *
 * This separation follows the container/presentation pattern:
 * - Container (this): Smart, handles logic, connects to stores/hooks
 * - Presentation (ProfilePageLayout): Dumb, receives props, renders UI
 *
 * @example
 * ```tsx
 * // In app/profile/layout.tsx
 * export default function ProfileLayout({ children }) {
 *   return (
 *     <ProfileProvider>
 *       <ProfilePageContainer>
 *         {children}
 *       </ProfilePageContainer>
 *     </ProfileProvider>
 *   );
 * }
 * ```
 */
export function ProfilePageContainer({ children }: ProfilePageContainerProps) {
  // Business logic: Get profile context (pubky and isOwnProfile)
  const { pubky, isOwnProfile } = useProfileContext();

  // Check if logout is in progress (global state to prevent flash of weird states)
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);

  // Business logic: Fetch profile data and stats
  // Note: useProfileHeader guarantees a non-null profile with default values during loading
  const { profile, stats, actions, isLoading, userNotFound } = useProfileHeader(pubky ?? '');

  // Business logic: Handle navigation state
  const { activePage, filterBarActivePage, navigateToPage } = useProfileNavigation();

  // Business logic: Handle follow/unfollow for other users' profiles (with auth check)
  const { requireAuth } = useRequireAuth();
  const { toggleFollow, isLoading: isFollowLoading, loadingAction: followLoadingAction } = useFollowUser();
  const { isFollowing } = useIsFollowing(pubky ?? '');

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

  // If user was not found (loading complete but no profile), show UserNotFound
  // Skip showing UserNotFound during logout to prevent flash of error state
  if (userNotFound && !isOwnProfile && !isLoggingOut) {
    return (
      <>
        <Molecules.MobileHeader showLeftButton={false} showRightButton={false} />
        <Molecules.ProfilePageLayoutWrapper>
          <Molecules.UserNotFound />
        </Molecules.ProfilePageLayoutWrapper>
        <Molecules.MobileFooter />
      </>
    );
  }

  // Delegate presentation to layout organism
  return (
    <Organisms.ProfilePageLayout
      profile={profile}
      stats={stats}
      actions={mergedActions}
      activePage={activePage}
      filterBarActivePage={filterBarActivePage}
      navigateToPage={navigateToPage}
      isLoading={isLoading}
      isOwnProfile={isOwnProfile}
      userId={pubky ?? ''}
    >
      {children}
    </Organisms.ProfilePageLayout>
  );
}
