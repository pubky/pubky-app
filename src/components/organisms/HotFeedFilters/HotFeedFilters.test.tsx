import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMEFRAME } from '@/stores/hot/hot.types';
import { FilterTimeframe, HotFeedDrawer, HotFeedSidebar } from './HotFeedFilters';

let mockCurrentUserPubky: string | null = 'viewer-pubky';

// Mock store
vi.mock('@/stores/hot/hot.store', () => ({
  useHotStore: vi.fn(() => ({
    reach: 'following',
    setReach: vi.fn(),
    timeframe: 'today',
    setTimeframe: vi.fn(),
  })),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mockCurrentUserPubky }),
}));

// Mock Atoms
vi.mock('@/atoms/Filter/Filter', () => {
  return {
    FilterRoot: ({ children }: { children: React.ReactNode }) => <div data-testid="filter-root">{children}</div>,
    FilterHeader: ({ title }: { title: string }) => <div data-testid="filter-header">{title}</div>,
    FilterList: ({ children }: { children: React.ReactNode }) => <ul data-testid="filter-list">{children}</ul>,
    FilterItem: ({
      children,
      isSelected,
      onClick,
    }: {
      children: React.ReactNode;
      isSelected: boolean;
      onClick: () => void;
    }) => (
      <li data-testid="filter-item" data-selected={isSelected} onClick={onClick}>
        {children}
      </li>
    ),
    FilterItemIcon: ({ icon: Icon }: { icon: React.ComponentType }) => (
      <span data-testid="filter-icon">
        <Icon />
      </span>
    ),
    FilterItemLabel: ({ children }: { children: React.ReactNode }) => (
      <span data-testid="filter-label">{children}</span>
    ),
  };
});

// Mock Molecules
vi.mock('@/molecules/Filters/FilterReach/FilterReach', () => {
  return {
    FilterReach: ({ selectedTab }: { selectedTab?: string }) => (
      <div data-testid="filter-reach" data-selected-tab={selectedTab}>
        FilterReach
      </div>
    ),
  };
});

beforeEach(() => {
  mockCurrentUserPubky = 'viewer-pubky';
});

describe('FilterTimeframe', () => {
  it('renders all timeframe options', () => {
    render(<FilterTimeframe />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('This Week')).toBeInTheDocument();
    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByText('All Time')).toBeInTheDocument();
  });

  it('calls onTabChange when clicking an option', () => {
    const onTabChange = vi.fn();
    render(<FilterTimeframe selectedTab={TIMEFRAME.TODAY} onTabChange={onTabChange} />);

    fireEvent.click(screen.getByText('This Month'));
    expect(onTabChange).toHaveBeenCalledWith(TIMEFRAME.THIS_MONTH);
  });

  it('matches snapshot', () => {
    const { container } = render(<FilterTimeframe selectedTab={TIMEFRAME.TODAY} />);
    expect(container).toMatchSnapshot();
  });
});

describe('HotFeedSidebar', () => {
  it('renders FilterReach and FilterTimeframe', () => {
    render(<HotFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('forces all reach when logged out', () => {
    mockCurrentUserPubky = null;

    render(<HotFeedSidebar />);

    expect(screen.getByTestId('filter-reach')).toHaveAttribute('data-selected-tab', 'all');
  });

  it('matches snapshot', () => {
    const { container } = render(<HotFeedSidebar />);
    expect(container).toMatchSnapshot();
  });
});

describe('HotFeedDrawer', () => {
  it('renders FilterReach and FilterTimeframe', () => {
    render(<HotFeedDrawer />);

    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('matches snapshot', () => {
    const { container } = render(<HotFeedDrawer />);
    expect(container).toMatchSnapshot();
  });
});
