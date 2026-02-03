import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hot } from './Hot';

// Mock Core
vi.mock('@/core', () => ({
  useHotStore: vi.fn(() => ({
    reach: 'all',
    setReach: vi.fn(),
    timeframe: 'this_month',
    setTimeframe: vi.fn(),
  })),
}));

// Mock Hooks
vi.mock('@/hooks', () => ({
  useLayoutReset: vi.fn(),
}));

// Mock Organisms
vi.mock('@/organisms', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="content-layout">{children}</div>,
  HotFeedSidebar: () => <div data-testid="hot-feed-sidebar">HotFeedSidebar</div>,
  HotFeedRightSidebar: () => <div data-testid="hot-feed-right-sidebar">HotFeedRightSidebar</div>,
  HotFeedDrawer: () => <div data-testid="hot-feed-drawer">HotFeedDrawer</div>,
  HotFeedRightDrawer: () => <div data-testid="hot-feed-right-drawer">HotFeedRightDrawer</div>,
  HotTagsCardsSection: () => <div data-testid="hot-tags-cards-section">HotTagsCardsSection</div>,
  HotTagsOverview: () => <div data-testid="hot-tags-overview">HotTagsOverview</div>,
  HotActiveUsers: () => <div data-testid="hot-active-users">HotActiveUsers</div>,
  TimelineFeed: () => <div data-testid="timeline-feed">TimelineFeed</div>,
}));

// Mock Atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="container" {...props}>
      {children}
    </div>
  ),
  Heading: ({ children, level }: { children: React.ReactNode; level: number }) => (
    <div data-testid={`heading-${level}`}>{children}</div>
  ),
}));

describe('Hot', () => {
  it('renders without errors', () => {
    render(<Hot />);
    expect(screen.getByTestId('content-layout')).toBeInTheDocument();
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
});

describe('Hot - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Hot />);
    expect(container).toMatchSnapshot();
  });
});
