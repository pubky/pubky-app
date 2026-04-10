import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SinglePostLeftSidebar, SinglePostLeftDrawer } from './SinglePostLeftSidebar';

const mockSetLayout = vi.fn();
const mockUseHomeStore = vi.fn();
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

vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    useHomeStore: () => mockUseHomeStore(),
  };
});

vi.mock('@/atoms/Container', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/molecules/Filters/', () => ({
  FilterReach: (props: BaseFilterMockProps) => mockFilterReach(props),
  FilterSort: (props: BaseFilterMockProps) => mockFilterSort(props),
  FilterContent: (props: BaseFilterMockProps) => mockFilterContent(props),
  FilterLayout: ({ selectedTab, onTabChange }: { selectedTab?: string; onTabChange?: (tab: string) => void }) =>
    mockFilterLayout({ selectedTab, onTabChange }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSetLayout.mockClear();
  mockFilterReach.mockClear();
  mockFilterSort.mockClear();
  mockFilterContent.mockClear();
  mockFilterLayout.mockClear();
  mockUseHomeStore.mockReturnValue({
    layout: 'columns',
    setLayout: mockSetLayout,
  });
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

    expect(mockSetLayout).toHaveBeenCalledWith('wide');
  });

  it('matches snapshot', () => {
    const { container } = render(<SinglePostLeftSidebar />);
    expect(container).toMatchSnapshot();
  });
});

describe('SinglePostLeftDrawer', () => {
  it('renders only the layout filter', () => {
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

    expect(mockSetLayout).toHaveBeenCalledWith('wide');
  });

  it('matches snapshot', () => {
    const { container } = render(<SinglePostLeftDrawer />);
    expect(container).toMatchSnapshot();
  });
});
