import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultMediaPreferences, type MediaPreferences } from '@/stores/settings/settings.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { MediaSettings } from './MediaSettings';

const mockSetPlayers = vi.fn();
const mockSetEmbedsUpFront = vi.fn();
const mockUseSettingsStore = vi.fn();

vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: () => mockUseSettingsStore(),
}));

vi.mock('@/hooks/useSettingsActions/useSettingsActions', () => ({
  useSettingsActions: () => ({
    setPlayers: mockSetPlayers,
    setEmbedsUpFront: mockSetEmbedsUpFront,
  }),
}));

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

const ALL = ['YouTube', 'Vimeo', 'Spotify', 'SoundCloud', 'Mixcloud', 'TIDAL', 'Deezer'];
const ALL_IDS = ['youtube', 'vimeo', 'spotify', 'soundcloud', 'mixcloud', 'tidal', 'deezer'];

const setMedia = (media: Partial<MediaPreferences>) =>
  mockUseSettingsStore.mockReturnValue({ media: { ...defaultMediaPreferences, ...media } });
const rowNames = () =>
  within(screen.getByRole('list', { name: 'Players' }))
    .queryAllByRole('listitem')
    .map((row) => row.textContent);
const openAdd = () => {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Add a player' }), { button: 0, ctrlKey: false });
  return screen.getByRole('menu', { name: 'Add a player' });
};

describe('MediaSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMedia({});
  });

  it('lists every player in the default order, with nothing to add, and platform embeds up front on', () => {
    render(<MediaSettings />);

    expect(rowNames()).toEqual(ALL);
    expect(screen.getByText(/^Cards play on the first of these services they are on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a player' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show platform embeds up front' })).toBeChecked();
    expect(screen.queryByText('Default music player')).not.toBeInTheDocument();
  });

  it('gives each row a drag handle and a remove button named after its service', () => {
    render(<MediaSettings />);
    const handle = screen.getByRole('button', { name: 'Move TIDAL' });

    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
    expect(handle).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: 'Remove TIDAL' })).toBeInTheDocument();
  });

  it('lists the players in the viewer’s order, the removed ones only under Add', () => {
    setMedia({ playerOrder: ['tidal', 'spotify'], hiddenPlayers: ['youtube', 'deezer'] });
    render(<MediaSettings />);

    expect(rowNames()).toEqual(['TIDAL', 'Spotify', 'Vimeo', 'SoundCloud', 'Mixcloud']);
    expect(
      within(openAdd())
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['YouTube', 'Deezer']);
  });

  it('removes a player, keeping the order empty (Auto) while it is', () => {
    render(<MediaSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Spotify' }));

    expect(mockSetPlayers).toHaveBeenCalledWith([], ['spotify']);
  });

  it('removes a player from the viewer’s order', () => {
    setMedia({ playerOrder: ['tidal', 'spotify', 'napster'], hiddenPlayers: ['vimeo'] });
    render(<MediaSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove TIDAL' }));

    expect(mockSetPlayers).toHaveBeenCalledWith(['spotify', 'napster'], ['vimeo', 'tidal']);
  });

  it('can remove the last player, then offers them all under Add', () => {
    setMedia({ hiddenPlayers: ALL_IDS.slice(0, -1) });
    const { unmount } = render(<MediaSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Deezer' }));

    expect(mockSetPlayers).toHaveBeenCalledWith([], ALL_IDS);
    unmount();

    setMedia({ hiddenPlayers: ALL_IDS });
    render(<MediaSettings />);
    expect(rowNames()).toEqual([]);
    expect(
      within(openAdd())
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(ALL);
  });

  it('adds a removed player back where it was while there is no order', () => {
    setMedia({ hiddenPlayers: ['spotify', 'tidal'] });
    render(<MediaSettings />);
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'TIDAL' }));

    expect(mockSetPlayers).toHaveBeenCalledWith([], ['spotify']);
  });

  it('keeps Auto, and the ids of a later version, when the order holds only those', () => {
    setMedia({ playerOrder: ['napster'], hiddenPlayers: ['spotify'] });
    render(<MediaSettings />);
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'Spotify' }));

    expect(mockSetPlayers).toHaveBeenCalledWith(['napster'], []);
  });

  it('adds a removed player back at the end of the viewer’s order', () => {
    setMedia({ playerOrder: ['tidal', 'napster'], hiddenPlayers: ['spotify'] });
    render(<MediaSettings />);
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'Spotify' }));

    expect(mockSetPlayers).toHaveBeenCalledWith(
      ['tidal', 'youtube', 'vimeo', 'soundcloud', 'mixcloud', 'deezer', 'spotify', 'napster'],
      [],
    );
  });

  it('saves the list as shown when a player is dropped on another with the pointer', () => {
    setMedia({ hiddenPlayers: ['vimeo'], playerOrder: ['napster'] });
    render(<MediaSettings />);
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'tidal' }, over: { id: 'youtube' } }));

    expect(mockSetPlayers).toHaveBeenCalledWith(
      ['tidal', 'youtube', 'spotify', 'soundcloud', 'mixcloud', 'deezer', 'napster'],
      ['vimeo'],
    );
  });

  it('saves nothing for a drop on itself or outside the list', () => {
    render(<MediaSettings />);
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'tidal' }, over: { id: 'tidal' } }));
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'tidal' }, over: null }));

    expect(mockSetPlayers).not.toHaveBeenCalled();
  });

  it('moves a player with the keyboard: Space lifts, an arrow moves, Space drops', async () => {
    // Rows 40 px apart, so dnd-kit's keyboard coordinates find the next row.
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const row = this.closest('[data-player]');
      const top = row ? ALL_IDS.indexOf(row.getAttribute('data-player') ?? '') * 40 : 0;
      return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 36, width: 300, height: 36, toJSON: () => ({}) };
    });
    try {
      render(<MediaSettings />);
      const handle = screen.getByRole('button', { name: 'Move YouTube' });
      handle.focus();

      await act(async () => {
        fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
      });
      await act(async () => {
        fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
      });
      await act(async () => {
        fireEvent.keyDown(document, { code: 'Space', key: ' ' });
      });

      expect(mockSetPlayers).toHaveBeenCalledWith(
        ['vimeo', 'youtube', 'spotify', 'soundcloud', 'mixcloud', 'tidal', 'deezer'],
        [],
      );
    } finally {
      rect.mockRestore();
    }
  });

  it('shows platform embeds up front off once turned off', () => {
    setMedia({ embedsUpFront: false });
    render(<MediaSettings />);

    expect(screen.getByRole('switch', { name: 'Show platform embeds up front' })).not.toBeChecked();
    expect(screen.getByText(/^When off, links show their card/)).toBeInTheDocument();
  });

  it('turns platform embeds up front off', () => {
    render(<MediaSettings />);
    fireEvent.click(screen.getByRole('switch', { name: 'Show platform embeds up front' }));

    expect(mockSetEmbedsUpFront).toHaveBeenCalledWith(false);
  });
});
