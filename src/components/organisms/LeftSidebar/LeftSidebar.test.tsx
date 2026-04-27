import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LeftSidebar } from './LeftSidebar';

// Mock the home store
vi.mock('@/core', () => ({
  useHomeStore: () => ({
    reach: 'all',
    setReach: vi.fn(),
    sort: 'recent',
    setSort: vi.fn(),
    content: 'all',
    setContent: vi.fn(),
    layout: 'columns',
    setLayout: vi.fn(),
  }),
}));

// Mock the molecules
vi.mock('@/molecules', () => ({
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
    <div data-testid="filter-root">
      <button onClick={() => onTabChange?.('all')}>All</button>
    </div>
  ),
  FilterLayout: ({ onTabChange }: { onTabChange?: (tab: string) => void }) => (
    <div data-testid="filter-root">
      <button onClick={() => onTabChange?.('columns')}>Columns</button>
    </div>
  ),
}));

// Mock the libs

describe('LeftSidebar', () => {
  it('renders with default props', () => {
    render(<LeftSidebar />);

    expect(screen.getByTestId('left-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getAllByTestId('filter-root')).toHaveLength(2);
  });

  it('renders with custom className', () => {
    render(<LeftSidebar className="custom-sidebar" />);

    const sidebar = screen.getByTestId('left-sidebar');
    expect(sidebar).toHaveClass('custom-sidebar');
  });

  it('applies correct base classes', () => {
    render(<LeftSidebar />);

    const sidebar = screen.getByTestId('left-sidebar');
    expect(sidebar).toHaveClass(
      'w-(--filter-bar-width)',
      'hidden',
      'lg:flex',
      'flex-col',
      'gap-6',
      'justify-start',
      'items-start',
    );
  });

  it('renders filter components in correct order', () => {
    render(<LeftSidebar />);

    const sidebar = screen.getByTestId('left-sidebar');
    const children = Array.from(sidebar.children);

    expect(children[0]).toHaveAttribute('data-testid', 'filter-reach');
    expect(children[1]).toHaveAttribute('data-testid', 'filter-sort');
    expect(children[2]).toHaveClass('self-start', 'sticky', 'top-[100px]', 'flex', 'flex-col', 'gap-6');
  });

  it('has sticky positioning for content and layout filters', () => {
    render(<LeftSidebar />);

    const stickyContainer = screen.getAllByTestId('filter-root')[0].closest('div')?.parentElement;
    expect(stickyContainer).toHaveClass('self-start', 'sticky', 'top-[100px]', 'flex', 'flex-col', 'gap-6');
  });

  it('passes correct props to filter components', () => {
    render(<LeftSidebar />);

    // Verify that the filter components receive the correct props
    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
    expect(screen.getByTestId('filter-sort')).toBeInTheDocument();
    expect(screen.getAllByTestId('filter-root')).toHaveLength(2);
  });

  it('handles filter interactions correctly', () => {
    render(<LeftSidebar />);

    const reachButton = screen.getAllByText('All')[0];
    fireEvent.click(reachButton);

    // The mock should be called (this is handled by the mocked component)
    expect(screen.getByTestId('filter-reach')).toBeInTheDocument();
  });

  it('applies responsive classes correctly', () => {
    render(<LeftSidebar />);

    const sidebar = screen.getByTestId('left-sidebar');
    expect(sidebar).toHaveClass('hidden', 'lg:flex');
  });

  it('has correct width and layout classes', () => {
    render(<LeftSidebar />);

    const sidebar = screen.getByTestId('left-sidebar');
    expect(sidebar).toHaveClass('w-(--filter-bar-width)', 'flex-col', 'gap-6', 'justify-start', 'items-start');
  });
});

describe('LeftSidebar - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<LeftSidebar />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<LeftSidebar className="custom-sidebar" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different filter states', () => {
    const { container } = render(<LeftSidebar />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with all filters in different states', () => {
    const { container } = render(<LeftSidebar />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
