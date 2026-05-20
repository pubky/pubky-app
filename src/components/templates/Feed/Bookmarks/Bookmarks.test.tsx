import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Bookmarks } from './Bookmarks';

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    feedVariant,
    showRightMobileButton,
    leftSidebarContent,
    rightSidebarContent,
    leftDrawerContent,
    rightDrawerContent,
    leftDrawerContentMobile,
  }: {
    children: ReactNode;
    feedVariant?: string;
    showRightMobileButton?: boolean;
    leftSidebarContent?: ReactNode;
    rightSidebarContent?: ReactNode;
    leftDrawerContent?: ReactNode;
    rightDrawerContent?: ReactNode;
    leftDrawerContentMobile?: ReactNode;
  }) => (
    <div
      data-testid="content-layout"
      data-feed-variant={feedVariant}
      data-show-right-mobile-button={String(showRightMobileButton)}
    >
      <div data-testid="left-sidebar">{leftSidebarContent}</div>
      <div data-testid="right-sidebar">{rightSidebarContent}</div>
      <div data-testid="left-drawer">{leftDrawerContent}</div>
      <div data-testid="right-drawer">{rightDrawerContent}</div>
      <div data-testid="left-drawer-mobile">{leftDrawerContentMobile}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/organisms/FeedRightSidebar/FeedRightSidebar', () => ({
  HomeFeedRightDrawer: () => <div data-testid="home-feed-right-drawer">HomeFeedRightDrawer</div>,
  HomeFeedRightSidebar: () => <div data-testid="home-feed-right-sidebar">HomeFeedRightSidebar</div>,
}));

vi.mock('@/organisms/HomeFeedSidebar/HomeFeedSidebar', () => ({
  HomeFeedDrawer: ({ feedVariant, hideReachFilter }: { feedVariant: string; hideReachFilter?: boolean }) => (
    <div
      data-testid="home-feed-drawer"
      data-feed-variant={feedVariant}
      data-hide-reach-filter={String(hideReachFilter)}
    >
      HomeFeedDrawer
    </div>
  ),
  HomeFeedDrawerMobile: ({ feedVariant, hideReachFilter }: { feedVariant: string; hideReachFilter?: boolean }) => (
    <div
      data-testid="home-feed-drawer-mobile"
      data-feed-variant={feedVariant}
      data-hide-reach-filter={String(hideReachFilter)}
    >
      HomeFeedDrawerMobile
    </div>
  ),
  HomeFeedSidebar: ({ feedVariant, hideReachFilter }: { feedVariant: string; hideReachFilter?: boolean }) => (
    <div
      data-testid="home-feed-sidebar"
      data-feed-variant={feedVariant}
      data-hide-reach-filter={String(hideReachFilter)}
    >
      HomeFeedSidebar
    </div>
  ),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({ variant }: { variant: string }) => (
    <div data-testid="timeline-feed" data-variant={variant}>
      TimelineFeed
    </div>
  ),
}));

vi.mock('@/config/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/feed')>();
  return {
    ...actual,
    TIMELINE_FEED_VARIANT: {
      ...actual.TIMELINE_FEED_VARIANT,
      BOOKMARKS: 'bookmarks',
    },
  };
});

describe('Bookmarks', () => {
  it('renders TimelineFeed with BOOKMARKS variant', () => {
    render(<Bookmarks />);
    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'bookmarks');
  });

  it('renders its own ContentLayout shell outside the feeds route group', () => {
    render(<Bookmarks />);
    const contentLayout = screen.getByTestId('content-layout');
    expect(contentLayout).toHaveAttribute('data-feed-variant', 'bookmarks');
    expect(contentLayout).toHaveAttribute('data-show-right-mobile-button', 'false');
  });

  it('renders bookmarks filters with reach filter hidden', () => {
    render(<Bookmarks />);
    expect(screen.getByTestId('home-feed-sidebar')).toHaveAttribute('data-hide-reach-filter', 'true');
    expect(screen.getByTestId('home-feed-drawer')).toHaveAttribute('data-hide-reach-filter', 'true');
    expect(screen.getByTestId('home-feed-drawer-mobile')).toHaveAttribute('data-hide-reach-filter', 'true');
  });
});

describe('Bookmarks - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Bookmarks />);
    expect(container).toMatchSnapshot();
  });
});
