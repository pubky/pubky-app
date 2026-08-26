import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { iconNames } from 'lucide-react/dynamic.js';
import { describe, expect, it, vi } from 'vitest';
import { IconPickerDialog } from './IconPickerDialog';

const TEST_ICONS = ['activity', 'airplay', 'mountain'] as const;
const SNAPSHOT_ICONS = iconNames.slice(0, 8);

async function waitForCatalog() {
  await waitFor(() => {
    if (screen.queryByTestId('icon-picker-loading')) {
      throw new Error('Catalog chunk is still loading');
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
    // An explicit icon list needs no catalog chunk — the grid is up instantly.
    expect(screen.getByRole('button', { name: 'activity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'airplay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mountain' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-picker-scroll-area')).not.toHaveAttribute('aria-busy');
    expect(screen.getByTestId('icon-picker-dialog-content')).toHaveClass('flex-col', 'gap-6');
    expect(screen.getByTestId('icon-picker-dialog-content')).toHaveClass('h-110');
    expect(screen.getByRole('searchbox', { name: 'Search for icon' })).toHaveClass('border-dashed');
    expect(screen.getByRole('searchbox', { name: 'Search for icon' })).toHaveClass('rounded-md');

    await waitForResolvedIcons(TEST_ICONS);
  });

  it('uses the lg width preset with a ten-column desktop grid', () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={TEST_ICONS} />);

    expect(screen.getByTestId('icon-picker-dialog-content')).toHaveClass('w-lg', 'sm:max-w-lg');
    expect(screen.getByTestId('icon-picker-grid')).toHaveClass('grid-cols-6', 'sm:grid-cols-10');
  });

  it('announces the result count to assistive tech', () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={TEST_ICONS} />);

    expect(screen.getByRole('status')).toHaveTextContent('3 icons');
  });

  it('shows a themed clear button only while a query is present', () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={TEST_ICONS} />);

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

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for icon' }), {
      target: { value: 'mount' },
    });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'activity' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'mountain' })).toBeInTheDocument();
  });

  it('normalizes spaces in search queries', async () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={['circle-alert', 'activity']} />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for icon' }), {
      target: { value: 'circle alert' },
    });

    await waitFor(() => expect(screen.queryByRole('button', { name: 'activity' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'circle alert' })).toBeInTheDocument();
  });

  it('returns the selected icon and closes the dialog', () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <IconPickerDialog open onOpenChange={onOpenChange} onSelect={onSelect} value="activity" icons={TEST_ICONS} />,
    );

    expect(screen.getByRole('button', { name: 'activity' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'mountain' }));

    expect(onSelect).toHaveBeenCalledWith('mountain');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('filters malformed names supplied by a consumer', () => {
    render(<IconPickerDialog open onSelect={() => {}} icons={['Not A Real Icon']} />);

    expect(screen.getByText('No icons found')).toBeInTheDocument();
  });

  it('lazily loads the catalog and maps alias queries to their canonical icon', async () => {
    render(<IconPickerDialog open onSelect={() => {}} />);

    // Catalog chunk resolves asynchronously on first open.
    await waitForCatalog();

    // 'home' is a deprecated alias of 'house' — no canonical name contains it.
    fireEvent.change(screen.getByTestId('icon-picker-search'), { target: { value: 'home' } });
    await waitFor(() => expect(screen.getByTestId('icon-picker-option-house')).toBeInTheDocument());
  });

  it('surfaces a failed catalog load instead of hanging on the loading state', async () => {
    const lucide = await import('@/libs/lucide/lucideIcons');
    const spy = vi.spyOn(lucide, 'loadLucidePickerIcons').mockRejectedValue(new Error('chunk 404'));

    render(<IconPickerDialog open onSelect={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('icon-picker-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('icon-picker-loading')).not.toBeInTheDocument();

    spy.mockRestore();
  });

  it('matches vocabulary searches through lucide tags', async () => {
    render(<IconPickerDialog open onSelect={() => {}} />);
    await waitForCatalog();

    // 'garbage' is a tag of the trash icons, not a substring of any name.
    fireEvent.change(screen.getByTestId('icon-picker-search'), { target: { value: 'garbage' } });
    await waitFor(() => expect(screen.getByTestId('icon-picker-option-trash-2')).toBeInTheDocument());
  });

  it('renders the catalog progressively with a load-more sentinel', async () => {
    render(<IconPickerDialog open onSelect={() => {}} />);
    await waitForCatalog();

    // First batch only — cells never unmount, so every rendered icon stays
    // reachable by keyboard and its chunk is requested at most once.
    const buttons = screen.getAllByTestId(/icon-picker-option-/);
    expect(buttons.length).toBe(150);
    expect(screen.getByTestId('icon-picker-sentinel')).toBeInTheDocument();
  });

  it('paints catalog icons straight from the bundle, with no per-icon load', async () => {
    render(<IconPickerDialog open onSelect={() => {}} />);
    await waitForCatalog();

    // The picker loads every icon node in one chunk, so a cell must never show
    // the empty placeholder svg that the per-icon path renders while loading.
    const cells = screen.getAllByTestId(/icon-picker-option-/);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((cell) => (cell.querySelector('svg')?.childElementCount ?? 0) > 0)).toBe(true);
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

  it('stops selection clicks from reaching a clickable ancestor', () => {
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <IconPickerDialog open onSelect={() => {}} icons={TEST_ICONS} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'activity' }));

    expect(ancestorClick).not.toHaveBeenCalled();
  });
});

describe('IconPickerDialog - Snapshots', () => {
  it('matches snapshot for the empty state', () => {
    const { baseElement } = render(<IconPickerDialog open onSelect={() => {}} icons={[]} />);

    expect(baseElement).toMatchSnapshot();
  });

  it('matches snapshot for the icon grid', async () => {
    const { baseElement } = render(<IconPickerDialog open onSelect={() => {}} icons={SNAPSHOT_ICONS} />);

    await waitForResolvedIcons(SNAPSHOT_ICONS);

    expect(baseElement).toMatchSnapshot();
  });
});
