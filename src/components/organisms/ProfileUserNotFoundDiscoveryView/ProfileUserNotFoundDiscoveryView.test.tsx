import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { ProfileUserNotFoundDiscoveryView } from './ProfileUserNotFoundDiscoveryView';

const mockPush = vi.fn();
const mockUseLayoutReset = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `profile.notFound.${key}`,
}));

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
  UserNotFound: ({
    title,
    subtitle,
    imageAlt,
    backToFeedLabel,
    exploreTagsLabel,
    onBackToFeed,
    onExploreTags,
  }: {
    title: string;
    subtitle: string;
    imageAlt: string;
    backToFeedLabel: string;
    exploreTagsLabel: string;
    onBackToFeed: () => void;
    onExploreTags: () => void;
  }) => (
    <div data-testid="user-not-found-mock" data-title={title} data-subtitle={subtitle} data-image-alt={imageAlt}>
      <button type="button" data-testid="mock-back-to-feed" onClick={onBackToFeed}>
        {backToFeedLabel}
      </button>
      <button type="button" data-testid="mock-explore-tags" onClick={onExploreTags}>
        {exploreTagsLabel}
      </button>
    </div>
  ),
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

  it('passes translated strings to UserNotFound', () => {
    render(<ProfileUserNotFoundDiscoveryView />);

    const block = screen.getByTestId('user-not-found-mock');
    expect(block).toHaveAttribute('data-title', 'profile.notFound.title');
    expect(block).toHaveAttribute('data-subtitle', 'profile.notFound.subtitle');
    expect(block).toHaveAttribute('data-image-alt', 'profile.notFound.imageAlt');
    expect(screen.getByTestId('mock-back-to-feed')).toHaveTextContent('profile.notFound.backToFeed');
    expect(screen.getByTestId('mock-explore-tags')).toHaveTextContent('profile.notFound.exploreTags');
  });

  it('renders HotActiveUsers below the empty state', () => {
    render(<ProfileUserNotFoundDiscoveryView />);

    const container = screen.getByTestId('container');
    expect(container).toContainElement(screen.getByTestId('user-not-found-mock'));
    expect(container).toContainElement(screen.getByTestId('hot-active-users'));
  });

  it('navigates home and hot when action buttons are used', async () => {
    const user = userEvent.setup();
    render(<ProfileUserNotFoundDiscoveryView />);

    await user.click(screen.getByTestId('mock-back-to-feed'));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOME);

    await user.click(screen.getByTestId('mock-explore-tags'));
    expect(mockPush).toHaveBeenCalledWith(APP_ROUTES.HOT);
  });
});

describe('ProfileUserNotFoundDiscoveryView - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<ProfileUserNotFoundDiscoveryView />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
