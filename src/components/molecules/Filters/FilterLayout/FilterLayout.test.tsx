import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterLayout } from './FilterLayout';
import { LAYOUT, type LayoutType } from '@/stores/home/home.types';
describe('FilterLayout', () => {
  it('renders with default selected tab', () => {
    render(<FilterLayout />);

    expect(screen.getByText('Layout')).toBeInTheDocument();
  });

  it('calls onTabChange when tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<FilterLayout onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Wide'));
    expect(onTabChange).toHaveBeenCalledWith('wide');
  });

  it('handles all tab types correctly', () => {
    const onTabChange = vi.fn();
    render(<FilterLayout onTabChange={onTabChange} />);

    ([LAYOUT.COLUMNS, LAYOUT.WIDE] as LayoutType[]).forEach((tab) => {
      const label = tab === LAYOUT.COLUMNS ? 'Columns' : 'Wide';
      fireEvent.click(screen.getByText(label));
      expect(onTabChange).toHaveBeenCalledWith(tab);
    });
  });

  it('rerenders with different selected tabs', () => {
    const { rerender } = render(<FilterLayout selectedTab={LAYOUT.COLUMNS} />);

    let columnsItem = screen.getByText('Columns').closest('[data-testid="filter-item"]');
    const wideItem = screen.getByText('Wide').closest('[data-testid="filter-item"]');
    expect(columnsItem).toBeInTheDocument();
    expect(wideItem).toBeInTheDocument();

    rerender(<FilterLayout selectedTab={LAYOUT.WIDE} />);
    columnsItem = screen.getByText('Columns').closest('[data-testid="filter-item"]');
    const wideItem2 = screen.getByText('Wide').closest('[data-testid="filter-item"]');
    expect(columnsItem).toBeInTheDocument();
    expect(wideItem2).toBeInTheDocument();
  });

  it('renders all items as disabled when disabled prop is true', () => {
    render(<FilterLayout disabled />);

    const labels = ['Columns', 'Wide'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('does not call onTabChange when disabled', () => {
    const onTabChange = vi.fn();
    render(<FilterLayout disabled onTabChange={onTabChange} />);

    fireEvent.click(screen.getByText('Columns'));
    fireEvent.click(screen.getByText('Wide'));

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('items are not disabled by default', () => {
    render(<FilterLayout />);

    const labels = ['Columns', 'Wide'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('renders visual layout when enabled', () => {
    render(<FilterLayout showVisual />);

    expect(screen.getByText('Visual')).toBeInTheDocument();
  });

  it('falls back to columns for display when visual is selected but hidden', () => {
    render(<FilterLayout selectedTab={LAYOUT.VISUAL} showVisual={false} />);

    expect(screen.getByLabelText('Columns')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Visual')).not.toBeInTheDocument();
  });
});

describe('FilterLayout - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<FilterLayout />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Columns selected tab', () => {
    const { container } = render(<FilterLayout selectedTab={LAYOUT.COLUMNS} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Wide selected tab', () => {
    const { container } = render(<FilterLayout selectedTab={LAYOUT.WIDE} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with disabled state', () => {
    const { container } = render(<FilterLayout disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with hidden visual selection normalized to columns', () => {
    const { container } = render(<FilterLayout selectedTab={LAYOUT.VISUAL} showVisual={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
