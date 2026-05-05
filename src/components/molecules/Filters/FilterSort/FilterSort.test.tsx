import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SORT, type SortType } from '@/stores/home/home.types';
import { FilterSort } from './FilterSort';

describe('FilterSort', () => {
  it('renders with default selected tab', () => {
    render(<FilterSort />);

    expect(screen.getByText('Sort')).toBeInTheDocument();
  });

  it('calls onTabChange when tab is clicked', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterSort onTabChange={mockOnTabChange} />);

    const popularityElement = screen.getByText('Popularity');
    fireEvent.click(popularityElement);

    expect(mockOnTabChange).toHaveBeenCalledWith(SORT.ENGAGEMENT); // 'total_engagement'
  });

  it('handles all tab types correctly', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterSort onTabChange={mockOnTabChange} />);

    const tabs: SortType[] = ['timeline', 'total_engagement'];

    tabs.forEach((tab) => {
      const element = screen.getByText(tab === 'timeline' ? 'Recent' : 'Popularity');

      fireEvent.click(element);
      expect(mockOnTabChange).toHaveBeenCalledWith(tab);
    });
  });

  it('handles tab switching correctly', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterSort selectedTab={SORT.TIMELINE} onTabChange={mockOnTabChange} />);

    // Click on popularity tab
    const popularityElement = screen.getByText('Popularity');
    fireEvent.click(popularityElement);

    expect(mockOnTabChange).toHaveBeenCalledWith(SORT.ENGAGEMENT); // 'total_engagement'
    expect(mockOnTabChange).toHaveBeenCalledTimes(1);
  });

  it('renders all items as disabled when disabled prop is true', () => {
    render(<FilterSort disabled />);

    const labels = ['Recent', 'Popularity'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('does not call onTabChange when disabled', () => {
    const mockOnTabChange = vi.fn();
    render(<FilterSort disabled onTabChange={mockOnTabChange} />);

    fireEvent.click(screen.getByText('Recent'));
    fireEvent.click(screen.getByText('Popularity'));

    expect(mockOnTabChange).not.toHaveBeenCalled();
  });

  it('items are not disabled by default', () => {
    render(<FilterSort />);

    const labels = ['Recent', 'Popularity'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('renders with different selected tabs', () => {
    const { rerender } = render(<FilterSort selectedTab={SORT.TIMELINE} />);

    let recentItem = screen.getByText('Recent').closest('[data-testid="filter-item"]');
    let popularityItem = screen.getByText('Popularity').closest('[data-testid="filter-item"]');

    expect(recentItem).toBeInTheDocument();
    expect(popularityItem).toBeInTheDocument();

    // Rerender with different selected tab
    rerender(<FilterSort selectedTab={SORT.ENGAGEMENT} />);

    recentItem = screen.getByText('Recent').closest('[data-testid="filter-item"]');
    popularityItem = screen.getByText('Popularity').closest('[data-testid="filter-item"]');

    expect(recentItem).toBeInTheDocument();
    expect(popularityItem).toBeInTheDocument();
  });
});

describe('FilterSort - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<FilterSort />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Recent content selected tab', () => {
    const { container } = render(<FilterSort selectedTab={SORT.TIMELINE} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Popularity content selected tab', () => {
    const { container } = render(<FilterSort selectedTab={SORT.ENGAGEMENT} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with disabled state', () => {
    const { container } = render(<FilterSort disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
