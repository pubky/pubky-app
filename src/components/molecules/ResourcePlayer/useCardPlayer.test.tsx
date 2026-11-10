import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { useCardPlayer } from './useCardPlayer';

function Card({ card, testId }: { card: TPinakesResourceDetail; testId: string }) {
  const { playOn, renderBody, isOpen } = useCardPlayer(card);
  const body = <p>{card.name}</p>;
  return (
    <section data-testid={testId} data-open={String(isOpen)}>
      {renderBody ? renderBody(body) : body}
      {playOn}
    </section>
  );
}

describe('useCardPlayer', () => {
  it('offers Play on the card’s own service and loads nothing before it is pressed', () => {
    render(<Card card={musicFixture} testId="song" />);

    expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('puts the service’s player in place of the card’s body, and Close brings the body back', () => {
    render(<Card card={musicFixture} testId="song" />);

    fireEvent.click(screen.getByRole('button', { name: 'Play on Spotify' }));
    const frame = screen.getByTestId('resource-player-frame');
    expect(frame).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
    expect(screen.queryByText(musicFixture.name!)).not.toBeInTheDocument();
    expect(screen.getByTestId('song')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Close the Spotify player' }));
    expect(screen.queryByTestId('resource-player-frame')).not.toBeInTheDocument();
    expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
    expect(screen.getByTestId('song')).toHaveAttribute('data-open', 'false');
  });

  it('lets the viewer pick another service the card is on', () => {
    render(<Card card={videoFixture} testId="video" />);

    expect(screen.getByRole('button', { name: 'Play on YouTube' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play on another service' })).toBeInTheDocument();
  });

  it('plays one card at a time on the page', () => {
    render(
      <>
        <Card card={musicFixture} testId="song" />
        <Card card={videoFixture} testId="video" />
      </>,
    );

    fireEvent.click(within(screen.getByTestId('song')).getByRole('button', { name: 'Play on Spotify' }));
    fireEvent.click(within(screen.getByTestId('video')).getByRole('button', { name: 'Play on YouTube' }));

    expect(screen.getAllByTestId('resource-player-frame')).toHaveLength(1);
    expect(within(screen.getByTestId('video')).getByTestId('resource-player-frame')).toBeInTheDocument();
    expect(within(screen.getByTestId('song')).getByText(musicFixture.name!)).toBeInTheDocument();
  });

  describe('with the viewer’s Players', () => {
    // A song on Spotify, also on Apple Music (no player) and TIDAL.
    const song: TPinakesResourceDetail = {
      ...musicFixture,
      also_on: [
        { id: 'a', uri: 'https://music.apple.com/song/1624945512', site: 'Apple Music' },
        { id: 't', uri: 'https://tidal.com/track/490851477', site: 'TIDAL' },
      ],
    };
    const setPlayers = (playerOrder: string[], hiddenPlayers: string[] = []) =>
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder, hiddenPlayers } });

    afterEach(() => setPlayers([]));

    it('plays the card’s own service on Auto', () => {
      render(<Card card={song} testId="song" />);

      expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
    });

    it('plays the first player in the viewer’s order the card is on', () => {
      setPlayers(['deezer', 'tidal', 'spotify']);
      render(<Card card={song} testId="song" />);

      fireEvent.click(screen.getByRole('button', { name: 'Play on TIDAL' }));
      expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://embed.tidal.com/tracks/490851477?hideOverlays=true',
      );
    });

    it('keeps the card’s own service when the card is on no player in the viewer’s order', () => {
      setPlayers(['deezer']);
      render(<Card card={song} testId="song" />);

      expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
    });

    it('never offers a removed service, its own link’s neither', () => {
      setPlayers([], ['spotify']);
      render(<Card card={song} testId="song" />);

      expect(screen.getByRole('button', { name: 'Play on TIDAL' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Spotify/ })).not.toBeInTheDocument();
    });

    it('offers no player when the viewer removed every service the card is on', () => {
      setPlayers([], ['spotify', 'tidal']);
      render(<Card card={song} testId="song" />);

      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      expect(screen.getByText(song.name!)).toBeInTheDocument();
    });
  });

  it('offers nothing for a card on no service that allows embedding', () => {
    render(<Card card={eventFixture} testId="event" />);

    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    expect(screen.getByText(eventFixture.name!)).toBeInTheDocument();
  });
});
