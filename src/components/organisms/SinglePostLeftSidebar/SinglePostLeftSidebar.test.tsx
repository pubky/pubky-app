import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHomeStore } from '@/stores/home/home.store';
import { LAYOUT } from '@/stores/home/home.types';
import { SinglePostLeftDrawer, SinglePostLeftDrawerMobile, SinglePostLeftSidebar } from './SinglePostLeftSidebar';

type BaseFilterMockProps = {
  selectedTab?: string;
  defaultSelectedTab?: string;
  disabled?: boolean;
  onTabChange?: (tab: string) => void;
};
const mockFilterReach = vi.fn(({ disabled }: BaseFilterMockProps) => (
  <div data-testid="filter-reach" data-disabled={disabled ? 'true' : 'false'}>
    FilterReach
  </div>
));
const mockFilterSort = vi.fn(({ disabled }: BaseFilterMockProps) => (
  <div data-testid="filter-sort" data-disabled={disabled ? 'true' : 'false'}>
    FilterSort
  </div>
));
const mockFilterContent = vi.fn(({ disabled }: BaseFilterMockProps) => (
  <div data-testid="filter-content" data-disabled={disabled ? 'true' : 'false'}>
    FilterContent
  </div>
));
const mockFilterLayout = vi.fn(
  ({ selectedTab, onTabChange }: { selectedTab?: string; onTabChange?: (tab: string) => void }) => (
    <div data-testid="filter-layout" data-selected-tab={selectedTab}>
      <button data-testid="change-layout" onClick={() => onTabChange?.('wide')}>
        Change layout
      </button>
    </div>
  ),
);

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/molecules/Filters/FilterReach/FilterReach', () => ({
  FilterReach: (props: BaseFilterMockProps) => mockFilterReach(props),
}));

vi.mock('@/molecules/Filters/FilterSort/FilterSort', () => ({
  FilterSort: (props: BaseFilterMockProps) => mockFilterSort(props),
}));

vi.mock('@/molecules/Filters/FilterContent/FilterContent', () => ({
  FilterContent: (props: BaseFilterMockProps) => mockFilterContent(props),
}));

vi.mock('@/molecules/Filters/FilterLayout/FilterLayout', () => ({
  FilterLayout: ({ selectedTab, onTabChange }: { selectedTab?: string; onTabChange?: (tab: string) => void }) =>
    mockFilterLayout({ selectedTab, onTabChange }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useHomeStore.setState({ layout: LAYOUT.COLUMNS });
  mockFilterReach.mockClear();
  mockFilterSort.mockClear();
  mockFilterContent.mockClear();
  mockFilterLayout.mockClear();
});

describe('SinglePostLeftSidebar', () => {
  it('renders only the layout filter', () => {
    render(<SinglePostLeftSidebar />);

    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-content')).toBeInTheDocument();
    expect(mockFilterReach).toHaveBeenCalled();
    expect(mockFilterSort).toHaveBeenCalled();
    expect(mockFilterContent).toHaveBeenCalled();
  });

  it('passes home layout state to FilterLayout', () => {
    render(<SinglePostLeftSidebar />);

    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-selected-tab', 'columns');
    expect(screen.getByTestId('container')).toHaveClass('flex', 'flex-col', 'gap-6');
  });

  it('updates home layout when filter tab changes', () => {
    render(<SinglePostLeftSidebar />);

    fireEvent.click(screen.getByTestId('change-layout'));

    expect(useHomeStore.getState().layout).toBe(LAYOUT.WIDE);
  });

  it('matches snapshot', () => {
    const { container } = render(<SinglePostLeftSidebar />);
    expect(container).toMatchSnapshot();
  });
});

describe('SinglePostLeftDrawer', () => {
  it('renders the layout filter outside mobile drawer contexts', () => {
    render(<SinglePostLeftDrawer />);

    expect(screen.getByTestId('filter-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-content')).toBeInTheDocument();
    expect(mockFilterReach).toHaveBeenCalled();
    expect(mockFilterSort).toHaveBeenCalled();
    expect(mockFilterContent).toHaveBeenCalled();
  });

  it('passes home layout state to FilterLayout', () => {
    render(<SinglePostLeftDrawer />);

    expect(screen.getByTestId('filter-layout')).toHaveAttribute('data-selected-tab', 'columns');
  });

  it('updates home layout when filter tab changes', () => {
    render(<SinglePostLeftDrawer />);

    fireEvent.click(screen.getByTestId('change-layout'));

    expect(useHomeStore.getState().layout).toBe(LAYOUT.WIDE);
  });

  it('matches snapshot', () => {
    const { container } = render(<SinglePostLeftDrawer />);
    expect(container).toMatchSnapshot();
  });
});

describe('SinglePostLeftDrawerMobile', () => {
  it('renders post filters without the layout filter', () => {
    render(<SinglePostLeftDrawerMobile />);

    expect(screen.queryByTestId('filter-layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-content')).toBeInTheDocument();
    expect(mockFilterLayout).not.toHaveBeenCalled();
    expect(mockFilterReach).toHaveBeenCalled();
    expect(mockFilterSort).toHaveBeenCalled();
    expect(mockFilterContent).toHaveBeenCalled();
  });

  it('does not update home layout because layout controls are hidden', () => {
    render(<SinglePostLeftDrawerMobile />);

    expect(screen.queryByTestId('change-layout')).not.toBeInTheDocument();
    expect(useHomeStore.getState().layout).toBe(LAYOUT.COLUMNS);
  });

  it('matches snapshot', () => {
    const { container } = render(<SinglePostLeftDrawerMobile />);
    expect(container).toMatchSnapshot();
  });
});
