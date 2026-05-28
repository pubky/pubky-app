import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hot } from './Hot';

let mockIsMobile = false;

// Mock dependencies
vi.mock('@/stores/hot/hot.store', () => ({
  useHotStore: vi.fn(() => ({
    reach: 'all',
    setReach: vi.fn(),
    timeframe: 'this_month',
    setTimeframe: vi.fn(),
  })),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

// Mock Molecules
vi.mock('@/molecules/HotMobileMenu/HotMobileMenu', () => {
  return {
    HotMobileMenu: ({
      activeSection,
      onSectionChange,
    }: {
      activeSection: string;
      onSectionChange: (section: string) => void;
    }) => (
      <div data-testid="hot-mobile-menu" data-active-section={activeSection}>
        <button data-testid="tab-tags" onClick={() => onSectionChange('tags')}>
          Tags
        </button>
        <button data-testid="tab-users" onClick={() => onSectionChange('users')}>
          Users
        </button>
        <button data-testid="tab-posts" onClick={() => onSectionChange('posts')}>
          Posts
        </button>
      </div>
    ),
  };
});

// Mock Organisms
vi.mock('@/organisms/ContentLayout/ContentLayout', () => {
  return {
    ContentLayout: ({
      children,
      hasGradientBackground,
      className,
      disableWideShellLayout,
    }: {
      children: React.ReactNode;
      hasGradientBackground?: boolean;
      className?: string;
      disableWideShellLayout?: boolean;
    }) => (
      <div
        data-testid="content-layout"
        data-has-gradient-background={hasGradientBackground}
        data-disable-wide-shell-layout={String(disableWideShellLayout)}
        className={className}
      >
        {children}
      </div>
    ),
  };
});

vi.mock('@/organisms/FeedRightSidebar/FeedRightSidebar', () => {
  return {
    HotFeedRightSidebar: () => <div data-testid="hot-feed-right-sidebar">HotFeedRightSidebar</div>,
    HotFeedRightDrawer: () => <div data-testid="hot-feed-right-drawer">HotFeedRightDrawer</div>,
  };
});

vi.mock('@/organisms/HotActiveUsers/HotActiveUsers', () => {
  return {
    HotActiveUsers: ({ className }: { className?: string }) => (
      <div data-testid="hot-active-users" className={className}>
        HotActiveUsers
      </div>
    ),
  };
});

vi.mock('@/organisms/HotFeedFilters/HotFeedFilters', () => {
  return {
    HotFeedSidebar: () => <div data-testid="hot-feed-sidebar">HotFeedSidebar</div>,
    HotFeedDrawer: () => <div data-testid="hot-feed-drawer">HotFeedDrawer</div>,
  };
});

vi.mock('@/organisms/HotTagsCardsSection/HotTagsCardsSection', () => {
  return {
    HotTagsCardsSection: ({ className }: { className?: string }) => (
      <div data-testid="hot-tags-cards-section" className={className}>
        HotTagsCardsSection
      </div>
    ),
  };
});

vi.mock('@/organisms/HotTagsOverview/HotTagsOverview', () => {
  return {
    HotTagsOverview: ({ className }: { className?: string }) => (
      <div data-testid="hot-tags-overview" className={className}>
        HotTagsOverview
      </div>
    ),
  };
});

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => {
  return {
    TimelineFeed: () => <div data-testid="timeline-feed">TimelineFeed</div>,
  };
});

// Mock Atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      overrideDefaults: _overrideDefaults,
      ...props
    }: {
      children: React.ReactNode;
      overrideDefaults?: boolean;
      [key: string]: unknown;
    }) => (
      <div data-testid="container" {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({ children, level }: { children: React.ReactNode; level: number }) => (
      <div data-testid={`heading-${level}`}>{children}</div>
    ),
  };
});

describe('Hot', () => {
  beforeEach(() => {
    mockIsMobile = false;
  });

  it('renders without errors', () => {
    render(<Hot />);
    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
  });

  it('disables wide shell layout without resetting the saved feed preference', () => {
    render(<Hot />);
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-disable-wide-shell-layout', 'true');
  });

  it('renders HotMobileMenu', () => {
    render(<Hot />);
    expect(screen.getByTestId('hot-mobile-menu')).toBeInTheDocument();
  });

  it('renders HotTagsCardsSection', () => {
    render(<Hot />);
    expect(screen.getByTestId('hot-tags-cards-section')).toBeInTheDocument();
  });

  it('renders HotTagsOverview', () => {
    render(<Hot />);
    expect(screen.getByTestId('hot-tags-overview')).toBeInTheDocument();
  });

  it('renders HotActiveUsers', () => {
    render(<Hot />);
    expect(screen.getByTestId('hot-active-users')).toBeInTheDocument();
  });

  it('renders TimelineFeed for trending posts', () => {
    render(<Hot />);
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
  });

  it('displays Trending posts heading', () => {
    render(<Hot />);
    expect(screen.getByText('Trending posts')).toBeInTheDocument();
  });

  it('passes hasGradientBackground={false} to ContentLayout', () => {
    render(<Hot />);
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-has-gradient-background', 'false');
  });

  it('passes bottom padding className to ContentLayout', () => {
    render(<Hot />);
    expect(screen.getByTestId('content-layout')).toHaveClass('pb-24', 'lg:pb-12');
  });

  it('defaults to tags as active section', () => {
    render(<Hot />);
    expect(screen.getByTestId('hot-mobile-menu')).toHaveAttribute('data-active-section', 'tags');
  });
});

describe('Hot - Desktop', () => {
  beforeEach(() => {
    mockIsMobile = false;
  });

  it('does not apply hidden class to any section', () => {
    render(<Hot />);
    expect(screen.getByTestId('hot-tags-cards-section')).not.toHaveClass('hidden');
    expect(screen.getByTestId('hot-tags-overview')).not.toHaveClass('hidden');
    expect(screen.getByTestId('hot-active-users')).not.toHaveClass('hidden');
    // Trending posts container wraps the timeline
    const containers = screen.getAllByTestId('container');
    const trendingContainer = containers.find((el) => el.querySelector('[data-testid="timeline-feed"]'));
    expect(trendingContainer).not.toHaveClass('hidden');
  });
});

describe('Hot - Mobile', () => {
  beforeEach(() => {
    mockIsMobile = true;
  });

  it('shows tags section by default and hides users and posts', () => {
    render(<Hot />);
    expect(screen.getByTestId('hot-tags-cards-section')).not.toHaveClass('hidden');
    expect(screen.getByTestId('hot-tags-overview')).not.toHaveClass('hidden');
    expect(screen.getByTestId('hot-active-users')).toHaveClass('hidden');
    const containers = screen.getAllByTestId('container');
    const trendingContainer = containers.find((el) => el.querySelector('[data-testid="timeline-feed"]'));
    expect(trendingContainer).toHaveClass('hidden');
  });

  it('switches to users tab and hides tags and posts', () => {
    render(<Hot />);
    fireEvent.click(screen.getByTestId('tab-users'));

    expect(screen.getByTestId('hot-mobile-menu')).toHaveAttribute('data-active-section', 'users');
    expect(screen.getByTestId('hot-tags-cards-section')).toHaveClass('hidden');
    expect(screen.getByTestId('hot-tags-overview')).toHaveClass('hidden');
    expect(screen.getByTestId('hot-active-users')).not.toHaveClass('hidden');
    const containers = screen.getAllByTestId('container');
    const trendingContainer = containers.find((el) => el.querySelector('[data-testid="timeline-feed"]'));
    expect(trendingContainer).toHaveClass('hidden');
  });

  it('switches to posts tab and hides tags and users', () => {
    render(<Hot />);
    fireEvent.click(screen.getByTestId('tab-posts'));

    expect(screen.getByTestId('hot-mobile-menu')).toHaveAttribute('data-active-section', 'posts');
    expect(screen.getByTestId('hot-tags-cards-section')).toHaveClass('hidden');
    expect(screen.getByTestId('hot-tags-overview')).toHaveClass('hidden');
    expect(screen.getByTestId('hot-active-users')).toHaveClass('hidden');
    const containers = screen.getAllByTestId('container');
    const trendingContainer = containers.find((el) => el.querySelector('[data-testid="timeline-feed"]'));
    expect(trendingContainer).not.toHaveClass('hidden');
  });

  it('switches back to tags tab from another tab', () => {
    render(<Hot />);

    // Switch to users first
    fireEvent.click(screen.getByTestId('tab-users'));
    expect(screen.getByTestId('hot-active-users')).not.toHaveClass('hidden');

    // Switch back to tags
    fireEvent.click(screen.getByTestId('tab-tags'));
    expect(screen.getByTestId('hot-tags-cards-section')).not.toHaveClass('hidden');
    expect(screen.getByTestId('hot-tags-overview')).not.toHaveClass('hidden');
    expect(screen.getByTestId('hot-active-users')).toHaveClass('hidden');
  });
});

describe('Hot - Snapshots', () => {
  beforeEach(() => {
    mockIsMobile = false;
  });

  it('matches snapshot', () => {
    const { container } = render(<Hot />);
    expect(container).toMatchSnapshot();
  });
});
