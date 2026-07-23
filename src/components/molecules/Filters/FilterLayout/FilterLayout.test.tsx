import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { LAYOUT } from '@/stores/home/home.types';
import { FilterLayout } from './FilterLayout';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
});

async function selectLayoutOption(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Layout' }));
  await user.click(screen.getByRole('option', { name: label }));
}

describe('FilterLayout', () => {
  it('renders the current option in a dropdown trigger', () => {
    render(<FilterLayout />);

    expect(screen.getByText('Layout')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveTextContent('Columns');
  });

  it('calls onTabChange when an option is selected', async () => {
    const onTabChange = vi.fn();
    render(<FilterLayout onTabChange={onTabChange} />);

    await selectLayoutOption('Wide');

    expect(onTabChange).toHaveBeenCalledWith(LAYOUT.WIDE);
  });

  it('supports all layout options', async () => {
    const onTabChange = vi.fn();
    render(<FilterLayout onTabChange={onTabChange} />);

    await selectLayoutOption('Wide');
    await selectLayoutOption('List');
    await selectLayoutOption('Columns');

    expect(onTabChange).toHaveBeenNthCalledWith(1, LAYOUT.WIDE);
    expect(onTabChange).toHaveBeenNthCalledWith(2, LAYOUT.LIST);
    expect(onTabChange).toHaveBeenNthCalledWith(3, LAYOUT.COLUMNS);
  });

  it('updates the trigger when the controlled selection changes', () => {
    const { rerender } = render(<FilterLayout selectedTab={LAYOUT.COLUMNS} />);

    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveTextContent('Columns');

    rerender(<FilterLayout selectedTab={LAYOUT.WIDE} />);

    expect(screen.getByRole('combobox', { name: 'Layout' })).toHaveTextContent('Wide');
  });

  it('disables the dropdown when the filter is disabled', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterLayout disabled onTabChange={onTabChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Layout' });
    expect(trigger).toBeDisabled();

    await user.click(trigger);

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('renders enabled options by default', async () => {
    const user = userEvent.setup();
    render(<FilterLayout />);

    await user.click(screen.getByRole('combobox', { name: 'Layout' }));

    for (const label of ['Columns', 'Wide', 'List']) {
      expect(screen.getByRole('option', { name: label })).not.toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('renders visual layout when enabled', async () => {
    const user = userEvent.setup();
    render(<FilterLayout showVisual />);

    await user.click(screen.getByRole('combobox', { name: 'Layout' }));

    expect(screen.getByRole('option', { name: 'Visual' })).toBeInTheDocument();
  });

  it('falls back to columns for display when visual is selected but hidden', async () => {
    const user = userEvent.setup();
    render(<FilterLayout selectedTab={LAYOUT.VISUAL} showVisual={false} />);

    const trigger = screen.getByRole('combobox', { name: 'Layout' });
    expect(trigger).toHaveTextContent('Columns');

    await user.click(trigger);

    expect(screen.queryByRole('option', { name: 'Visual' })).not.toBeInTheDocument();
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
