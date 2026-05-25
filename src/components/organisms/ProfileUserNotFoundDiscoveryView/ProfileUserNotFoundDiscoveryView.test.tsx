import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileUserNotFoundDiscoveryView } from './ProfileUserNotFoundDiscoveryView';

const mockUseLayoutReset = vi.fn();

vi.mock('@/hooks/useLayoutReset/useLayoutReset', () => ({
  useLayoutReset: () => mockUseLayoutReset(),
}));

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
  }: {
    children: React.ReactNode;
    leftSidebarContent?: React.ReactNode;
    rightSidebarContent?: React.ReactNode;
    leftDrawerContent?: React.ReactNode;
    rightDrawerContent?: React.ReactNode;
    showRightMobileButton?: boolean;
    hasGradientBackground?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="content-layout"
      data-show-right-mobile-button={String(showRightMobileButton)}
      data-has-gradient-background={String(hasGradientBackground)}
      className={className}
    >
      <div data-testid="content-layout-left-slot">{leftSidebarContent}</div>
      <div data-testid="content-layout-right-slot">{rightSidebarContent}</div>
      <div data-testid="content-layout-left-drawer-slot">{leftDrawerContent}</div>
      <div data-testid="content-layout-right-drawer-slot">{rightDrawerContent}</div>
      {children}
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

vi.mock('@/organisms/HotActiveUsers/HotActiveUsers', () => ({
  HotActiveUsers: () => <div data-testid="hot-active-users" />,
}));

vi.mock('@/molecules/UserNotFound/UserNotFound', () => ({
  UserNotFound: () => <div data-testid="user-not-found-mock" />,
}));

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({
    children,
    className,
    overrideDefaults,
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
  }) => (
    <div data-testid="container" data-override={overrideDefaults} className={className}>
      {children}
    </div>
  ),
}));

describe('ProfileUserNotFoundDiscoveryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls useLayoutReset on mount', () => {
    render(<ProfileUserNotFoundDiscoveryView />);
    expect(mockUseLayoutReset).toHaveBeenCalledTimes(1);
  });

  it('renders ContentLayout with Hot shell props and sidebar slots', () => {
    render(<ProfileUserNotFoundDiscoveryView />);

    const layout = screen.getByTestId('content-layout');
    expect(layout).toHaveAttribute('data-show-right-mobile-button', 'false');
    expect(layout).toHaveAttribute('data-has-gradient-background', 'false');
    expect(layout).toHaveClass('pb-24 lg:pb-12');

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
  });

  it('renders UserNotFound', () => {
    render(<ProfileUserNotFoundDiscoveryView />);

    expect(screen.getByTestId('user-not-found-mock')).toBeInTheDocument();
  });

  it('renders HotActiveUsers below the empty state', () => {
    render(<ProfileUserNotFoundDiscoveryView />);

    const container = screen.getByTestId('container');
    expect(container).toContainElement(screen.getByTestId('user-not-found-mock'));
    expect(container).toContainElement(screen.getByTestId('hot-active-users'));
  });
});

describe('ProfileUserNotFoundDiscoveryView - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<ProfileUserNotFoundDiscoveryView />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
