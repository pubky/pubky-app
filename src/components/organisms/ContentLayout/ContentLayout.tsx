'use client';

import { useEffect, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { LAYOUT_DIMENSIONS } from '@/config/layoutDimensions';
import { useCustomFeed } from '@/hooks/useCustomFeed/useCustomFeed';
import { resolveFeedLayout } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { cn } from '@/libs/utils/utils';
import { ButtonFilters } from '@/molecules/ButtonFilters/ButtonFilters';
import { MobileFooter } from '@/molecules/MobileFooter/MobileFooter';
import { MobileHeader } from '@/molecules/MobileHeader/MobileHeader';
import { SideDrawer } from '@/molecules/SideDrawer/SideDrawer';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { pubkyLayoutToHomeLayout } from '@/utils/pubky-app-spec-feed-mappers';
import type { ContentLayoutProps, StickySidebarProps } from './ContentLayout.types';

// NOTE: For the feed cluster (`/home`, `/feed/[id]`, `/search`),
// `ContentLayout` is rendered once by `app/(feeds)/layout.tsx` so that the shell
// (sidebars, mobile header, drawers, layout-resolution state) persists across
// intra-cluster navigation. The per-route shell props for those routes live in
// `app/(feeds)/_shell/configs.tsx`. Other routes (e.g. `/hot`, `/who-to-follow`,
// `/settings`, `/profile`, `/share`) continue to render `ContentLayout` per-page
// from their templates. `/post/[userId]/[postId]` uses `PostPageShell` from
// `app/post/[userId]/[postId]/layout.tsx` (and `SinglePost` for the intercept).

/**
 * Reusable sticky sidebar component for left and right sidebars
 * Sidebars stay pinned below the main header and scroll independently
 * from the center column when viewport height is limited.
 */
function StickySidebar({ children }: StickySidebarProps) {
  const stickyTop = LAYOUT_DIMENSIONS.HEADER_OFFSET_MAIN;
  const sidebarMaxHeight = `calc(100svh - ${stickyTop}px)`;

  return (
    <Container
      overrideDefaults
      className={cn(
        'hidden flex-col items-start justify-start gap-6 self-start lg:flex',
        'w-(--filter-bar-width) max-w-(--filter-bar-width) min-w-(--filter-bar-width) shrink-0',
        'sticky overflow-x-hidden overflow-y-auto overscroll-contain',
      )}
      style={{ top: `${stickyTop}px`, maxHeight: sidebarMaxHeight }}
    >
      {children}
    </Container>
  );
}

export function ContentLayout({
  children,
  leftSidebarContent,
  rightSidebarContent,
  leftDrawerContent,
  rightDrawerContent,
  leftDrawerContentMobile,
  rightDrawerContentMobile,
  showLeftSidebar = true,
  showRightSidebar = true,
  showLeftMobileButton = true,
  showRightMobileButton = true,
  renderMobileHeader = true,
  hasGradientBackground,
  className,
  classNameWrapperContent,
  classNameMobileHeader,
  feedVariant,
  layoutOverride,
  disableWideShellLayout,
}: ContentLayoutProps) {
  const { layout: homeLayout } = useHomeStore();
  const customFeed = useCustomFeed();
  const customFeedLayout =
    feedVariant === TIMELINE_FEED_VARIANT.CUSTOM && customFeed?.layout !== undefined
      ? pubkyLayoutToHomeLayout(customFeed.layout)
      : undefined;
  const requestedLayout = layoutOverride ?? customFeedLayout ?? homeLayout;

  const [drawerFilterOpen, setDrawerFilterOpen] = useState(false);
  const [drawerRightOpen, setDrawerRightOpen] = useState(false);
  const isMobile = useIsMobile();
  const isPhoneViewport = useIsMobile({ breakpoint: 'md' });
  const { effectiveLayout } = feedVariant
    ? resolveFeedLayout({
        requestedLayout,
        variant: feedVariant,
        isPhoneViewport,
      })
    : {
        effectiveLayout: requestedLayout,
      };
  const usesWideShellLayout =
    ((effectiveLayout === LAYOUT.WIDE || effectiveLayout === LAYOUT.LIST) && !disableWideShellLayout) ||
    (feedVariant !== undefined && effectiveLayout === LAYOUT.VISUAL);

  // Close drawers when switching from wide-shell to inline sidebars on desktop
  // This prevents the drawer from staying open when sidebars become visible inline
  useEffect(() => {
    if (!isMobile && !usesWideShellLayout) {
      setDrawerFilterOpen(false);
      setDrawerRightOpen(false);
    }
  }, [isMobile, usesWideShellLayout]);

  return (
    <>
      {/* Mobile header with drawer icons - hidden on desktop */}
      {renderMobileHeader && (
        <MobileHeader
          onLeftIconClick={showLeftMobileButton ? () => setDrawerFilterOpen(true) : undefined}
          onRightIconClick={showRightMobileButton ? () => setDrawerRightOpen(true) : undefined}
          showLeftButton={showLeftMobileButton}
          showRightButton={showRightMobileButton}
          hasGradientBackground={hasGradientBackground}
          containerClassName={classNameMobileHeader}
        />
      )}

      {/* Buttons to open drawers - visible on desktop when using the wide shell */}
      {usesWideShellLayout && showLeftSidebar && leftDrawerContent && (
        <ButtonFilters onClick={() => setDrawerFilterOpen(true)} position="left" />
      )}
      {usesWideShellLayout && showRightSidebar && rightDrawerContent && (
        <ButtonFilters onClick={() => setDrawerRightOpen(true)} position="right" />
      )}

      {/* Main content grid with responsive max-widths */}
      <Container
        overrideDefaults
        className={cn('container max-w-(--container-max-width)', 'm-auto w-full px-6 pb-12 xl:px-0', 'pt-0', className)}
      >
        <Container overrideDefaults className="flex gap-6">
          {/* Left sidebar - hidden on mobile (< lg) and in wide-shell layout mode */}
          {showLeftSidebar && !usesWideShellLayout && leftSidebarContent && (
            <StickySidebar>{leftSidebarContent}</StickySidebar>
          )}

          {/* Main content area - grows to fill space, min-w-0 prevents flex overflow */}
          <Container className={cn('w-full min-w-0 flex-1 gap-6 lg:overflow-hidden', classNameWrapperContent)}>
            {children}
          </Container>

          {/* Right sidebar - hidden on mobile (< lg) and in wide-shell layout mode */}
          {showRightSidebar && !usesWideShellLayout && rightSidebarContent && (
            <StickySidebar>{rightSidebarContent}</StickySidebar>
          )}
        </Container>
      </Container>

      {/* Mobile footer navigation */}
      <MobileFooter />

      {/* Drawer for left sidebar - slides in from left */}
      {(leftDrawerContent || leftDrawerContentMobile) && (
        <SideDrawer open={drawerFilterOpen} onOpenChangeAction={setDrawerFilterOpen} position="left">
          {isMobile && leftDrawerContentMobile ? leftDrawerContentMobile : leftDrawerContent}
        </SideDrawer>
      )}

      {/* Drawer for right sidebar - slides in from right */}
      {(rightDrawerContent || rightDrawerContentMobile) && (
        <SideDrawer open={drawerRightOpen} onOpenChangeAction={setDrawerRightOpen} position="right">
          {isMobile && rightDrawerContentMobile ? rightDrawerContentMobile : rightDrawerContent}
        </SideDrawer>
      )}
    </>
  );
}
