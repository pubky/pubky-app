import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HotDiscoveryContentLayout } from './HotDiscoveryContentLayout';

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    leftSidebarContent,
    rightSidebarContent,
    leftDrawerContent,
    rightDrawerContent,
    showRightMobileButton,
    hasGradientBackground,
    className,
    disableWideShellLayout,
  }: {
    children: React.ReactNode;
    leftSidebarContent?: React.ReactNode;
    rightSidebarContent?: React.ReactNode;
    leftDrawerContent?: React.ReactNode;
    rightDrawerContent?: React.ReactNode;
    showRightMobileButton?: boolean;
    hasGradientBackground?: boolean;
    className?: string;
    disableWideShellLayout?: boolean;
  }) => (
    <div
      data-testid="content-layout"
      data-show-right-mobile-button={String(showRightMobileButton)}
      data-has-gradient-background={String(hasGradientBackground)}
      data-disable-wide-shell-layout={String(disableWideShellLayout)}
      className={className}
    >
      <div data-testid="content-layout-left-slot">{leftSidebarContent}</div>
      <div data-testid="content-layout-right-slot">{rightSidebarContent}</div>
      <div data-testid="content-layout-left-drawer-slot">{leftDrawerContent}</div>
      <div data-testid="content-layout-right-drawer-slot">{rightDrawerContent}</div>
      <div data-testid="content-layout-main">{children}</div>
    </div>
  ),
}));

vi.mock('@/organisms/FeedRightSidebar/FeedRightSidebar', () => ({
  HotFeedRightSidebar: () => <div data-testid="hot-feed-right-sidebar" />,
  HotFeedRightDrawer: () => <div data-testid="hot-feed-right-drawer" />,
}));

vi.mock('@/organisms/HotFeedFilters/HotFeedFilters', () => ({
  HotFeedSidebar: () => <div data-testid="hot-feed-sidebar" />,
  HotFeedDrawer: () => <div data-testid="hot-feed-drawer" />,
}));

describe('HotDiscoveryContentLayout', () => {
  it('passes Hot shell props to ContentLayout and wires sidebar slots', () => {
    render(
      <HotDiscoveryContentLayout>
        <div data-testid="child">Hot discovery body</div>
      </HotDiscoveryContentLayout>,
    );

    const layout = screen.getByTestId('content-layout');
    expect(layout).toHaveAttribute('data-show-right-mobile-button', 'false');
    expect(layout).toHaveAttribute('data-has-gradient-background', 'false');
    expect(layout).toHaveAttribute('data-disable-wide-shell-layout', 'true');
    expect(layout).toHaveClass('pb-24', 'lg:pb-12');

    expect(screen.getByTestId('content-layout-left-slot')).toContainElement(screen.getByTestId('hot-feed-sidebar'));
    expect(screen.getByTestId('content-layout-right-slot')).toContainElement(
      screen.getByTestId('hot-feed-right-sidebar'),
    );
    expect(screen.getByTestId('content-layout-left-drawer-slot')).toContainElement(
      screen.getByTestId('hot-feed-drawer'),
    );
    expect(screen.getByTestId('content-layout-right-drawer-slot')).toContainElement(
      screen.getByTestId('hot-feed-right-drawer'),
    );

    expect(screen.getByTestId('content-layout-main')).toContainElement(screen.getByTestId('child'));
  });
});

describe('HotDiscoveryContentLayout - Snapshots', () => {
  it('matches snapshot with child content', () => {
    const { container } = render(
      <HotDiscoveryContentLayout>
        <p data-testid="snapshot-inner">discovery shell</p>
      </HotDiscoveryContentLayout>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
