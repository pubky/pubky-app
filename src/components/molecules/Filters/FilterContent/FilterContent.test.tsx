import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VISUAL_DISABLED_CONTENT } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedVisual.helpers';
import { CONTENT, type ContentType } from '@/stores/home/home.types';
import { FilterContent } from './FilterContent';

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
      { value: CONTENT.COLLECTIONS, label: 'Collections' },
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

  it('renders all items as disabled when disabled prop is true', () => {
    render(<FilterContent disabled />);

    const labels = ['All', 'Posts', 'Articles', 'Collections', 'Images', 'Videos', 'Links', 'Files'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('does not call onTabChange when disabled', () => {
    const onTabChange = vi.fn();
    render(<FilterContent disabled onTabChange={onTabChange} />);

    fireEvent.click(screen.getByText('Images'));
    fireEvent.click(screen.getByText('Videos'));
    fireEvent.click(screen.getByText('Files'));

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('items are not disabled by default', () => {
    render(<FilterContent />);

    const labels = ['All', 'Posts', 'Articles', 'Collections', 'Images', 'Videos', 'Links', 'Files'];
    labels.forEach((label) => {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('disables only the requested tabs', () => {
    render(<FilterContent disabledTabs={VISUAL_DISABLED_CONTENT} />);

    expect(screen.getByLabelText('Posts')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Articles')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Collections')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Links')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Files')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('All')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Images')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Videos')).not.toHaveAttribute('aria-disabled', 'true');
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

  it('matches snapshot with Collections content selected tab', () => {
    const { container } = render(<FilterContent selectedTab={CONTENT.COLLECTIONS} />);
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

  it('matches snapshot with disabled state', () => {
    const { container } = render(<FilterContent disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
