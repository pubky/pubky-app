'use client';

import { useState, useCallback } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { ProfilePageLayoutProps } from './ProfilePageLayout.types';

/**
 * ProfilePageLayout - Presentation component for profile page structure
 *
 * This is a presentation component that receives all data and handlers as props.
 * It has no knowledge of:
 * - Authentication state
 * - Data fetching logic
 * - Business rules
 * - Routing details
 *
 * All intelligence is handled by ProfilePageContainer (the smart component).
 *
 * @example
 * ```tsx
 * <ProfilePageLayout
 *   profile={profileData}
 *   stats={statsData}
 *   actions={actionHandlers}
 *   activePage={activePage}
 *   filterBarActivePage={filterBarActivePage}
 *   navigateToPage={handleNavigate}
 *   isLoading={false}
 *   isOwnProfile={true}
 * >
 *   <ProfileContent />
 * </ProfilePageLayout>
 * ```
 */
export function ProfilePageLayout({
  children,
  profile,
  stats,
  actions,
  activePage,
  filterBarActivePage,
  navigateToPage,
  isLoading,
  isOwnProfile = true,
  userId,
}: ProfilePageLayoutProps) {
  const [isAvatarZoomOpen, setIsAvatarZoomOpen] = useState(false);

  // Stabilize callbacks to prevent unnecessary re-renders in child components
  const handleAvatarClick = useCallback(() => {
    setIsAvatarZoomOpen(true);
  }, []);

  const handleCloseAvatarZoom = useCallback(() => {
    setIsAvatarZoomOpen(false);
  }, []);

  const headerActions = {
    ...actions,
    onAvatarClick: handleAvatarClick,
  };

  return (
    <>
      <Molecules.MobileHeader hasGradientBackground={false} showLeftButton={false} showRightButton={false} />

      <Molecules.ProfilePageMobileMenu
        activePage={activePage}
        onPageChangeAction={navigateToPage}
        isOwnProfile={isOwnProfile}
      />

      <Molecules.ProfilePageLayoutWrapper>
        <Atoms.Container
          overrideDefaults={true}
          className="hidden overflow-hidden bg-background pb-12 shadow-sm lg:block"
        >
          {!isLoading && (
            <Organisms.ProfilePageHeader
              profile={profile}
              actions={headerActions}
              isOwnProfile={isOwnProfile}
              userId={userId}
            />
          )}
        </Atoms.Container>

        <Atoms.Container overrideDefaults={true} className="flex gap-6">
          <Molecules.ProfilePageFilterBar
            activePage={filterBarActivePage}
            onPageChangeAction={navigateToPage}
            stats={stats}
            isOwnProfile={isOwnProfile}
          />

          <Atoms.Container overrideDefaults={true} className="min-w-0 flex-1">
            {children}
          </Atoms.Container>
          <Organisms.ProfilePageSidebar />
        </Atoms.Container>
      </Molecules.ProfilePageLayoutWrapper>

      <Molecules.MobileFooter />

      <Molecules.AvatarZoomModal
        open={isAvatarZoomOpen}
        onClose={handleCloseAvatarZoom}
        avatarUrl={profile.avatarUrl}
        name={profile.name}
      />
    </>
  );
}
