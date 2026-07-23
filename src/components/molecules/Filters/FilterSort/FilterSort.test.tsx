import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SORT } from '@/stores/home/home.types';
import { FilterSort } from './FilterSort';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
});

async function selectSortOption(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Sort' }));
  await user.click(screen.getByRole('option', { name: label }));
}

describe('FilterSort', () => {
  it('renders the current option in a dropdown trigger', () => {
    render(<FilterSort />);

    expect(screen.getByText('Sort')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Recent');
  });

  it('calls onTabChange when an option is selected', async () => {
    const onTabChange = vi.fn();
    render(<FilterSort onTabChange={onTabChange} />);

    await selectSortOption('Popularity');

    expect(onTabChange).toHaveBeenCalledWith(SORT.ENGAGEMENT);
  });

  it('supports both sort options', async () => {
    const onTabChange = vi.fn();
    render(<FilterSort onTabChange={onTabChange} />);

    await selectSortOption('Popularity');
    await selectSortOption('Recent');

    expect(onTabChange).toHaveBeenNthCalledWith(1, SORT.ENGAGEMENT);
    expect(onTabChange).toHaveBeenNthCalledWith(2, SORT.TIMELINE);
  });

  it('updates the trigger when the controlled selection changes', () => {
    const { rerender } = render(<FilterSort selectedTab={SORT.TIMELINE} />);

    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Recent');

    rerender(<FilterSort selectedTab={SORT.ENGAGEMENT} />);

    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveTextContent('Popularity');
  });

  it('disables the dropdown when the filter is disabled', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(<FilterSort disabled onTabChange={onTabChange} />);

    const trigger = screen.getByRole('combobox', { name: 'Sort' });
    expect(trigger).toBeDisabled();

    await user.click(trigger);

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('renders enabled options by default', async () => {
    const user = userEvent.setup();
    render(<FilterSort />);

    await user.click(screen.getByRole('combobox', { name: 'Sort' }));

    expect(screen.getByRole('option', { name: 'Recent' })).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('option', { name: 'Popularity' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('uses the secondary foreground color when an option is hovered', async () => {
    const user = userEvent.setup();
    render(<FilterSort />);

    await user.click(screen.getByRole('combobox', { name: 'Sort' }));

    expect(screen.getByRole('option', { name: 'Popularity' })).toHaveClass(
      'font-medium',
      'hover:text-secondary-foreground',
      'data-[highlighted]:text-secondary-foreground',
    );
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
