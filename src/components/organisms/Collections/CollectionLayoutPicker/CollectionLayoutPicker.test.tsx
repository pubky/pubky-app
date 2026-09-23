import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { CollectionLayoutPicker } from './CollectionLayoutPicker';

function renderPicker({
  layout = COLLECTION_LAYOUT.CARDS,
  onLayoutChange = vi.fn(),
}: {
  layout?: CollectionLayout;
  onLayoutChange?: (layout: CollectionLayout) => void;
} = {}) {
  const result = render(<CollectionLayoutPicker layout={layout} onLayoutChange={onLayoutChange} />);
  return { ...result, onLayoutChange };
}

function openDesktopPicker() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Layout: Cards' }), {
    button: 0,
    ctrlKey: false,
  });
}

describe('CollectionLayoutPicker', () => {
  it('uses the PostSavePicker row style and selected check on desktop', async () => {
    const { onLayoutChange } = renderPicker();

    openDesktopPicker();

    const gridOption = await screen.findByRole('menuitem', { name: 'Cards' });
    const listOption = screen.getByRole('menuitem', { name: 'List' });
    expect(gridOption).toHaveClass('w-full', 'gap-2', 'p-0', 'text-base', 'font-medium', 'text-muted-foreground');
    expect(gridOption.querySelector('.lucide-check')).toHaveClass('text-brand');
    expect(listOption.querySelector('.lucide-rows-4')).toBeInTheDocument();
    expect(listOption.querySelector('.lucide-check')).not.toBeInTheDocument();

    fireEvent.click(listOption);

    expect(onLayoutChange).toHaveBeenCalledWith(COLLECTION_LAYOUT.LIST);
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
    expect(visualOption.querySelector('.lucide-grid-2x2')).toBeInTheDocument();
    expect(visualOption.querySelector('.lucide-check')).not.toBeInTheDocument();

    fireEvent.click(visualOption);

    expect(onLayoutChange).toHaveBeenCalledWith(COLLECTION_LAYOUT.VISUAL);
  });

  it('uses the Visual icon and label in the trigger when Visual is active', async () => {
    renderPicker({ layout: COLLECTION_LAYOUT.VISUAL });

    const trigger = screen.getByRole('button', { name: 'Layout: Visual' });
    expect(trigger.querySelector('.lucide-grid-2x2')).toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const visualOption = await screen.findByRole('menuitem', { name: 'Visual' });
    expect(visualOption.querySelector('.lucide-check')).toHaveClass('text-brand');
  });

  it('matches the open desktop picker snapshot', async () => {
    renderPicker();

    openDesktopPicker();
    await screen.findByRole('menuitem', { name: 'Cards' });

    expect(document.body).toMatchSnapshot();
  });
});

describe('CollectionLayoutPicker - Mobile', () => {
  beforeEach(() => setMobileViewport());
  afterEach(() => resetViewport());

  it('offers the layouts supported by the phone feed', async () => {
    const { onLayoutChange } = renderPicker();
    openDesktopPicker();
    await screen.findByRole('menuitem', { name: 'Cards' });
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Cards', 'List']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'List' }));
    expect(onLayoutChange).toHaveBeenCalledExactlyOnceWith('list');
  });

  it('shows the Cards fallback without replacing the desktop Visual preference', async () => {
    const { onLayoutChange } = renderPicker({ layout: COLLECTION_LAYOUT.VISUAL });
    openDesktopPicker();
    const gridOption = await screen.findByRole('menuitem', { name: 'Cards' });
    expect(gridOption.querySelector('.lucide-check')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Visual' })).not.toBeInTheDocument();
    resetViewport();
    fireEvent(window, new Event('resize'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Layout: Visual', hidden: true })).toBeInTheDocument(),
    );
    expect(screen.getByRole('menuitem', { name: 'Visual' }).querySelector('.lucide-check')).toBeInTheDocument();
    expect(onLayoutChange).not.toHaveBeenCalled();
  });
});

describe('CollectionLayoutPicker - Mobile Snapshots', () => {
  beforeEach(() => setMobileViewport());
  afterEach(() => resetViewport());

  it('matches the open mobile picker snapshot', async () => {
    renderPicker();
    openDesktopPicker();
    await screen.findByRole('menuitem', { name: 'Cards' });
    expect(document.body).toMatchSnapshot();
  });
});

describe('CollectionLayoutPicker Cards', () => {
  it('reports a Cards selection and closes the picker', async () => {
    const { onLayoutChange } = renderPicker({ layout: COLLECTION_LAYOUT.LIST });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Layout: List' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cards' }));
    expect(onLayoutChange).toHaveBeenCalledExactlyOnceWith('grid');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers Cards, List and Visual without a duplicate Grid option', async () => {
    renderPicker();
    openDesktopPicker();
    const cards = await screen.findByRole('menuitem', { name: 'Cards' });
    expect(cards.querySelector('.lucide-layout-dashboard')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Cards', 'List', 'Visual']);
  });
});

function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: TooltipProvider });
}
