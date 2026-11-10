import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
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

  it('offers nothing for a card on no service that allows embedding', () => {
    render(<Card card={eventFixture} testId="event" />);

    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    expect(screen.getByText(eventFixture.name!)).toBeInTheDocument();
  });
});
