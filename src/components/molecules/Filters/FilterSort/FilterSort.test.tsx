import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterSort } from './FilterSort';
import { SORT, type SortType } from '@/core/stores/home/home.types';

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

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
});
