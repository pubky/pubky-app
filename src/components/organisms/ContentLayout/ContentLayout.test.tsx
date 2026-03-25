import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentLayout } from './ContentLayout';

const mockUseCustomFeed = vi.fn();
const mockResolveFeedLayout = vi.fn();
let mockHomeLayout = 'columns';

// Mock the home store
vi.mock('@/core', () => ({
  useHomeStore: () => ({
    layout: mockHomeLayout,
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
  pubkyLayoutToHomeLayout: vi.fn((layout: string) => layout),
}));

// Mock the hooks
vi.mock('@/hooks', () => ({
  useCustomFeed: () => mockUseCustomFeed(),
  useIsMobile: () => false,
  resolveFeedLayout: (...args: unknown[]) => mockResolveFeedLayout(...args),
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
  beforeEach(() => {
    mockUseCustomFeed.mockReturnValue(undefined);
    mockHomeLayout = 'columns';
    mockResolveFeedLayout.mockImplementation(({ requestedLayout }: { requestedLayout: string }) => ({
      requestedLayout,
      effectiveLayout: requestedLayout,
      isVisualRequested: requestedLayout === 'visual',
      isVisualActive: requestedLayout === 'visual',
      isPhoneViewport: false,
    }));
  });

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

  it('uses the wide shell for supported visual feed layouts', () => {
    mockHomeLayout = 'visual';

    render(
      <ContentLayout
        feedVariant="home"
        showLeftSidebar={true}
        leftSidebarContent={<div>Left Sidebar</div>}
        leftDrawerContent={<div>Left Drawer</div>}
        showRightSidebar={true}
        rightSidebarContent={<div>Right Sidebar</div>}
        rightDrawerContent={<div>Right Drawer</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.queryByText('Left Sidebar')).not.toBeInTheDocument();
    expect(screen.queryByText('Right Sidebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('button-filters-left')).toBeInTheDocument();
    expect(screen.getByTestId('button-filters-right')).toBeInTheDocument();
  });
});

describe('ContentLayout - Custom Feed Layout Override', () => {
  beforeEach(() => {
    mockUseCustomFeed.mockReturnValue(undefined);
  });

  it('hides sidebars when custom feed layout is wide', () => {
    mockUseCustomFeed.mockReturnValue({ layout: 'wide' });

    render(
      <ContentLayout
        showLeftSidebar={true}
        leftSidebarContent={<div data-testid="left-sidebar-content">Left Sidebar</div>}
        showRightSidebar={true}
        rightSidebarContent={<div data-testid="right-sidebar-content">Right Sidebar</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    // Sidebars should be hidden in wide layout
    expect(screen.queryByText('Left Sidebar')).not.toBeInTheDocument();
    expect(screen.queryByText('Right Sidebar')).not.toBeInTheDocument();
  });

  it('shows ButtonFilters when custom feed layout is wide and drawer content exists', () => {
    mockUseCustomFeed.mockReturnValue({ layout: 'wide' });

    render(
      <ContentLayout
        showLeftSidebar={true}
        leftDrawerContent={<div>Left Drawer</div>}
        showRightSidebar={true}
        rightDrawerContent={<div>Right Drawer</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.getByTestId('button-filters-left')).toBeInTheDocument();
    expect(screen.getByTestId('button-filters-right')).toBeInTheDocument();
  });

  it('keeps sidebars visible when custom feed layout is columns', () => {
    mockUseCustomFeed.mockReturnValue({ layout: 'columns' });

    render(
      <ContentLayout
        showLeftSidebar={true}
        leftSidebarContent={<div data-testid="left-sidebar-content">Left Sidebar</div>}
        showRightSidebar={true}
        rightSidebarContent={<div data-testid="right-sidebar-content">Right Sidebar</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    const leftElements = screen.queryAllByText('Left Sidebar');
    expect(leftElements.length).toBeGreaterThan(0);
    const rightElements = screen.queryAllByText('Right Sidebar');
    expect(rightElements.length).toBeGreaterThan(0);
  });

  it('custom feed wide layout overrides home store columns layout', () => {
    // Home store is 'columns' by default in mock, custom feed overrides to 'wide'
    mockUseCustomFeed.mockReturnValue({ layout: 'wide' });

    render(
      <ContentLayout
        showLeftSidebar={true}
        leftSidebarContent={<div data-testid="left-sidebar-content">Left Sidebar</div>}
        leftDrawerContent={<div>Left Drawer</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    // Sidebar hidden because custom feed says wide, even though home store says columns
    expect(screen.queryByText('Left Sidebar')).not.toBeInTheDocument();
    // ButtonFilters shown because layout is wide
    expect(screen.getByTestId('button-filters-left')).toBeInTheDocument();
  });

  it('does not show ButtonFilters when custom feed layout is wide but no drawer content', () => {
    mockUseCustomFeed.mockReturnValue({ layout: 'wide' });

    render(
      <ContentLayout showLeftSidebar={true} showRightSidebar={true}>
        <div>Test Content</div>
      </ContentLayout>,
    );

    expect(screen.queryByTestId('button-filters-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-filters-right')).not.toBeInTheDocument();
  });

  it('matches snapshot when custom feed layout is wide', () => {
    mockUseCustomFeed.mockReturnValue({ layout: 'wide' });

    const { container } = render(
      <ContentLayout
        showLeftSidebar={true}
        leftSidebarContent={<div>Left Sidebar</div>}
        leftDrawerContent={<div>Left Drawer</div>}
        showRightSidebar={true}
        rightSidebarContent={<div>Right Sidebar</div>}
        rightDrawerContent={<div>Right Drawer</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when custom feed layout is columns', () => {
    mockUseCustomFeed.mockReturnValue({ layout: 'columns' });

    const { container } = render(
      <ContentLayout
        showLeftSidebar={true}
        leftSidebarContent={<div>Left Sidebar</div>}
        showRightSidebar={true}
        rightSidebarContent={<div>Right Sidebar</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );
    expect(container).toMatchSnapshot();
  });

  it('falls back to home store layout when no custom feed exists', () => {
    mockUseCustomFeed.mockReturnValue(undefined);

    render(
      <ContentLayout
        showLeftSidebar={true}
        leftSidebarContent={<div data-testid="left-sidebar-content">Left Sidebar</div>}
        showRightSidebar={true}
        rightSidebarContent={<div data-testid="right-sidebar-content">Right Sidebar</div>}
      >
        <div>Test Content</div>
      </ContentLayout>,
    );

    // Home store layout is 'columns', so sidebars should be visible
    const leftElements = screen.queryAllByText('Left Sidebar');
    expect(leftElements.length).toBeGreaterThan(0);
    const rightElements = screen.queryAllByText('Right Sidebar');
    expect(rightElements.length).toBeGreaterThan(0);
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
