import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerCategory, type PlayerPreferences } from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { asOpaque } from '@/test-utils/type-assertions';
import { MediaPlayerList } from './MediaPlayerList';

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

// Music's services, in their default order.
const MUSIC = ['YouTube', 'Spotify', 'SoundCloud', 'Mixcloud', 'TIDAL', 'Deezer', 'Apple Music'];
const MUSIC_IDS = ['youtube', 'spotify', 'soundcloud', 'mixcloud', 'tidal', 'deezer', 'apple-music'];
const CARD = 'Card (no player)';

const renderList = (players: Partial<PlayerPreferences> = {}, category: PlayerCategory = PlayerCategory.MUSIC) =>
  render(
    <MediaPlayerList
      category={category}
      players={{ playerOrder: [], hiddenPlayers: [], ...players }}
      onChange={mockOnChange}
    />,
  );
const rowNames = (name = 'Music') =>
  within(screen.getByRole('list', { name }))
    .queryAllByRole('listitem')
    .map((row) => row.textContent);
const openAdd = (name = 'Add a player to Music') => {
  fireEvent.pointerDown(screen.getByRole('button', { name }), { button: 0, ctrlKey: false });
  return screen.getByRole('menu', { name });
};
const rowRects = () =>
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const row = this.closest('[data-player]');
    const top = row ? [...MUSIC_IDS, 'card'].indexOf(row.getAttribute('data-player') ?? '') * 40 : 0;
    return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 36, width: 300, height: 36, toJSON: () => ({}) };
  });

describe('MediaPlayerList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the kind’s players in the default order under its name, with nothing to add', () => {
    renderList();

    expect(rowNames()).toEqual([...MUSIC, CARD]);
    expect(screen.queryByRole('button', { name: 'Add a player to Music' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Music' })).toBeInTheDocument();
  });

  it('lists only each kind’s own services', () => {
    renderList({}, PlayerCategory.VIDEO);
    expect(rowNames('Video')).toEqual(['YouTube', 'Vimeo', CARD]);
  });

  it('calls Podcasts’ Card the built-in player, first when the order starts with it', () => {
    renderList({ playerOrder: ['card'] }, PlayerCategory.PODCASTS);

    expect(rowNames('Podcasts')).toEqual(['Built-in player', 'YouTube', 'Spotify', 'Apple Podcasts']);
    expect(screen.getByRole('button', { name: 'Move Built-in player' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Built-in player' })).not.toBeInTheDocument();
  });

  it('gives each row a drag handle and a remove button named after its service', () => {
    renderList();
    const handle = screen.getByRole('button', { name: 'Move TIDAL' });

    expect(handle).toHaveAttribute('aria-roledescription', 'sortable');
    expect(handle).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('button', { name: 'Remove TIDAL' })).toBeInTheDocument();
  });

  it('lists the players in the viewer’s order, the removed ones only under Add', () => {
    renderList({ playerOrder: ['tidal', 'spotify'], hiddenPlayers: ['youtube', 'deezer'] });

    expect(rowNames()).toEqual(['TIDAL', 'Spotify', 'SoundCloud', 'Mixcloud', 'Apple Music', CARD]);
    expect(
      within(openAdd())
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['YouTube', 'Deezer']);
  });

  it('removes a player, keeping the order empty (Auto) while it is', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Spotify' }));

    expect(mockOnChange).toHaveBeenCalledWith([], ['spotify']);
  });

  it('removes a player from the viewer’s order', () => {
    renderList({ playerOrder: ['tidal', 'spotify', 'napster'], hiddenPlayers: ['vimeo'] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove TIDAL' }));

    expect(mockOnChange).toHaveBeenCalledWith(['spotify', 'napster'], ['vimeo', 'tidal']);
  });

  it('keeps another kind’s services in the order, after the list', () => {
    renderList({ playerOrder: ['vimeo', 'tidal'] });
    expect(rowNames()[0]).toBe('TIDAL');
    fireEvent.click(screen.getByRole('button', { name: 'Remove TIDAL' }));

    expect(mockOnChange).toHaveBeenCalledWith(['vimeo'], ['tidal']);
  });

  it('can remove the last player, then offers them all under Add', () => {
    const { unmount } = renderList({ hiddenPlayers: MUSIC_IDS.slice(0, -1) });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Apple Music' }));

    expect(mockOnChange).toHaveBeenCalledWith([], MUSIC_IDS);
    unmount();

    renderList({ hiddenPlayers: MUSIC_IDS });
    expect(rowNames()).toEqual([CARD]);
    expect(
      within(openAdd())
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(MUSIC);
  });

  it('adds a removed player back where it was while there is no order', () => {
    renderList({ hiddenPlayers: ['spotify', 'tidal'] });
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'TIDAL' }));

    expect(mockOnChange).toHaveBeenCalledWith([], ['spotify']);
  });

  it('keeps Auto, and the ids of a later version, when the order holds only those', () => {
    renderList({ playerOrder: ['napster'], hiddenPlayers: ['spotify'] });
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'Spotify' }));

    expect(mockOnChange).toHaveBeenCalledWith(['napster'], []);
  });

  it('adds a removed player back at the end of the viewer’s order', () => {
    renderList({ playerOrder: ['tidal', 'napster'], hiddenPlayers: ['spotify'] });
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'Spotify' }));

    expect(mockOnChange).toHaveBeenCalledWith(
      ['tidal', 'youtube', 'soundcloud', 'mixcloud', 'deezer', 'apple-music', 'spotify', 'napster'],
      [],
    );
  });

  it('saves the list as shown when a player is dropped on another with the pointer', () => {
    renderList({ hiddenPlayers: ['vimeo'], playerOrder: ['napster'] });
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'tidal' }, over: { id: 'youtube' } }));

    expect(mockOnChange).toHaveBeenCalledWith(
      ['tidal', 'youtube', 'spotify', 'soundcloud', 'mixcloud', 'deezer', 'apple-music', 'napster'],
      ['vimeo'],
    );
  });

  it('saves nothing for a drop on itself or outside the list', () => {
    renderList();
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'tidal' }, over: { id: 'tidal' } }));
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'tidal' }, over: null }));

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('moves a player with the keyboard: Space lifts, an arrow moves, Space drops', async () => {
    // Rows 40 px apart, so dnd-kit's keyboard coordinates find the next row.
    const rect = rowRects();
    try {
      renderList();
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

      expect(mockOnChange).toHaveBeenCalledWith(
        ['spotify', 'youtube', 'soundcloud', 'mixcloud', 'tidal', 'deezer', 'apple-music'],
        [],
      );
    } finally {
      rect.mockRestore();
    }
  });

  it('ends the list with Card (no player): a drag handle, the link icon, no remove button', () => {
    renderList();
    const row = within(screen.getByRole('list', { name: 'Music' }))
      .getAllByRole('listitem')
      .at(-1);

    expect(row).toHaveAttribute('data-player', 'card');
    expect(within(row as HTMLElement).getByRole('button', { name: `Move ${CARD}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Remove ${CARD}` })).not.toBeInTheDocument();
  });

  it('saves Card (no player) moved above a player with only what sits above it, the rest in Auto', () => {
    renderList();
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'card' }, over: { id: 'tidal' } }));

    expect(mockOnChange).toHaveBeenCalledWith(['youtube', 'spotify', 'soundcloud', 'mixcloud', 'card'], []);
  });

  it('saves Card (no player) moved to the top as Card alone: the services stay in Auto', () => {
    renderList();
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'card' }, over: { id: 'youtube' } }));

    expect(mockOnChange).toHaveBeenCalledWith(['card'], []);
  });

  it('places Card (no player) in a ranked order as shown', () => {
    renderList({ playerOrder: ['tidal', 'spotify'] });
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'card' }, over: { id: 'spotify' } }));

    expect(mockOnChange).toHaveBeenCalledWith(
      ['tidal', 'card', 'spotify', 'youtube', 'soundcloud', 'mixcloud', 'deezer', 'apple-music'],
      [],
    );
  });

  it('shows Card (no player) first when the order starts with it', () => {
    renderList({ playerOrder: ['card'] });

    expect(rowNames()).toEqual([CARD, ...MUSIC]);
  });

  it('does not store Card (no player) moved back to the end: Auto again', () => {
    renderList({ playerOrder: ['card'] });
    act(() => capturedDnd.onDragEnd?.({ active: { id: 'card' }, over: { id: 'apple-music' } }));

    expect(mockOnChange).toHaveBeenCalledWith([], []);
  });

  it('keeps Card (no player) first, and Auto, when a removed player is added back', () => {
    renderList({ playerOrder: ['card'], hiddenPlayers: ['spotify'] });
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'Spotify' }));

    expect(mockOnChange).toHaveBeenCalledWith(['card'], []);
  });

  it('drops Card (no player) from the order when a remove leaves it last', () => {
    renderList({
      playerOrder: ['youtube', 'spotify', 'soundcloud', 'mixcloud', 'tidal', 'apple-music', 'card', 'deezer'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Deezer' }));

    expect(mockOnChange).toHaveBeenCalledWith(
      ['youtube', 'spotify', 'soundcloud', 'mixcloud', 'tidal', 'apple-music'],
      ['deezer'],
    );
  });

  it('adds a removed player back below Card (no player) moved alone, keeping Auto', () => {
    renderList({ playerOrder: ['tidal', 'card'], hiddenPlayers: ['spotify'] });
    expect(rowNames()).toEqual(['TIDAL', CARD, 'YouTube', 'SoundCloud', 'Mixcloud', 'Deezer', 'Apple Music']);
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'Spotify' }));

    expect(mockOnChange).toHaveBeenCalledWith(['tidal', 'card'], []);
  });

  it('keeps Auto when a remove leaves Card (no player), moved alone, below every player', () => {
    const hidden = ['youtube', 'spotify', 'soundcloud', 'mixcloud', 'apple-music'];
    renderList({ playerOrder: ['tidal', 'card'], hiddenPlayers: hidden });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Deezer' }));

    expect(mockOnChange).toHaveBeenCalledWith([], [...hidden, 'deezer']);
  });

  it('adds a removed player back at the end of a ranked order with Card (no player) in it', () => {
    renderList({ playerOrder: ['tidal', 'card', 'youtube'], hiddenPlayers: ['spotify'] });
    fireEvent.click(within(openAdd()).getByRole('menuitem', { name: 'Spotify' }));

    expect(mockOnChange).toHaveBeenCalledWith(
      ['tidal', 'card', 'youtube', 'soundcloud', 'mixcloud', 'deezer', 'apple-music', 'spotify'],
      [],
    );
  });

  it('keeps Card (no player) first when every player is removed, so one added back stays below it', () => {
    renderList({ playerOrder: ['card'], hiddenPlayers: MUSIC_IDS.slice(0, -1) });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Apple Music' }));

    expect(mockOnChange).toHaveBeenCalledWith(['card'], MUSIC_IDS);
  });

  it('moves Card (no player) with the keyboard', async () => {
    const rect = rowRects();
    try {
      renderList();
      const handle = screen.getByRole('button', { name: `Move ${CARD}` });
      handle.focus();

      await act(async () => {
        fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
      });
      await act(async () => {
        fireEvent.keyDown(document, { code: 'ArrowUp', key: 'ArrowUp' });
      });
      await act(async () => {
        fireEvent.keyDown(document, { code: 'Space', key: ' ' });
      });

      expect(mockOnChange).toHaveBeenCalledWith(
        ['youtube', 'spotify', 'soundcloud', 'mixcloud', 'tidal', 'deezer', 'card'],
        [],
      );
    } finally {
      rect.mockRestore();
    }
  });
});
