import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { MediaLanguageList } from './MediaLanguageList';
import { WIKIPEDIA_LANGUAGES } from './MediaLanguageList.constants';

const mockOnChange = vi.fn();

// The drop handler the list gives dnd-kit, to drop with the pointer: jsdom has no layout to drag in.
type CapturedDragEnd = (event: { active: { id: string }; over: { id: string } | null }) => void;
const capturedDnd = vi.hoisted(() => ({ onDragEnd: undefined as CapturedDragEnd | undefined }));
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      capturedDnd.onDragEnd = asOpaque<CapturedDragEnd>(props.onDragEnd);
      return <actual.DndContext {...props} />;
    },
  };
});

const renderList = (languages: string[] = []) =>
  render(<MediaLanguageList languages={languages} onChange={mockOnChange} />);
const rowNames = () =>
  within(screen.getByRole('list', { name: 'Wikipedia languages' }))
    .queryAllByRole('listitem')
    .map((row) => row.textContent);
const openAdd = () => {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Add a Wikipedia language' }), {
    button: 0,
    ctrlKey: false,
  });
  return screen.getByRole('menu', { name: 'Add a Wikipedia language' });
};

describe('MediaLanguageList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is empty (Auto) until a language is added, with Add always there', () => {
    renderList();

    expect(rowNames()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Add a Wikipedia language' })).toBeInTheDocument();
  });

  it('lists the viewer’s languages in order by their own names, each with a handle and a remove button', () => {
    renderList(['fr', 'als', 'de']);

    expect(rowNames()).toEqual(['Français (fr)', 'Schwiizertüütsch (als)', 'Deutsch (de)']);
    const row = screen.getAllByTestId('media-language-row')[1];
    expect(row).toHaveAttribute('data-language', 'als');
    expect(within(row).getByText('Schwiizertüütsch (als)')).toHaveAttribute('lang', 'gsw');
    // The languages icon stands where a player's icon does, so the names line up.
    expect(row.querySelector('svg.lucide-languages')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Move Deutsch (de)' })).toHaveAttribute(
      'aria-roledescription',
      'sortable',
    );
    expect(screen.getByRole('button', { name: 'Remove Deutsch (de)' })).toBeInTheDocument();
  });

  it('offers every other Wikipedia language under Add, by its own name, in a menu that scrolls', () => {
    renderList(['de']);
    const menu = openAdd();
    const names = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent);

    expect(names).toHaveLength(WIKIPEDIA_LANGUAGES.length - 1);
    expect(names).toContain('Français (fr)');
    expect(names).toContain('Simple English (simple)');
    expect(names).not.toContain('Deutsch (de)');
    // By name, not by code: Eesti (et) comes before Español (es).
    expect(names.indexOf('Dansk (da)')).toBeLessThan(names.indexOf('Eesti (et)'));
    expect(names.indexOf('Eesti (et)')).toBeLessThan(names.indexOf('Español (es)'));
    expect(names.indexOf('Español (es)')).toBeLessThan(names.indexOf('Français (fr)'));
    // A code the runtime cannot name (Amis here) comes after every named language, with the others like it.
    const bare = names.indexOf('ami');
    expect(bare).toBeGreaterThan(0);
    expect(names.slice(0, bare).every((name) => name.endsWith(')'))).toBe(true);
    expect(names.slice(bare).some((name) => name.endsWith(')'))).toBe(false);
    expect(menu).toHaveClass('max-h-72', 'overflow-y-auto');
    expect(within(menu).getByText('Français (fr)')).toHaveAttribute('lang', 'fr');
    // The whole list renders into the menu: slow in jsdom under load.
  }, 15_000);

  it('adds a language at the end', () => {
    renderList(['de']);
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'Français (fr)' }));

    expect(mockOnChange).toHaveBeenCalledWith(['de', 'fr']);
  }, 15_000);

  it('removes a language', () => {
    renderList(['de', 'fr']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Deutsch (de)' }));
    expect(mockOnChange).toHaveBeenLastCalledWith(['fr']);
  });

  it('removes the last language, back to Auto', () => {
    renderList(['fr']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Français (fr)' }));
    expect(mockOnChange).toHaveBeenLastCalledWith([]);
  });

  it('saves a move as the new order', () => {
    renderList(['de', 'fr', 'it']);
    capturedDnd.onDragEnd?.({ active: { id: 'it' }, over: { id: 'de' } });

    expect(mockOnChange).toHaveBeenCalledWith(['it', 'de', 'fr']);
  });

  it('saves nothing for a drop on its own place or outside the list', () => {
    renderList(['de', 'fr']);
    capturedDnd.onDragEnd?.({ active: { id: 'de' }, over: { id: 'de' } });
    capturedDnd.onDragEnd?.({ active: { id: 'de' }, over: null });

    expect(mockOnChange).not.toHaveBeenCalled();
  });
});
