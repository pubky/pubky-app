'use client';

import { useState, useEffect } from 'react';

import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Hooks from '@/hooks';
import * as Core from '@/core';
import * as Libs from '@/libs';
import * as Config from '@/config';
import * as Types from './ContentLayout.types';

/**
 * Reusable sticky sidebar component for left and right sidebars
 * Sidebars stay pinned below the main header and scroll independently
 * from the center column when viewport height is limited.
 */
function StickySidebar({ children }: Types.StickySidebarProps) {
  const stickyTop = Config.LAYOUT.HEADER_OFFSET_MAIN;
  const sidebarMaxHeight = `calc(100svh - ${stickyTop}px - ${Config.LAYOUT.SIDEBAR_BOTTOM_OFFSET}px)`;

  return (
    <Atoms.Container
      overrideDefaults
      className={Libs.cn(
        'hidden flex-col items-start justify-start gap-6 self-start lg:flex',
        'w-(--filter-bar-width) max-w-(--filter-bar-width) min-w-(--filter-bar-width) shrink-0',
        'sticky overflow-x-hidden overflow-y-auto overscroll-contain',
      )}
      style={{ top: `${stickyTop}px`, maxHeight: sidebarMaxHeight }}
    >
      {children}
    </Atoms.Container>
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
  feedVariant,
}: Types.ContentLayoutProps) {
  const { layout: homeLayout } = Core.useHomeStore();
  const customFeed = Hooks.useCustomFeed();
  const customFeedLayout =
    customFeed?.layout !== undefined ? Core.pubkyLayoutToHomeLayout(customFeed.layout) : undefined;
  const requestedLayout = customFeedLayout ?? homeLayout;

  const [drawerFilterOpen, setDrawerFilterOpen] = useState(false);
  const [drawerRightOpen, setDrawerRightOpen] = useState(false);
  const isMobile = Hooks.useIsMobile();
  const isPhoneViewport = Hooks.useIsMobile({ breakpoint: 'md' });
  const { effectiveLayout } = feedVariant
    ? Hooks.resolveFeedLayout({
        requestedLayout,
        variant: feedVariant,
        isPhoneViewport,
      })
    : {
        effectiveLayout: requestedLayout,
      };
  const usesWideShellLayout =
    effectiveLayout === Core.LAYOUT.WIDE || (feedVariant !== undefined && effectiveLayout === Core.LAYOUT.VISUAL);

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
        <Molecules.MobileHeader
          onLeftIconClick={showLeftMobileButton ? () => setDrawerFilterOpen(true) : undefined}
          onRightIconClick={showRightMobileButton ? () => setDrawerRightOpen(true) : undefined}
          showLeftButton={showLeftMobileButton}
          showRightButton={showRightMobileButton}
          hasGradientBackground={hasGradientBackground}
        />
      )}

      {/* Buttons to open drawers - visible on desktop when using the wide shell */}
      {usesWideShellLayout && showLeftSidebar && leftDrawerContent && (
        <Molecules.ButtonFilters onClick={() => setDrawerFilterOpen(true)} position="left" />
      )}
      {usesWideShellLayout && showRightSidebar && rightDrawerContent && (
        <Molecules.ButtonFilters onClick={() => setDrawerRightOpen(true)} position="right" />
      )}

      {/* Main content grid with responsive max-widths */}
      <Atoms.Container
        overrideDefaults
        className={Libs.cn(
          'container max-w-(--container-max-width)',
          'm-auto w-full px-6 pb-12 xl:px-0',
          'pt-0',
          className,
        )}
      >
        <Atoms.Container overrideDefaults className="flex gap-6">
          {/* Left sidebar - hidden on mobile (< lg) and in wide-shell layout mode */}
          {showLeftSidebar && !usesWideShellLayout && leftSidebarContent && (
            <StickySidebar>{leftSidebarContent}</StickySidebar>
          )}

          {/* Main content area - grows to fill space, min-w-0 prevents flex overflow */}
          <Atoms.Container
            className={Libs.cn('w-full min-w-0 flex-1 gap-6 lg:overflow-hidden', classNameWrapperContent)}
          >
            {children}
          </Atoms.Container>

          {/* Right sidebar - hidden on mobile (< lg) and in wide-shell layout mode */}
          {showRightSidebar && !usesWideShellLayout && rightSidebarContent && (
            <StickySidebar>{rightSidebarContent}</StickySidebar>
          )}
        </Atoms.Container>
      </Atoms.Container>

      {/* Mobile footer navigation */}
      <Molecules.MobileFooter />

      {/* Drawer for left sidebar - slides in from left */}
      {(leftDrawerContent || leftDrawerContentMobile) && (
        <Molecules.SideDrawer open={drawerFilterOpen} onOpenChangeAction={setDrawerFilterOpen} position="left">
          {isMobile && leftDrawerContentMobile ? leftDrawerContentMobile : leftDrawerContent}
        </Molecules.SideDrawer>
      )}

      {/* Drawer for right sidebar - slides in from right */}
      {(rightDrawerContent || rightDrawerContentMobile) && (
        <Molecules.SideDrawer open={drawerRightOpen} onOpenChangeAction={setDrawerRightOpen} position="right">
          {isMobile && rightDrawerContentMobile ? rightDrawerContentMobile : rightDrawerContent}
        </Molecules.SideDrawer>
      )}
    </>
  );
}
