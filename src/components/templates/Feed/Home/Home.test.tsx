import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Home } from './Home';

// Mock Organisms
vi.mock('@/organisms', () => ({
  DialogWelcome: () => <div data-testid="dialog-welcome">DialogWelcome</div>,
  ContentLayout: ({
    children,
    leftSidebarContent,
    rightSidebarContent,
    leftDrawerContent,
    rightDrawerContent,
    leftDrawerContentMobile,
    showRightMobileButton,
  }: {
    children: React.ReactNode;
    leftSidebarContent: React.ReactNode;
    rightSidebarContent: React.ReactNode;
    leftDrawerContent: React.ReactNode;
    rightDrawerContent: React.ReactNode;
    leftDrawerContentMobile: React.ReactNode;
    showRightMobileButton: boolean;
  }) => (
    <div data-testid="content-layout" data-show-right-mobile-button={showRightMobileButton}>
      <div data-testid="left-sidebar">{leftSidebarContent}</div>
      <div data-testid="right-sidebar">{rightSidebarContent}</div>
      <div data-testid="left-drawer">{leftDrawerContent}</div>
      <div data-testid="right-drawer">{rightDrawerContent}</div>
      <div data-testid="left-drawer-mobile">{leftDrawerContentMobile}</div>
      {children}
    </div>
  ),
  HomeFeedSidebar: () => <div data-testid="home-feed-sidebar">HomeFeedSidebar</div>,
  HomeFeedRightSidebar: () => <div data-testid="home-feed-right-sidebar">HomeFeedRightSidebar</div>,
  HomeFeedDrawer: () => <div data-testid="home-feed-drawer">HomeFeedDrawer</div>,
  HomeFeedRightDrawer: () => <div data-testid="home-feed-right-drawer">HomeFeedRightDrawer</div>,
  HomeFeedDrawerMobile: () => <div data-testid="home-feed-drawer-mobile">HomeFeedDrawerMobile</div>,
  AlertBackup: () => <div data-testid="alert-backup">AlertBackup</div>,
  FeedNavigation: () => <div data-testid="feed-navigation">FeedNavigation</div>,
  TimelineFeed: ({ children, variant }: { children: React.ReactNode; variant: string }) => (
    <div data-testid="timeline-feed" data-variant={variant}>
      {children}
    </div>
  ),
  PostInput: ({ dataCy, variant }: { dataCy?: string; variant?: string }) => (
    <div data-testid="post-input" data-cy={dataCy} data-variant={variant}>
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

vi.mock('@/organisms/TimelineFeed/TimelineFeed.types', () => ({
  TIMELINE_FEED_VARIANT: {
    HOME: 'home',
  },
}));

describe('Home', () => {
  it('renders without errors', () => {
    render(<Home />);
    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
  });

  it('renders DialogWelcome', () => {
    render(<Home />);
    expect(screen.getByTestId('dialog-welcome')).toBeInTheDocument();
  });

  it('renders ContentLayout with showRightMobileButton set to false', () => {
    render(<Home />);
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-show-right-mobile-button', 'false');
  });

  it('renders HomeFeedSidebar in left sidebar', () => {
    render(<Home />);
    expect(screen.getByTestId('home-feed-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('left-sidebar')).toContainElement(screen.getByTestId('home-feed-sidebar'));
  });

  it('renders HomeFeedRightSidebar in right sidebar', () => {
    render(<Home />);
    expect(screen.getByTestId('home-feed-right-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('right-sidebar')).toContainElement(screen.getByTestId('home-feed-right-sidebar'));
  });

  it('renders HomeFeedDrawer in left drawer', () => {
    render(<Home />);
    expect(screen.getByTestId('home-feed-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('left-drawer')).toContainElement(screen.getByTestId('home-feed-drawer'));
  });

  it('renders HomeFeedRightDrawer in right drawer', () => {
    render(<Home />);
    expect(screen.getByTestId('home-feed-right-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('right-drawer')).toContainElement(screen.getByTestId('home-feed-right-drawer'));
  });

  it('renders HomeFeedDrawerMobile in left drawer mobile', () => {
    render(<Home />);
    expect(screen.getByTestId('home-feed-drawer-mobile')).toBeInTheDocument();
    expect(screen.getByTestId('left-drawer-mobile')).toContainElement(screen.getByTestId('home-feed-drawer-mobile'));
  });

  it('renders AlertBackup', () => {
    render(<Home />);
    expect(screen.getByTestId('alert-backup')).toBeInTheDocument();
  });

  it('renders FeedNavigation', () => {
    render(<Home />);
    expect(screen.getByTestId('feed-navigation')).toBeInTheDocument();
  });

  it('renders TimelineFeed with HOME variant', () => {
    render(<Home />);
    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'home');
  });

  it('renders PostInput inside TimelineFeed', () => {
    render(<Home />);
    const postInput = screen.getByTestId('post-input');
    expect(postInput).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toContainElement(postInput);
  });

  it('renders PostInput with correct props', () => {
    render(<Home />);
    const postInput = screen.getByTestId('post-input');
    expect(postInput).toHaveAttribute('data-cy', 'home-post-input');
    expect(postInput).toHaveAttribute('data-variant', 'post');
  });
});

describe('Home - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Home />);
    expect(container).toMatchSnapshot();
  });
});
