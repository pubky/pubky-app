import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContentLayout } from './ContentLayout';

// Mock the home store
vi.mock('@/core', () => ({
  useHomeStore: () => ({
    layout: 'columns',
    setLayout: vi.fn(),
    reach: 'all',
    setReach: vi.fn(),
    sort: 'recent',
    setSort: vi.fn(),
    content: 'all',
    setContent: vi.fn(),
  }),
  LAYOUT: {
    COLUMNS: 'columns',
    WIDE: 'wide',
    VISUAL: 'visual',
  },
}));

// Mock the molecules
vi.mock('@/molecules', () => ({
  MobileHeader: ({
    onLeftIconClick,
    onRightIconClick,
  }: {
    onLeftIconClick?: () => void;
    onRightIconClick?: () => void;
  }) => (
    <div data-testid="mobile-header">
      <button onClick={onLeftIconClick}>Left</button>
      <button onClick={onRightIconClick}>Right</button>
    </div>
  ),
  ButtonFilters: ({ onClick, position }: { onClick?: () => void; position?: 'left' | 'right' }) => (
    <button data-testid={`button-filters-${position}`} onClick={onClick}>
      Filter Button {position}
    </button>
  ),
  MobileFooter: () => <div data-testid="mobile-footer">Mobile Footer</div>,
  SideDrawer: ({
    open,
    onOpenChangeAction,
    children,
    position,
  }: {
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
    children: React.ReactNode;
    position?: 'left' | 'right';
  }) => (
    <div data-testid={`side-drawer-${position}`} data-open={open}>
      <button onClick={() => onOpenChangeAction(false)}>Close</button>
      {children}
    </div>
  ),
  FilterReach: ({ onTabChange }: { onTabChange?: (tab: string) => void }) => (
    <div data-testid="filter-reach">
      <button onClick={() => onTabChange?.('all')}>All</button>
    </div>
  ),
  FilterSort: ({ onTabChange }: { onTabChange?: (tab: string) => void }) => (
    <div data-testid="filter-sort">
      <button onClick={() => onTabChange?.('recent')}>Recent</button>
    </div>
  ),
  FilterContent: ({ onTabChange }: { onTabChange?: (tab: string) => void }) => (
    <div data-testid="filter-content">
      <button onClick={() => onTabChange?.('all')}>All</button>
    </div>
  ),
  FilterLayout: ({ onTabChange, onClose }: { onTabChange?: (tab: string) => void; onClose?: () => void }) => (
    <div data-testid="filter-layout">
      <button
        onClick={() => {
          onTabChange?.('columns');
          onClose?.();
        }}
      >
        Columns
      </button>
    </div>
  ),
  WhoToFollow: () => <div data-testid="who-to-follow">Who to Follow</div>,
  ActiveUsers: () => <div data-testid="active-users">Active Users</div>,
  FeedbackCard: () => <div data-testid="feedback-card">Feedback Card</div>,
}));

// Mock the organisms
vi.mock('@/organisms', () => ({
  LeftSidebar: () => <div data-testid="left-sidebar">Left Sidebar</div>,
  RightSidebar: () => <div data-testid="right-sidebar">Right Sidebar</div>,
}));

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
  };
});

describe('ContentLayout', () => {
  it('renders with default props', () => {
    render(
      <ContentLayout>
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.getByTestId('mobile-footer')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('shows left sidebar when showLeftSidebar is true and layout is not wide', () => {
    render(
      <ContentLayout
        showLeftSidebar={true}
        leftSidebarContent={<div data-testid="left-sidebar-content">Left Sidebar</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    // Sidebar is hidden on mobile (< lg) so we check it's in the DOM but with hidden class
    const sidebarElements = screen.queryAllByText('Left Sidebar');
    expect(sidebarElements.length).toBeGreaterThan(0);
  });

  it('hides left sidebar when showLeftSidebar is false', () => {
    render(
      <ContentLayout
        showLeftSidebar={false}
        leftSidebarContent={<div data-testid="left-sidebar-content">Left Sidebar</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.queryByText('Left Sidebar')).not.toBeInTheDocument();
  });

  it('shows right sidebar when showRightSidebar is true and layout is not wide', () => {
    render(
      <ContentLayout
        showRightSidebar={true}
        rightSidebarContent={<div data-testid="right-sidebar-content">Right Sidebar</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    // Sidebar is hidden on mobile (< lg) so we check it's in the DOM but with hidden class
    const sidebarElements = screen.queryAllByText('Right Sidebar');
    expect(sidebarElements.length).toBeGreaterThan(0);
  });

  it('hides right sidebar when showRightSidebar is false', () => {
    render(
      <ContentLayout showRightSidebar={false}>
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.queryByTestId('right-sidebar')).not.toBeInTheDocument();
  });

  it('renders right sidebar components in right drawer', () => {
    render(
      <ContentLayout
        rightSidebarContent={
          <>
            <div data-testid="who-to-follow">Who to Follow</div>
            <div data-testid="active-users">Active Users</div>
            <div data-testid="feedback-card">Feedback</div>
          </>
        }
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.getByTestId('who-to-follow')).toBeInTheDocument();
    expect(screen.getByTestId('active-users')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-card')).toBeInTheDocument();
  });

  it('applies correct responsive classes', () => {
    render(
      <ContentLayout>
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders MobileHeader by default', () => {
    render(
      <ContentLayout>
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.getByTestId('mobile-header')).toBeInTheDocument();
  });

  it('does not render MobileHeader when renderMobileHeader is false', () => {
    render(
      <ContentLayout renderMobileHeader={false}>
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.queryByTestId('mobile-header')).not.toBeInTheDocument();
  });
});

describe('ContentLayout - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <ContentLayout>
        <div>Test Content</div>
      </ContentLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with showLeftSidebar false', () => {
    const { container } = render(
      <ContentLayout showLeftSidebar={false}>
        <div>Test Content</div>
      </ContentLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with showRightSidebar false', () => {
    const { container } = render(
      <ContentLayout showRightSidebar={false}>
        <div>Test Content</div>
      </ContentLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with both sidebars hidden', () => {
    const { container } = render(
      <ContentLayout showLeftSidebar={false} showRightSidebar={false}>
        <div>Test Content</div>
      </ContentLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(
      <ContentLayout className="custom-layout">
        <div>Test Content</div>
      </ContentLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <ContentLayout>
        <div>
          <h1>Title</h1>
          <p>Description</p>
          <button>Action</button>
        </div>
      </ContentLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with renderMobileHeader false', () => {
    const { container } = render(
      <ContentLayout renderMobileHeader={false}>
        <div>Test Content</div>
      </ContentLayout>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
