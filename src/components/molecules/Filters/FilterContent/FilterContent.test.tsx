import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { VISUAL_DISABLED_CONTENT } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedVisual.helpers';
import { CONTENT } from '@/stores/home/home.types';
import { FilterContent } from './FilterContent';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
});

async function selectContentOption(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Content' }));
  await user.click(screen.getByRole('option', { name: label }));
}

describe('FilterContent', () => {
  it('renders the current option in a dropdown trigger', () => {
    render(<FilterContent />);

    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Content' })).toHaveTextContent('All');
  });

  it('calls onTabChange when an option is selected', async () => {
    const onTabChange = vi.fn();
    render(<FilterContent onTabChange={onTabChange} />);

    await selectContentOption('Images');

    expect(onTabChange).toHaveBeenCalledWith(CONTENT.IMAGES);
  });

  it('supports all content options', async () => {
    const onTabChange = vi.fn();
    render(<FilterContent onTabChange={onTabChange} />);

    const options = [
      { value: CONTENT.SHORT, label: 'Posts' },
      { value: CONTENT.LONG, label: 'Articles' },
      { value: CONTENT.COLLECTIONS, label: 'Collections' },
      { value: CONTENT.IMAGES, label: 'Images' },
      { value: CONTENT.VIDEOS, label: 'Videos' },
      { value: CONTENT.LINKS, label: 'Links' },
      { value: CONTENT.FILES, label: 'Files' },
      { value: CONTENT.ALL, label: 'All' },
    ];

    for (const { label } of options) {
      await selectContentOption(label);
    }

    options.forEach(({ value }, index) => {
      expect(onTabChange).toHaveBeenNthCalledWith(index + 1, value);
    });
  }, 10_000);

  it('updates the trigger when the controlled selection changes', () => {
    const { rerender } = render(<FilterContent selectedTab={CONTENT.ALL} />);

    expect(screen.getByRole('combobox', { name: 'Content' })).toHaveTextContent('All');

    rerender(<FilterContent selectedTab={CONTENT.LONG} />);

    expect(screen.getByRole('combobox', { name: 'Content' })).toHaveTextContent('Articles');
  });

  it('handles multiple option selections', async () => {
    const onTabChange = vi.fn();
    render(<FilterContent onTabChange={onTabChange} />);

    await selectContentOption('Images');
    await selectContentOption('Videos');
    await selectContentOption('Files');

    expect(onTabChange).toHaveBeenNthCalledWith(1, CONTENT.IMAGES);
    expect(onTabChange).toHaveBeenNthCalledWith(2, CONTENT.VIDEOS);
    expect(onTabChange).toHaveBeenNthCalledWith(3, CONTENT.FILES);
  });

  it('disables the dropdown when the filter is disabled', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterContent disabled onTabChange={onTabChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Content' });
    expect(trigger).toBeDisabled();

    await user.click(trigger);

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('renders enabled options by default', async () => {
    const user = userEvent.setup();
    render(<FilterContent />);

    await user.click(screen.getByRole('combobox', { name: 'Content' }));

    for (const label of ['All', 'Posts', 'Articles', 'Collections', 'Images', 'Videos', 'Links', 'Files']) {
      expect(screen.getByRole('option', { name: label })).not.toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('disables only the requested options', async () => {
    const user = userEvent.setup();
    render(<FilterContent disabledTabs={VISUAL_DISABLED_CONTENT} />);

    await user.click(screen.getByRole('combobox', { name: 'Content' }));

    for (const label of ['Posts', 'Articles', 'Collections', 'Links', 'Files']) {
      expect(screen.getByRole('option', { name: label })).toHaveAttribute('aria-disabled', 'true');
    }
    for (const label of ['All', 'Images', 'Videos']) {
      expect(screen.getByRole('option', { name: label })).not.toHaveAttribute('aria-disabled', 'true');
    }
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
