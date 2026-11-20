import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultMediaPreferences, type MediaPreferences } from '@/stores/settings/settings.types';
import { MediaSettings } from './MediaSettings';

const mockSetPlayers = vi.fn();
const mockSetEmbedsUpFront = vi.fn();
const mockSetLanguages = vi.fn();
const mockUseSettingsStore = vi.fn();

vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: () => mockUseSettingsStore(),
}));

vi.mock('@/hooks/useSettingsActions/useSettingsActions', () => ({
  useSettingsActions: () => ({
    setPlayers: mockSetPlayers,
    setEmbedsUpFront: mockSetEmbedsUpFront,
    setLanguages: mockSetLanguages,
  }),
}));

const CARD = 'Card (no player)';
const BUILT_IN = 'Built-in player';

const setMedia = (media: Partial<MediaPreferences>) =>
  mockUseSettingsStore.mockReturnValue({ media: { ...defaultMediaPreferences, ...media } });
const rowNames = (name: string) =>
  within(screen.getByRole('list', { name }))
    .queryAllByRole('listitem')
    .map((row) => row.textContent);

describe('MediaSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMedia({});
  });

  it('lists the players of music, podcasts and video apart, podcasts with the built-in player first', () => {
    render(<MediaSettings />);

    expect(screen.getByText('Players')).toBeInTheDocument();
    expect(screen.getByText(/^Cards play on the first of these services they are on/)).toBeInTheDocument();
    expect(rowNames('Music')).toEqual([
      'YouTube',
      'Spotify',
      'SoundCloud',
      'Mixcloud',
      'TIDAL',
      'Deezer',
      'Apple Music',
      CARD,
    ]);
    expect(rowNames('Podcasts')).toEqual([BUILT_IN, 'YouTube', 'Spotify', 'Apple Podcasts']);
    expect(rowNames('Video')).toEqual(['YouTube', 'Vimeo', CARD]);
    expect(screen.queryByText('Default music player')).not.toBeInTheDocument();
  });

  it('shows the players set before they had kinds in every list until that list is changed', () => {
    setMedia({
      playerOrder: ['tidal', 'spotify'],
      hiddenPlayers: ['youtube'],
      players: { music: { order: ['deezer'], hidden: [] } },
    });
    render(<MediaSettings />);

    expect(rowNames('Music')).toEqual([
      'Deezer',
      'YouTube',
      'Spotify',
      'SoundCloud',
      'Mixcloud',
      'TIDAL',
      'Apple Music',
      CARD,
    ]);
    expect(rowNames('Podcasts')).toEqual([BUILT_IN, 'Spotify', 'Apple Podcasts']);
    expect(rowNames('Video')).toEqual(['Vimeo', CARD]);
  });

  it('saves a change to one list as that kind’s players', () => {
    render(<MediaSettings />);
    const podcasts = screen.getByRole('list', { name: 'Podcasts' });
    fireEvent.click(within(podcasts).getByRole('button', { name: 'Remove Spotify' }));

    expect(mockSetPlayers).toHaveBeenCalledWith(['card'], ['spotify'], 'podcasts');

    fireEvent.click(within(screen.getByRole('list', { name: 'Video' })).getByRole('button', { name: 'Remove Vimeo' }));
    expect(mockSetPlayers).toHaveBeenLastCalledWith([], ['vimeo'], 'video');
  });

  it('lists the Wikipedia languages under the players, none until one is added (Auto)', () => {
    render(<MediaSettings />);

    expect(screen.getByText('Wikipedia languages')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Wikipedia and other wikis open in the first of these languages they have. Until you add one, your browser’s languages are used.',
      ),
    ).toBeInTheDocument();
    expect(rowNames('Wikipedia languages')).toEqual([]);
    const lists = screen.getAllByRole('list').map((list) => list.getAttribute('data-testid'));
    expect(lists.at(-1)).toBe('media-language-list');
  });

  it('shows the chosen languages by their own names and saves a change to them', () => {
    setMedia({ languages: ['de', 'fr'] });
    render(<MediaSettings />);

    expect(rowNames('Wikipedia languages')).toEqual(['Deutsch (de)', 'Français (fr)']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Deutsch (de)' }));

    expect(mockSetLanguages).toHaveBeenCalledWith(['fr']);
    expect(mockSetPlayers).not.toHaveBeenCalled();
  });

  it('shows platform embeds up front off once turned off', () => {
    setMedia({ embedsUpFront: false });
    render(<MediaSettings />);

    expect(screen.getByRole('switch', { name: 'Show platform embeds up front' })).not.toBeChecked();
    expect(screen.getByText(/^When off, links show their card/)).toBeInTheDocument();
  });

  it('turns platform embeds up front off', () => {
    render(<MediaSettings />);
    expect(screen.getByRole('switch', { name: 'Show platform embeds up front' })).toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Show platform embeds up front' }));

    expect(mockSetEmbedsUpFront).toHaveBeenCalledWith(false);
  });
});
