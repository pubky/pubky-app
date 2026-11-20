import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultMediaPreferences, type MediaPreferences } from '@/stores/settings/settings.types';
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
