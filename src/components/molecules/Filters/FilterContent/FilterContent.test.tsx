import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FilterContent } from './FilterContent';
import { CONTENT, type ContentType } from '@/core/stores/home/home.types';

// Mock libs - use actual utility functions and icons from lucide-react
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

describe('FilterContent', () => {
  it('renders with default selected tab', () => {
    render(<FilterContent />);

    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('calls onTabChange when tab is clicked', () => {
    const onTabChange = vi.fn();
    render(<FilterContent onTabChange={onTabChange} />);

    fireEvent.click(screen.getByText('Images'));
    expect(onTabChange).toHaveBeenCalledWith('images');
  });

  it('handles all tab types correctly', () => {
    const onTabChange = vi.fn();
    render(<FilterContent onTabChange={onTabChange} />);

    // Map of tab values to their display labels
    const tabsToTest: Array<{ value: ContentType; label: string }> = [
      { value: CONTENT.ALL, label: 'All' },
      { value: CONTENT.SHORT, label: 'Posts' },
      { value: CONTENT.LONG, label: 'Articles' },
      { value: CONTENT.IMAGES, label: 'Images' },
      { value: CONTENT.VIDEOS, label: 'Videos' },
      { value: CONTENT.LINKS, label: 'Links' },
      { value: CONTENT.FILES, label: 'Files' },
    ];

    tabsToTest.forEach(({ value, label }) => {
      fireEvent.click(screen.getByText(label));
      expect(onTabChange).toHaveBeenCalledWith(value);
    });
  });

  it('handles tab switching correctly', () => {
    const onTabChange = vi.fn();
    render(<FilterContent selectedTab={CONTENT.ALL} onTabChange={onTabChange} />);

    // Click on articles tab
    fireEvent.click(screen.getByText('Articles'));
    expect(onTabChange).toHaveBeenCalledWith(CONTENT.LONG); // 'long' is the value
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });

  it('handles multiple tab clicks', () => {
    const onTabChange = vi.fn();
    render(<FilterContent onTabChange={onTabChange} />);

    fireEvent.click(screen.getByText('Images'));
    fireEvent.click(screen.getByText('Videos'));
    fireEvent.click(screen.getByText('Files'));

    expect(onTabChange).toHaveBeenCalledTimes(3);
    expect(onTabChange).toHaveBeenNthCalledWith(1, 'images');
    expect(onTabChange).toHaveBeenNthCalledWith(2, 'videos');
    expect(onTabChange).toHaveBeenNthCalledWith(3, 'files');
  });
});

describe('FilterContent - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<FilterContent />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with All content selected tab', () => {
    const { container } = render(<FilterContent selectedTab={CONTENT.ALL} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Posts content selected tab', () => {
    const { container } = render(<FilterContent selectedTab={CONTENT.SHORT} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Articles content selected tab', () => {
    const { container } = render(<FilterContent selectedTab={CONTENT.LONG} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Images content selected tab', () => {
    const { container } = render(<FilterContent selectedTab={CONTENT.IMAGES} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Videos content selected tab', () => {
    const { container } = render(<FilterContent selectedTab={CONTENT.VIDEOS} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Links content selected tab', () => {
    const { container } = render(<FilterContent selectedTab={CONTENT.LINKS} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Files content selected tab', () => {
    const { container } = render(<FilterContent selectedTab={CONTENT.FILES} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
