import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';
import { CollectionLayoutPicker } from './CollectionLayoutPicker';

function renderPicker({
  layout = COLLECTION_LAYOUT.GRID,
  onLayoutChange = vi.fn(),
}: {
  layout?: CollectionLayout;
  onLayoutChange?: (layout: CollectionLayout) => void;
} = {}) {
  const result = render(<CollectionLayoutPicker layout={layout} onLayoutChange={onLayoutChange} />);
  return { ...result, onLayoutChange };
}

function openDesktopPicker() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Layout: Grid' }), {
    button: 0,
    ctrlKey: false,
  });
}

describe('CollectionLayoutPicker', () => {
  it('uses the PostSavePicker row style and selected check on desktop', async () => {
    const { onLayoutChange } = renderPicker();

    openDesktopPicker();

    const gridOption = await screen.findByRole('menuitem', { name: 'Grid' });
    const listOption = screen.getByRole('menuitem', { name: 'List' });
    expect(gridOption).toHaveClass('w-full', 'gap-2', 'p-0', 'text-base', 'font-medium', 'text-muted-foreground');
    expect(gridOption.querySelector('.lucide-check')).toHaveClass('text-brand');
    expect(listOption.querySelector('.lucide-rows-4')).toBeInTheDocument();
    expect(listOption.querySelector('.lucide-check')).not.toBeInTheDocument();

    fireEvent.click(listOption);

    expect(onLayoutChange).toHaveBeenCalledWith(COLLECTION_LAYOUT.LIST);
  });

  it('hides the override trigger below the desktop breakpoint', () => {
    renderPicker();

    expect(screen.getByRole('button', { name: 'Layout: Grid' })).toHaveClass('hidden', 'lg:inline-flex');
  });

  it('uses the standard List icon in the trigger', () => {
    renderPicker({ layout: COLLECTION_LAYOUT.LIST });

    expect(screen.getByRole('button', { name: 'Layout: List' }).querySelector('.lucide-rows-4')).toBeInTheDocument();
  });

  it('offers the Visual option and reports its selection', async () => {
    const { onLayoutChange } = renderPicker();

    openDesktopPicker();

    const visualOption = await screen.findByRole('menuitem', { name: 'Visual' });
    expect(visualOption).toHaveAttribute('data-cy', 'collection-layout-visual');
    expect(visualOption.querySelector('.lucide-layout-grid')).toBeInTheDocument();
    expect(visualOption.querySelector('.lucide-check')).not.toBeInTheDocument();

    fireEvent.click(visualOption);

    expect(onLayoutChange).toHaveBeenCalledWith(COLLECTION_LAYOUT.VISUAL);
  });

  it('uses the Visual icon and label in the trigger when Visual is active', async () => {
    renderPicker({ layout: COLLECTION_LAYOUT.VISUAL });

    const trigger = screen.getByRole('button', { name: 'Layout: Visual' });
    expect(trigger.querySelector('.lucide-layout-grid')).toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const visualOption = await screen.findByRole('menuitem', { name: 'Visual' });
    expect(visualOption.querySelector('.lucide-check')).toHaveClass('text-brand');
  });

  it('matches the open desktop picker snapshot', async () => {
    renderPicker();

    openDesktopPicker();
    await screen.findByRole('menuitem', { name: 'Grid' });

    expect(document.body).toMatchSnapshot();
  });
});
