import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';
import { CollectionLayoutPicker } from './CollectionLayoutPicker';

const translations: Record<string, string> = {
  'collections.single.layout': 'Layout',
  'collections.single.layoutGrid': 'Grid',
  'collections.single.layoutList': 'List',
};

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      translations[`${namespace}.${key}`] ?? key,
}));

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

  it('matches the open desktop picker snapshot', async () => {
    renderPicker();

    openDesktopPicker();
    await screen.findByRole('menuitem', { name: 'Grid' });

    expect(document.body).toMatchSnapshot();
  });
});
