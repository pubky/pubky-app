import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Custom } from './Custom';

// Mock Organisms
vi.mock('@/organisms', () => ({
  ContentLayout: ({
    children,
    leftSidebarContent,
    rightSidebarContent,
    leftDrawerContent,
    rightDrawerContent,
    leftDrawerContentMobile,
    rightDrawerContentMobile,
  }: {
    children: React.ReactNode;
    leftSidebarContent: React.ReactNode;
    rightSidebarContent: React.ReactNode;
    leftDrawerContent: React.ReactNode;
    rightDrawerContent: React.ReactNode;
    leftDrawerContentMobile: React.ReactNode;
    rightDrawerContentMobile: React.ReactNode;
  }) => (
    <div data-testid="content-layout">
      <div data-testid="left-sidebar">{leftSidebarContent}</div>
      <div data-testid="right-sidebar">{rightSidebarContent}</div>
      <div data-testid="left-drawer">{leftDrawerContent}</div>
      <div data-testid="right-drawer">{rightDrawerContent}</div>
      <div data-testid="left-drawer-mobile">{leftDrawerContentMobile}</div>
      <div data-testid="right-drawer-mobile">{rightDrawerContentMobile}</div>
      {children}
    </div>
  ),
  CustomFeedFilters: ({ variant }: { variant: string }) => (
    <div data-testid="custom-feed-filters" data-variant={variant}>
      CustomFeedFilters
    </div>
  ),
  HomeFeedRightSidebar: () => <div data-testid="home-feed-right-sidebar">HomeFeedRightSidebar</div>,
  HomeFeedRightDrawer: () => <div data-testid="home-feed-right-drawer">HomeFeedRightDrawer</div>,
  AlertBackup: () => <div data-testid="alert-backup">AlertBackup</div>,
  FeedNavigation: ({ className }: { className?: string }) => (
    <div data-testid="feed-navigation" data-classname={className}>
      FeedNavigation
    </div>
  ),
  TimelineFeed: ({ children, variant }: { children: React.ReactNode; variant: string }) => (
    <div data-testid="timeline-feed" data-variant={variant}>
      {children}
    </div>
  ),
  PostInput: ({ variant }: { variant?: string }) => (
    <div data-testid="post-input" data-variant={variant}>
      PostInput
    </div>
  ),
}));

// Mock constants
vi.mock('@/organisms/PostInput/PostInput.constants', () => ({
  POST_INPUT_VARIANT: {
    POST: 'post',
  },
}));

vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>();
  return {
    ...actual,
    TIMELINE_FEED_VARIANT: {
      ...actual.TIMELINE_FEED_VARIANT,
      CUSTOM: 'custom',
    },
  };
});

describe('Custom', () => {
  it('renders without errors', () => {
    render(<Custom />);
    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
  });

  it('renders ContentLayout without showRightMobileButton', () => {
    render(<Custom />);
    expect(screen.getByTestId('content-layout')).not.toHaveAttribute('data-show-right-mobile-button');
  });

  it('renders CustomFeedFilters with sidebar variant in left sidebar', () => {
    render(<Custom />);
    const leftSidebar = screen.getByTestId('left-sidebar');
    const filters = leftSidebar.querySelector('[data-testid="custom-feed-filters"]');
    expect(filters).toBeInTheDocument();
    expect(filters).toHaveAttribute('data-variant', 'sidebar');
  });

  it('renders HomeFeedRightSidebar in right sidebar', () => {
    render(<Custom />);
    expect(screen.getByTestId('home-feed-right-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('right-sidebar')).toContainElement(screen.getByTestId('home-feed-right-sidebar'));
  });

  it('renders CustomFeedFilters with drawer variant in left drawer', () => {
    render(<Custom />);
    const leftDrawer = screen.getByTestId('left-drawer');
    const filters = leftDrawer.querySelector('[data-testid="custom-feed-filters"]');
    expect(filters).toBeInTheDocument();
    expect(filters).toHaveAttribute('data-variant', 'drawer');
  });

  it('renders HomeFeedRightDrawer in right drawer', () => {
    render(<Custom />);
    expect(screen.getByTestId('home-feed-right-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('right-drawer')).toContainElement(screen.getByTestId('home-feed-right-drawer'));
  });

  it('renders CustomFeedFilters with drawer variant in left drawer mobile', () => {
    render(<Custom />);
    const leftDrawerMobile = screen.getByTestId('left-drawer-mobile');
    const filters = leftDrawerMobile.querySelector('[data-testid="custom-feed-filters"]');
    expect(filters).toBeInTheDocument();
    expect(filters).toHaveAttribute('data-variant', 'drawer');
  });

  it('renders FeedNavigation with lg:hidden className in right drawer mobile', () => {
    render(<Custom />);
    const rightDrawerMobile = screen.getByTestId('right-drawer-mobile');
    const feedNav = rightDrawerMobile.querySelector('[data-testid="feed-navigation"]');
    expect(feedNav).toBeInTheDocument();
    expect(feedNav).toHaveAttribute('data-classname', 'lg:hidden');
  });

  it('renders AlertBackup', () => {
    render(<Custom />);
    expect(screen.getByTestId('alert-backup')).toBeInTheDocument();
  });

  it('renders FeedNavigation with hidden lg:flex className in main content', () => {
    render(<Custom />);
    const contentLayout = screen.getByTestId('content-layout');
    const feedNavs = contentLayout.querySelectorAll('[data-testid="feed-navigation"]');
    const mainFeedNav = Array.from(feedNavs).find((el) => el.getAttribute('data-classname') === 'hidden lg:flex');
    expect(mainFeedNav).toBeInTheDocument();
  });

  it('renders TimelineFeed with CUSTOM variant', () => {
    render(<Custom />);
    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'custom');
  });

  it('renders PostInput inside TimelineFeed', () => {
    render(<Custom />);
    const postInput = screen.getByTestId('post-input');
    expect(postInput).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toContainElement(postInput);
  });

  it('renders PostInput with POST variant', () => {
    render(<Custom />);
    const postInput = screen.getByTestId('post-input');
    expect(postInput).toHaveAttribute('data-variant', 'post');
  });
});

describe('Custom - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Custom />);
    expect(container).toMatchSnapshot();
  });
});
