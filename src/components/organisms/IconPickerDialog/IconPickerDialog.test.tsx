import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LUCIDE_ICON_NAMES } from '@/libs/utils/lucideIcons';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { IconPickerDialog } from './IconPickerDialog';

const TEST_ICONS = ['activity', 'airplay', 'mountain'] as const;
const VIRTUAL_GRID_SNAPSHOT_ICONS = LUCIDE_ICON_NAMES.slice(0, 8);

async function finishOpeningAnimation() {
  fireEvent.animationEnd(screen.getByTestId('icon-picker-dialog-content'));
  await waitFor(() => {
    if (screen.queryByTestId('icon-picker-loading')) {
      throw new Error('Icon grid is still waiting for the opening animation');
    }
  });
}

// DynamicLucideIcon renders an empty svg while its chunk loads, so gate on the
// svg having children (via childElementCount — jsdom's querySelector misses
// svg descendants). Snapshots must wait for every icon they capture — the
// module-level cache makes a partial wait nondeterministic across test order.
async function waitForResolvedIcons(names: readonly string[]) {
  await waitFor(() => {
    for (const iconName of names) {
      const button = screen.getByRole('button', { name: iconName.replaceAll('-', ' ') });
      if (!(button.querySelector('svg')?.childElementCount ?? 0)) {
        throw new Error(`Icon ${iconName} is still loading`);
      }
    }
  });
}

describe('IconPickerDialog', () => {
  it('renders a searchable icon grid with visible SVGs when open', async () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={TEST_ICONS} />);

    expect(screen.getByRole('searchbox', { name: 'Search for icon' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-picker-scroll-area')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('icon-picker-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'activity' })).not.toBeInTheDocument();

    await finishOpeningAnimation();

    expect(screen.getByRole('button', { name: 'activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'airplay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mountain' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-picker-scroll-area')).not.toHaveAttribute('aria-busy');
    expect(screen.getByTestId('icon-picker-dialog-content')).toHaveClass('flex-col', 'gap-6');
    expect(screen.getByTestId('icon-picker-dialog-content')).toHaveClass('h-110');
    expect(screen.getByRole('searchbox', { name: 'Search for icon' })).toHaveClass('border-dashed');
    expect(screen.getByRole('searchbox', { name: 'Search for icon' })).toHaveClass('rounded-md');
    expect(screen.getByRole('searchbox', { name: 'Search for icon' })).not.toHaveClass('mt-6');
    expect(screen.getByTestId('icon-picker-scroll-area')).not.toHaveClass('mt-6');

    await waitForResolvedIcons(TEST_ICONS);
  });

  it('shows a themed clear button only while a query is present', async () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={TEST_ICONS} />);
    await finishOpeningAnimation();

    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    const searchbox = screen.getByRole('searchbox', { name: 'Search for icon' });
    fireEvent.change(searchbox, { target: { value: 'mount' } });

    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    expect(clearButton).toHaveClass('cursor-pointer');
    expect(clearButton).toHaveClass('text-muted-foreground');

    fireEvent.click(clearButton);

    expect(searchbox).toHaveValue('');
    expect(searchbox).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'activity' })).toBeInTheDocument();
  });

  it('filters icons by their kebab-case names', async () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={TEST_ICONS} />);
    await finishOpeningAnimation();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for icon' }), {
      target: { value: 'mount' },
    });

    expect(screen.getByRole('button', { name: 'mountain' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'activity' })).not.toBeInTheDocument();
  });

  it('normalizes spaces in search queries', async () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={['circle-alert', 'activity']} />);
    await finishOpeningAnimation();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for icon' }), {
      target: { value: 'circle alert' },
    });

    expect(screen.getByRole('button', { name: 'circle alert' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'activity' })).not.toBeInTheDocument();
  });

  it('returns the selected icon and closes the dialog', async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <IconPickerDialog open onOpenChange={onOpenChange} onSelect={onSelect} value="activity" icons={TEST_ICONS} />,
    );
    await finishOpeningAnimation();

    expect(screen.getByRole('button', { name: 'activity' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'mountain' }));

    expect(onSelect).toHaveBeenCalledWith('mountain');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('filters invalid names supplied by a consumer', () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={['not-a-real-icon']} />);

    expect(screen.getByText('No icons found')).toBeInTheDocument();
  });

  it('only mounts the virtualized rows around the scroll viewport', async () => {
    const icons = LUCIDE_ICON_NAMES.slice(0, 110);
    const initiallyHiddenIcon = icons[100];
    const initiallyVisibleIcon = icons[0];
    render(<IconPickerDialog open onSelect={() => {}} icons={icons} />);
    await finishOpeningAnimation();

    expect(screen.queryByTestId(`icon-picker-option-${initiallyHiddenIcon}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`icon-picker-option-${initiallyVisibleIcon}`)).toBeInTheDocument();

    const scrollArea = screen.getByTestId('icon-picker-scroll-area');
    Object.defineProperties(scrollArea, {
      clientHeight: { configurable: true, value: 208 },
      scrollTop: { configurable: true, value: 400 },
    });
    fireEvent.scroll(scrollArea);

    expect(screen.getByTestId(`icon-picker-option-${initiallyHiddenIcon}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`icon-picker-option-${initiallyVisibleIcon}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('icon-picker-virtual-space')).toHaveStyle({ height: '504px' });
  });

  it('supports context-specific accessible copy', () => {
    render(
      <IconPickerDialog
        open
        onSelect={() => {}}
        icons={[]}
        title="Choose a collection icon"
        description="Choose a custom icon for your collection."
        searchPlaceholder="Search collection icons"
        emptyMessage="No collection icons found"
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Choose a collection icon' })).toBeInTheDocument();
    expect(screen.getByText('Choose a custom icon for your collection.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search collection icons' })).toBeInTheDocument();
    expect(screen.getByText('No collection icons found')).toBeInTheDocument();
  });

  it('can manage its open state through a trigger', () => {
    render(
      <IconPickerDialog onSelect={() => {}} icons={TEST_ICONS}>
        <button type="button">Choose icon</button>
      </IconPickerDialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose icon' }));
    expect(screen.getByRole('dialog', { name: 'Choose icon' })).toBeInTheDocument();
  });

  it('stops selection clicks from reaching a clickable ancestor', async () => {
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <IconPickerDialog open onSelect={() => {}} icons={TEST_ICONS} />
      </div>,
    );
    await finishOpeningAnimation();

    fireEvent.click(screen.getByRole('button', { name: 'activity' }));

    expect(ancestorClick).not.toHaveBeenCalled();
  });
});

describe('IconPickerDialog - Snapshots', () => {
  it('matches snapshot for the empty state', () => {
    const { baseElement } = render(<IconPickerDialog open onSelect={() => {}} icons={[]} />);

    expect(baseElement).toMatchSnapshot();
  });

  it('matches snapshot for a virtualized desktop grid', async () => {
    const { baseElement } = render(<IconPickerDialog open onSelect={() => {}} icons={VIRTUAL_GRID_SNAPSHOT_ICONS} />);
    await finishOpeningAnimation();

    await waitForResolvedIcons(VIRTUAL_GRID_SNAPSHOT_ICONS);

    expect(baseElement).toMatchSnapshot();
  });
});

describe('IconPickerDialog - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot for a virtualized mobile grid', async () => {
    const { baseElement } = render(<IconPickerDialog open onSelect={() => {}} icons={VIRTUAL_GRID_SNAPSHOT_ICONS} />);
    await finishOpeningAnimation();

    await waitForResolvedIcons(VIRTUAL_GRID_SNAPSHOT_ICONS);

    expect(baseElement).toMatchSnapshot();
  });
});
