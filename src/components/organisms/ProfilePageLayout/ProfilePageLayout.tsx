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

const PROFILE_MOBILE_MENU_SELECTOR = '[data-testid="profile-page-mobile-menu"]';
const DEFAULT_MOBILE_HEADER_HEIGHT = 80;

function getMobilePostsFeedScrollOffset(): number {
  if (typeof document === 'undefined') {
    return DEFAULT_MOBILE_HEADER_HEIGHT;
  }

  const mobileMenu = document.querySelector<HTMLElement>(PROFILE_MOBILE_MENU_SELECTOR);
  const mobileMenuBottom = mobileMenu?.getBoundingClientRect().bottom ?? 0;

  if (mobileMenuBottom > 0) {
    return mobileMenuBottom;
  }

  const configuredHeaderHeight = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--header-height-mobile');
  return Number.parseFloat(configuredHeaderHeight) || DEFAULT_MOBILE_HEADER_HEIGHT;
}

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
  const isMobile = useIsMobile();
  const mobilePostsProfileHeaderRef = useRef<HTMLDivElement>(null);
  const postsFeedRef = useRef<HTMLDivElement>(null);
  const lastAutoScrolledPostsKeyRef = useRef<string | null>(null);
  const showMobilePostsProfileHeader = !isOwnProfile && activePage === PROFILE_PAGE_TYPES.POSTS;
  const shouldAutoScrollToPostsFeed = showMobilePostsProfileHeader && isMobile && !isLoading;
  const postsFeedScrollKey = userId;

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

  useLayoutEffect(() => {
    if (!shouldAutoScrollToPostsFeed) {
      if (activePage !== PROFILE_PAGE_TYPES.POSTS || isOwnProfile) {
        lastAutoScrolledPostsKeyRef.current = null;
      }
      return;
    }

    if (lastAutoScrolledPostsKeyRef.current === postsFeedScrollKey) {
      return;
    }

    // Other-user mobile profiles render profile info above posts, but the canonical posts route should land at the feed after layout settles.
    let isAligned = false;
    let resizeObserver: ResizeObserver | null = null;
    let pendingAnimationFrameId: number | null = null;
    const observedElements = [mobilePostsProfileHeaderRef.current, postsFeedRef.current].filter(
      (element): element is HTMLDivElement => Boolean(element),
    );

    const stopObserving = () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
    };

    const alignPostsFeed = () => {
      pendingAnimationFrameId = null;
      if (isAligned) {
        return;
      }

      const postsFeed = postsFeedRef.current;
      if (!postsFeed) {
        return;
      }

      const scrollDelta = postsFeed.getBoundingClientRect().top - getMobilePostsFeedScrollOffset();

      if (Math.abs(scrollDelta) > 1) {
        window.scrollBy({ top: scrollDelta, behavior: 'auto' });
      }

      const remainingScrollDelta = postsFeed.getBoundingClientRect().top - getMobilePostsFeedScrollOffset();
      if (Math.abs(remainingScrollDelta) <= 1) {
        isAligned = true;
        lastAutoScrolledPostsKeyRef.current = postsFeedScrollKey;
        stopObserving();
      }
    };

    const animationFrameIds: number[] = [];
    const scheduleAlignment = () => {
      if (isAligned || pendingAnimationFrameId !== null) {
        return;
      }

      const animationFrameId = window.requestAnimationFrame(alignPostsFeed);
      pendingAnimationFrameId = animationFrameId;
      animationFrameIds.push(animationFrameId);
    };

    if (observedElements.length > 0 && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleAlignment();
      });
      observedElements.forEach((element) => resizeObserver?.observe(element));
    }

    scheduleAlignment();

    return () => {
      animationFrameIds.forEach((animationFrameId) => window.cancelAnimationFrame(animationFrameId));
      stopObserving();
    };
  }, [activePage, isOwnProfile, postsFeedScrollKey, shouldAutoScrollToPostsFeed]);

  return (
    <>
      <MobileHeader hasGradientBackground={false} showLeftButton={false} showRightButton={false} />

      <ProfilePageMobileMenu activePage={activePage} onPageChangeAction={navigateToPage} isOwnProfile={isOwnProfile} />

      <ProfilePageLayoutWrapper>
        <Container overrideDefaults={true} className="hidden overflow-hidden bg-background pb-12 shadow-sm lg:block">
          {!isLoading && (
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
            {showMobilePostsProfileHeader && !isLoading && (
              <Container
                ref={mobilePostsProfileHeaderRef}
                overrideDefaults={true}
                className="mb-6 flex min-w-0 flex-col overflow-hidden lg:hidden"
              >
                <ProfilePageHeader
                  profile={profile}
                  actions={headerActions}
                  isOwnProfile={isOwnProfile}
                  userId={userId}
                  stats={stats}
                />
              </Container>
            )}

            {showMobilePostsProfileHeader ? (
              <Container
                ref={postsFeedRef}
                data-cy="profile-posts-feed"
                overrideDefaults={true}
                className="min-h-[calc(100dvh_-_var(--header-height-mobile))] min-w-0 lg:contents"
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
