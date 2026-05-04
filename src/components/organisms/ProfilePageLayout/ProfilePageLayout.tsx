'use client';

import { useState, useCallback } from 'react';
import { Container } from '@/atoms/Container/Container';
import { AvatarZoomModal } from '@/molecules/AvatarZoomModal/AvatarZoomModal';
import { MobileFooter } from '@/molecules/MobileFooter/MobileFooter';
import { MobileHeader } from '@/molecules/MobileHeader/MobileHeader';
import { ProfilePageFilterBar } from '@/molecules/ProfilePageFilterBar/ProfilePageFilterBar';
import { ProfilePageLayoutWrapper } from '@/molecules/ProfilePageLayoutWrapper/ProfilePageLayoutWrapper';
import { ProfilePageMobileMenu } from '@/molecules/ProfilePageMobileMenu/ProfilePageMobileMenu';
import { ProfilePageHeader } from '../ProfilePageHeader/ProfilePageHeader';
import { ProfilePageSidebar } from '../ProfilePageSidebar/ProfilePageSidebar';

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
      <MobileHeader hasGradientBackground={false} showLeftButton={false} showRightButton={false} />

      <ProfilePageMobileMenu activePage={activePage} onPageChangeAction={navigateToPage} isOwnProfile={isOwnProfile} />

      <ProfilePageLayoutWrapper>
        <Container overrideDefaults={true} className="hidden overflow-hidden bg-background pb-12 shadow-sm lg:block">
          {!isLoading && (
            <ProfilePageHeader profile={profile} actions={headerActions} isOwnProfile={isOwnProfile} userId={userId} />
          )}
        </Container>

        <Container overrideDefaults={true} className="flex gap-6">
          <ProfilePageFilterBar
            activePage={filterBarActivePage}
            onPageChangeAction={navigateToPage}
            stats={stats}
            isOwnProfile={isOwnProfile}
          />

          <Container data-cy="profile-tab-content" overrideDefaults={true} className="min-w-0 flex-1">
            {children}
          </Container>
          <ProfilePageSidebar />
        </Container>
      </ProfilePageLayoutWrapper>

      <MobileFooter />

      <AvatarZoomModal
        open={isAvatarZoomOpen}
        onClose={handleCloseAvatarZoom}
        avatarUrl={profile.avatarUrl}
        name={profile.name}
        fallbackSeed={userId}
      />
    </>
  );
}
