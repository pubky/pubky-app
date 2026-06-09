'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { PROFILE_PAGE_TYPES } from '@/app/profile/types';
import { Container } from '@/atoms/Container/Container';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
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
  isHeaderLoading,
  isOwnProfile = true,
  userId,
}: ProfilePageLayoutProps) {
  const [isAvatarZoomOpen, setIsAvatarZoomOpen] = useState(false);
  const isMobile = useIsMobile();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const postsFeedRef = useRef<HTMLDivElement>(null);
  const lastAutoScrolledPostsKeyRef = useRef<string | null>(null);
  const lastTopResetKeyRef = useRef<string | null>(null);
  const showMobilePostsProfileHeader = !isOwnProfile && activePage === PROFILE_PAGE_TYPES.POSTS;
  const shouldAutoScrollToPostsFeed = showMobilePostsProfileHeader && isMobile && !isLoading;
  const profileHeaderWrapperClassName = showMobilePostsProfileHeader
    ? 'mb-6 flex min-w-0 flex-col overflow-hidden bg-transparent pb-0 shadow-none lg:mb-0 lg:block lg:bg-background lg:pb-12 lg:shadow-sm'
    : 'hidden overflow-hidden bg-background pb-12 shadow-sm lg:block';

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

  const headerLoading = isHeaderLoading ?? isLoading;

  // Other-user mobile profiles render profile info above posts, but the canonical posts route should land at the feed.
  // The browser handles the scroll math via `scrollIntoView` + `scroll-margin-top`; we only need to seed `scroll-margin-top`
  // with the sticky mobile menu's current bottom so the feed lands flush under it.
  useLayoutEffect(() => {
    if (!shouldAutoScrollToPostsFeed) {
      lastAutoScrolledPostsKeyRef.current = null;
      return;
    }

    if (lastAutoScrolledPostsKeyRef.current === userId) {
      return;
    }

    const postsFeed = postsFeedRef.current;
    if (!postsFeed) {
      return;
    }

    const stickyOffset = mobileMenuRef.current?.getBoundingClientRect().bottom ?? 0;
    if (stickyOffset > 0) {
      postsFeed.style.scrollMarginTop = `${stickyOffset}px`;
    }

    postsFeed.scrollIntoView({ block: 'start', behavior: 'auto' });
    lastAutoScrolledPostsKeyRef.current = userId;
  }, [shouldAutoScrollToPostsFeed, userId]);

  useLayoutEffect(() => {
    if (!isMobile || isLoading || activePage === PROFILE_PAGE_TYPES.POSTS) {
      lastTopResetKeyRef.current = null;
      return;
    }

    const topResetKey = `${userId}:${activePage}`;
    if (lastTopResetKeyRef.current === topResetKey) {
      return;
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
    lastTopResetKeyRef.current = topResetKey;
  }, [activePage, isLoading, isMobile, userId]);

  return (
    <>
      <MobileHeader
        containerClassName="pb-0"
        hasGradientBackground={false}
        showLeftButton={false}
        showRightButton={false}
      />

      <ProfilePageMobileMenu
        ref={mobileMenuRef}
        activePage={activePage}
        onPageChangeAction={navigateToPage}
        isOwnProfile={isOwnProfile}
      />

      <ProfilePageLayoutWrapper>
        <Container overrideDefaults={true} className={profileHeaderWrapperClassName}>
          {!headerLoading && (
            <ProfilePageHeader
              profile={profile}
              actions={headerActions}
              isOwnProfile={isOwnProfile}
              userId={userId}
              stats={stats}
            />
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
            {showMobilePostsProfileHeader ? (
              <Container
                ref={postsFeedRef}
                data-cy="profile-posts-feed"
                overrideDefaults={true}
                className="min-h-[calc(100dvh-var(--header-height-mobile))] min-w-0 lg:contents"
              >
                {children}
              </Container>
            ) : (
              children
            )}
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
