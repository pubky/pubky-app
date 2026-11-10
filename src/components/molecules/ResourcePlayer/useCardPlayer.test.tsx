import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { useCardPlayer } from './useCardPlayer';

// Play on, for anything but a song (which shows its player up front, below): the same link as an album.
/** The video without its tracks on Spotify, Deezer and TIDAL: a video with Also on, no song (`isSong`). */
const VIDEO: TPinakesResourceDetail = {
  ...videoFixture,
  also_on: videoFixture.also_on.filter((entry) => !['Spotify', 'Deezer', 'TIDAL'].includes(entry.site ?? '')),
};
const ALBUM: TPinakesResourceDetail = {
  ...musicFixture,
  type: 'MusicAlbum',
  type_path: ['Thing', 'CreativeWork', 'MusicAlbum'],
};

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
    render(<Card card={ALBUM} testId="song" />);

    expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('puts the service’s player in place of the card’s body, and Close brings the body back', () => {
    render(<Card card={ALBUM} testId="song" />);

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
    const album = { ...ALBUM, also_on: [{ uri: 'https://tidal.com/album/655910', site: 'TIDAL' }] };
    render(<Card card={album} testId="album" />);

    expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play on another service' })).toBeInTheDocument();
  });

  it('plays one card at a time on the page', () => {
    render(
      <>
        <Card card={ALBUM} testId="song" />
        <Card card={VIDEO} testId="video" />
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
      ...ALBUM,
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

/**
 * A song (`MusicRecording`) shows its player up front (`embed`): the chosen service's own embed,
 * paused, with a switch to the card's other services; no Play on.
 */
describe('useCardPlayer, a song', () => {
  const SPOTIFY = musicFixture.uri;
  const SONG: TPinakesResourceDetail = {
    ...musicFixture,
    also_on: [
      { id: 'a', uri: 'https://music.apple.com/song/1624945512', site: 'Apple Music' },
      { id: 't', uri: 'https://tidal.com/track/490851477', site: 'TIDAL' },
      { id: 'y', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', site: 'YouTube' },
    ],
  };
  const SONG_ALONE: TPinakesResourceDetail = { ...musicFixture, also_on: [] };

  // Every observer the docks make, latest last: `report` tells the latest one its slot left the screen.
  let observers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  const report = (isIntersecting: boolean) => act(() => observers.at(-1)?.([{ isIntersecting }]));
  class MockIntersectionObserver {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      observers.push(callback);
    }
    observe = vi.fn();
    disconnect = vi.fn();
  }

  const setMedia = (media: Partial<typeof defaultMediaPreferences>) =>
    useSettingsStore.setState({ media: { ...defaultMediaPreferences, ...media } });

  function Song({
    card,
    href = SPOTIFY,
    testId = 'song',
    preview,
  }: {
    card: TPinakesResourceDetail;
    href?: string;
    testId?: string;
    preview?: boolean;
  }) {
    const { embed, playOn, renderBody } = useCardPlayer(card, href, undefined, { preview });
    const body = <p>{card.name}</p>;
    return (
      <section data-testid={testId}>
        {embed ?? (renderBody ? renderBody(body) : body)}
        {playOn}
      </section>
    );
  }

  const frameOf = (testId = 'song') => within(screen.getByTestId(testId)).getByTestId('resource-player-frame');
  // A press inside a player's frame: the pointer is over it, then the frame takes the focus.
  const engage = (frame: HTMLElement) =>
    act(() => {
      fireEvent.mouseOver(frame);
      frame.focus();
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(1);
    });
  const openSwitch = () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: /choose another service$/ }), {
      button: 0,
      ctrlKey: false,
    });
    return screen.getByTestId('play-on-menu');
  };

  beforeEach(() => {
    observers = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setMedia({});
  });

  it('shows the shared link’s player up front, paused, instead of the card’s text and without Play on', () => {
    render(<Song card={SONG} />);

    expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
    expect(screen.queryByText(musicFixture.name!)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Close/ })).not.toBeInTheDocument();
  });

  it('picks the first service in the viewer’s Players order the song is on', () => {
    setMedia({ playerOrder: ['tidal', 'spotify'] });
    render(<Song card={SONG} />);

    expect(frameOf()).toHaveAttribute('src', 'https://embed.tidal.com/tracks/490851477?hideOverlays=true');
  });

  it('picks the shared link’s service when the song is on no service in the viewer’s order', () => {
    setMedia({ playerOrder: ['deezer'] });
    render(<Song card={SONG} href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

    expect(frameOf()).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0');
  });

  it('falls back to the card’s canonical link when the shared link has no player', () => {
    render(<Song card={SONG} href="https://example.com/share/1" />);

    expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
  });

  it('never tells the up-front player to start: no autoplay parameter, no start message', () => {
    render(<Song card={SONG} />);
    const frame = frameOf() as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');

    fireEvent.load(frame);
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://open.spotify.com',
        source: frame.contentWindow,
        data: { type: 'ready' },
      }),
    );

    expect(frame.getAttribute('src')).not.toMatch(/auto_?play/);
    expect(post).not.toHaveBeenCalled();
  });

  it('switches in place from its menu: the old player goes, the new one stays paused, the default is kept', () => {
    render(<Song card={SONG} />);
    const old = frameOf();

    const menu = openSwitch();
    const rows = within(menu).getAllByTestId('play-on-row');
    expect(rows.map((row) => row.textContent)).toEqual(['Spotify', 'TIDAL', 'YouTube']);
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(within(menu).queryByText('Close player')).not.toBeInTheDocument();
    fireEvent.click(rows[1]);

    expect(old).not.toBeInTheDocument();
    expect(frameOf()).toHaveAttribute('src', 'https://embed.tidal.com/tracks/490851477?hideOverlays=true');
    expect(screen.getAllByTestId('resource-player-frame')).toHaveLength(1);
    expect(document.querySelector('[data-keep-playing]')).toBeNull();
    expect(useSettingsStore.getState().media.playerOrder).toEqual([]);
  });

  it('lists its services in the viewer’s Players order and leaves out the removed ones', () => {
    setMedia({ playerOrder: ['youtube', 'tidal', 'spotify'], hiddenPlayers: ['tidal'] });
    render(<Song card={SONG} />);

    expect(frameOf()).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0');
    const rows = within(openSwitch()).getAllByTestId('play-on-row');
    expect(rows.map((row) => row.textContent)).toEqual(['YouTube', 'Spotify']);
  });

  it('shows no player when the viewer removed every service the song is on', () => {
    setMedia({ hiddenPlayers: ['spotify', 'tidal', 'youtube'] });
    render(<Song card={SONG} />);

    expect(screen.queryByTestId('resource-player-frame')).not.toBeInTheDocument();
    expect(screen.queryByTestId('song-player')).not.toBeInTheDocument();
    expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
  });

  it('offers only Card besides the one service of a song on one service', () => {
    render(<Song card={SONG_ALONE} />);

    expect(frameOf()).toBeInTheDocument();
    const menu = openSwitch();
    expect(
      within(menu)
        .getAllByTestId('play-on-row')
        .map((row) => row.textContent),
    ).toEqual(['Spotify']);
    expect(within(menu).getByTestId('play-on-card')).toHaveTextContent('Card');
  });

  describe('Card', () => {
    const cardRow = (menu: HTMLElement) =>
      within(menu).getByRole('menuitem', { name: 'Show the link card instead of a player' });

    it('is the switch’s last row, after the services, unchecked while a player shows', () => {
      render(<Song card={SONG} />);

      const menu = openSwitch();
      const rows = within(menu).getAllByRole('menuitem');
      expect(rows.at(-1)).toBe(cardRow(menu));
      expect(cardRow(menu)).not.toHaveAttribute('aria-current');
    });

    it('shows the card in place of the player, loads nothing, and keeps the switch to pick a service again', () => {
      render(<Song card={SONG} />);

      fireEvent.click(cardRow(openSwitch()));
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();

      expect(screen.getByRole('button', { name: 'Card: choose another service' })).toHaveTextContent('Card');
      const menu = openSwitch();
      expect(cardRow(menu)).toHaveAttribute('aria-current', 'true');
      expect(
        within(menu)
          .getAllByTestId('play-on-row')
          .map((row) => row.textContent),
      ).toEqual(['Spotify', 'TIDAL', 'YouTube']);

      fireEvent.click(within(menu).getAllByTestId('play-on-row')[1]);
      expect(frameOf()).toHaveAttribute('src', 'https://embed.tidal.com/tracks/490851477?hideOverlays=true');
      expect(screen.queryByText(musicFixture.name!)).not.toBeInTheDocument();
      expect(useSettingsStore.getState().media.playerOrder).toEqual([]);
    });

    it('stops a pressed player: it is no longer the page’s player', () => {
      vi.useFakeTimers();
      render(<Song card={SONG} />);
      engage(frameOf());
      expect(document.querySelector('[data-keep-playing]')).not.toBeNull();

      fireEvent.click(cardRow(openSwitch()));
      expect(document.querySelector('iframe')).toBeNull();
      expect(document.querySelector('[data-keep-playing]')).toBeNull();
    });

    it('takes a docked player out of the dock', () => {
      vi.useFakeTimers();
      render(<Song card={SONG} />);
      engage(frameOf());
      report(false);
      expect(screen.getByRole('complementary')).toBeInTheDocument();

      // The dock is still in the card's tree: its switch picks Card.
      fireEvent.click(cardRow(openSwitch()));
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
      expect(document.querySelector('[data-keep-playing]')).toBeNull();
    });

    it('is forgotten for another song in the same place', () => {
      const other: TPinakesResourceDetail = {
        ...SONG,
        id: 'another-song',
        uri: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq',
      };
      const { rerender } = render(<Song card={SONG} />);
      fireEvent.click(cardRow(openSwitch()));
      expect(document.querySelector('iframe')).toBeNull();

      rerender(<Song card={other} href={other.uri} />);
      expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/69kOkLUCkxIZYexIgSG8rq');
    });

    describe('ranked first in Players (Card (no player))', () => {
      beforeEach(() => setMedia({ playerOrder: ['card'] }));

      it('shows the card first, with the switch still offering the services', () => {
        render(<Song card={SONG} />);

        expect(document.querySelector('iframe')).toBeNull();
        expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
        const menu = openSwitch();
        expect(cardRow(menu)).toHaveAttribute('aria-current', 'true');

        fireEvent.click(within(menu).getAllByTestId('play-on-row')[0]);
        expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
        expect(useSettingsStore.getState().media.playerOrder).toEqual(['card']);
      });

      it('shows the card in a preview (the composer) too, and for a song on one service', () => {
        render(<Song card={SONG_ALONE} preview />);

        expect(document.querySelector('iframe')).toBeNull();
        expect(screen.getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
      });

      it('loads not even the services’ icons with platform embeds up front off', () => {
        setMedia({ playerOrder: ['card'], embedsUpFront: false });
        render(<Song card={SONG} />);

        expect(document.querySelector('iframe')).toBeNull();
        expect(document.querySelector('img')).toBeNull();
        expect(within(openSwitch()).getAllByTestId('play-on-row')).toHaveLength(3);
        expect(document.querySelector('img')).toBeNull();
      });

      it('shows the player when the song’s first service ranks above Card', () => {
        setMedia({ playerOrder: ['tidal', 'card', 'spotify'] });
        render(<Song card={SONG} />);

        expect(frameOf()).toHaveAttribute('src', 'https://embed.tidal.com/tracks/490851477?hideOverlays=true');
        expect(screen.queryByText(musicFixture.name!)).not.toBeInTheDocument();
      });

      it('keeps the shared link’s service first when only Card moved, by where that service sits', () => {
        setMedia({ playerOrder: ['spotify', 'card'] });
        const { unmount } = render(<Song card={SONG} href={SONG.uri} />);
        expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
        unmount();

        // Spotify, the shared link's service, sits below Card: the card, not TIDAL's player.
        setMedia({ playerOrder: ['tidal', 'card'] });
        render(<Song card={SONG} href={SONG.uri} />);
        expect(document.querySelector('iframe')).toBeNull();
        expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
      });

      it('shows the card when Card ranks above the song’s first service (Deezer: the song is not on it)', () => {
        setMedia({ playerOrder: ['deezer', 'card', 'tidal'] });
        render(<Song card={SONG} />);

        expect(document.querySelector('iframe')).toBeNull();
        expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
      });

      it('keeps Play on for an album', () => {
        const album = { ...SONG, type: 'MusicAlbum', type_path: ['Thing', 'CreativeWork', 'MusicAlbum'] };
        render(<Song card={album} />);

        expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /choose another service$/ })).not.toBeInTheDocument();
      });
    });
  });

  it('keeps the same player through a re-render with other counts or tags', () => {
    const { rerender } = render(<Song card={SONG} />);
    const frame = frameOf();

    rerender(<Song card={{ ...SONG, collections: SONG.collections + 3 }} />);
    expect(frameOf()).toBe(frame);
  });

  it('does not dock up-front players when they scroll away, only one the viewer pressed in', () => {
    vi.useFakeTimers();
    render(<Song card={SONG} />);
    report(false);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(document.querySelector('[data-keep-playing]')).toBeNull();

    const frame = frameOf();
    engage(frame);
    report(false);
    expect(screen.getByRole('complementary', { name: `Player dock: ${musicFixture.name}` })).toContainElement(frame);
  });

  it('stops a pressed player when another song’s player is pressed', () => {
    vi.useFakeTimers();
    render(
      <>
        <Song card={SONG} testId="first" />
        <Song card={SONG_ALONE} testId="second" />
      </>,
    );
    const first = frameOf('first');
    engage(first);
    expect(first.closest('[data-keep-playing]')).not.toBeNull();

    engage(frameOf('second'));
    expect(first).not.toBeInTheDocument();
    expect(frameOf('first').closest('[data-keep-playing]')).toBeNull();
    expect(frameOf('second').closest('[data-keep-playing]')).not.toBeNull();
  });

  it('takes the focus tabbed into another player’s frame for no press: the playing one keeps the page', () => {
    vi.useFakeTimers();
    render(
      <>
        <Song card={SONG} testId="first" />
        <Song card={SONG_ALONE} testId="second" />
      </>,
    );
    const first = frameOf('first');
    engage(first);
    fireEvent.mouseOver(document.body);

    const second = frameOf('second');
    act(() => {
      second.focus();
      vi.advanceTimersByTime(1);
    });
    expect(frameOf('first')).toBe(first);
    expect(first.closest('[data-keep-playing]')).not.toBeNull();
    expect(second.closest('[data-keep-playing]')).toBeNull();
  });

  it('closes from the dock to a paused player in the card, which does not open again by itself', () => {
    vi.useFakeTimers();
    render(<Song card={SONG} />);
    const frame = frameOf();
    engage(frame);
    report(false);

    fireEvent.click(screen.getByRole('button', { name: 'Close the Spotify player' }));
    expect(frame).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(1);
    });
    report(false);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(frameOf().closest('[data-keep-playing]')).toBeNull();
  });

  describe('with platform embeds up front off', () => {
    beforeEach(() => setMedia({ embedsUpFront: false }));

    it('loads no player, nor the player’s service icons, until Play on is pressed', () => {
      render(<Song card={SONG} />);

      expect(document.querySelector('iframe')).toBeNull();
      expect(document.querySelector('img')).toBeNull();
      expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /choose another service$/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Play on Spotify' }));
      // The viewer's press plays it: the player that starts, as Play on always did.
      expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
      expect(frameOf().closest('[data-keep-playing]')).not.toBeNull();
    });

    it('plays another service from the menu only on Play on', () => {
      render(<Song card={SONG} />);

      fireEvent.click(within(openSwitch()).getAllByTestId('play-on-row')[1]);
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByRole('button', { name: 'Play on TIDAL' })).toBeInTheDocument();
    });

    it('shows the player paused in a preview (the composer), which never docks', () => {
      render(<Song card={SONG} preview />);

      fireEvent.click(screen.getByRole('button', { name: 'Show the Spotify player' }));
      expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
      expect(document.querySelector('[data-keep-playing]')).toBeNull();
    });
  });

  it('labels the switch’s menu for choosing a service, since a pick plays nothing', () => {
    render(<Song card={SONG} />);

    expect(openSwitch()).toHaveAttribute('aria-label', 'Choose service');
  });

  it('makes a pressed preview (the composer) the page’s player, which stops the page’s and is stopped by it', () => {
    vi.useFakeTimers();
    render(
      <>
        <Song card={SONG} testId="feed" />
        <Song card={SONG_ALONE} testId="composer" preview />
      </>,
    );
    const feed = frameOf('feed');
    engage(feed);
    expect(feed.closest('[data-keep-playing]')).not.toBeNull();

    const composer = frameOf('composer');
    engage(composer);
    // The feed's player stops (its frame is loaded anew); the preview never docks.
    expect(feed).not.toBeInTheDocument();
    expect(document.querySelector('[data-keep-playing]')).toBeNull();

    engage(frameOf('feed'));
    expect(composer).not.toBeInTheDocument();
  });

  it('makes an up-front audio file the page’s player once it plays, and pauses it for another', () => {
    vi.useFakeTimers();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(
      <>
        <Song
          card={{ ...SONG_ALONE, uri: 'https://example.com/song.mp3' }}
          href="https://example.com/song.mp3"
          testId="file"
        />
        <Song card={SONG_ALONE} testId="spotify" />
      </>,
    );
    const audio = within(screen.getByTestId('file')).getByTestId('resource-player-audio');
    Object.defineProperty(audio, 'paused', { configurable: true, value: false });
    fireEvent.play(audio);
    expect(audio.closest('[data-keep-playing]')).not.toBeNull();

    engage(frameOf('spotify'));
    // Paused where it is, not loaded anew.
    expect(pause.mock.contexts).toEqual([audio]);
    expect(audio).toBeInTheDocument();
    expect(audio.closest('[data-keep-playing]')).toBeNull();
  });

  /** One media plays on the page: its own word, where it gives one, says it started. */
  describe('one media at a time', () => {
    const YOUTUBE_SONG: TPinakesResourceDetail = {
      ...SONG_ALONE,
      uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      site: 'YouTube',
    };
    const DEEZER_SONG: TPinakesResourceDetail = {
      ...SONG_ALONE,
      uri: 'https://www.deezer.com/track/67238735',
      site: 'Deezer',
    };
    const YOUTUBE = 'https://www.youtube-nocookie.com';
    const youtubeSays = (frame: HTMLElement, playerState: number, origin = YOUTUBE, source?: Window | null) =>
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            origin,
            source: source === undefined ? (frame as HTMLIFrameElement).contentWindow : source,
            data: JSON.stringify({ event: 'infoDelivery', info: { playerState } }),
          }),
        );
      });
    const docked = () => document.querySelectorAll('[data-keep-playing]');

    function Page({ withVideo = false }: { withVideo?: boolean }) {
      return (
        <>
          <Song card={YOUTUBE_SONG} href={YOUTUBE_SONG.uri} testId="youtube" />
          <Song card={DEEZER_SONG} href={DEEZER_SONG.uri} testId="deezer" />
          {withVideo && <video data-testid="post-video" />}
        </>
      );
    }

    it('asks a YouTube player to say when it plays, and makes it the page’s player only once it does', () => {
      vi.useFakeTimers();
      render(<Page />);
      const youtube = frameOf('youtube') as HTMLIFrameElement;
      const post = vi.spyOn(youtube.contentWindow!, 'postMessage').mockImplementation(() => {});

      fireEvent.load(youtube);
      expect(post).toHaveBeenCalledWith(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YOUTUBE);
      // A press is no start: the player says when it plays.
      engage(youtube);
      expect(docked()).toHaveLength(0);

      youtubeSays(youtube, 1);
      expect(docked()).toHaveLength(1);
      report(false);
      expect(screen.getByRole('complementary')).toContainElement(youtube);
    });

    it('pauses the playing one when another starts: only the new one docks', () => {
      vi.useFakeTimers();
      render(<Page />);
      const youtube = frameOf('youtube') as HTMLIFrameElement;
      const post = vi.spyOn(youtube.contentWindow!, 'postMessage').mockImplementation(() => {});
      youtubeSays(youtube, 1);

      const deezer = frameOf('deezer');
      engage(deezer);
      // YouTube is paused in place (its frame stays); the Deezer player is the page's now.
      expect(post).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), YOUTUBE);
      expect(frameOf('youtube')).toBe(youtube);
      expect(Array.from(docked())).toEqual([deezer.closest('[data-keep-playing]')]);

      // YouTube starting again stops Deezer, which cannot be paused: loaded anew, paused.
      youtubeSays(youtube, 2);
      youtubeSays(youtube, 1);
      expect(deezer).not.toBeInTheDocument();
      expect(Array.from(docked())).toEqual([youtube.closest('[data-keep-playing]')]);
      report(false);
      expect(screen.getAllByRole('complementary')).toHaveLength(1);
    });

    it('keeps a player the viewer paused docked, until other media starts', () => {
      vi.useFakeTimers();
      render(<Page withVideo />);
      const youtube = frameOf('youtube');
      youtubeSays(youtube, 1);
      youtubeSays(youtube, 2);
      report(false);
      expect(screen.getByRole('complementary')).toContainElement(youtube);

      fireEvent.play(screen.getByTestId('post-video'));
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      expect(docked()).toHaveLength(0);
    });

    it('stops a song’s player when a post’s video starts', () => {
      vi.useFakeTimers();
      render(<Page withVideo />);
      const deezer = frameOf('deezer');
      engage(deezer);
      expect(docked()).toHaveLength(1);

      fireEvent.play(screen.getByTestId('post-video'));
      expect(deezer).not.toBeInTheDocument();
      expect(docked()).toHaveLength(0);
    });

    it('stops the page’s player for media starting outside it, but not for a muted video', () => {
      vi.useFakeTimers();
      render(<Page withVideo />);
      youtubeSays(frameOf('youtube'), 1);
      const video = screen.getByTestId('post-video') as HTMLVideoElement;
      video.muted = true;

      fireEvent.play(video);
      expect(docked()).toHaveLength(1);
    });

    it('ignores a player’s word from another origin or another window', () => {
      vi.useFakeTimers();
      render(<Page />);
      const youtube = frameOf('youtube');

      youtubeSays(youtube, 1, 'https://evil.example');
      youtubeSays(youtube, 1, YOUTUBE, window);
      youtubeSays(youtube, 1, YOUTUBE, (frameOf('deezer') as HTMLIFrameElement).contentWindow);
      expect(docked()).toHaveLength(0);
    });

    it('closes from the dock to a paused player in place', () => {
      vi.useFakeTimers();
      render(<Page />);
      const youtube = frameOf('youtube') as HTMLIFrameElement;
      const post = vi.spyOn(youtube.contentWindow!, 'postMessage').mockImplementation(() => {});
      youtubeSays(youtube, 1);
      report(false);

      fireEvent.click(screen.getByRole('button', { name: 'Close the YouTube player' }));
      expect(post).toHaveBeenCalledWith(JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }), YOUTUBE);
      expect(frameOf('youtube')).toBe(youtube);
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('sees a press go from one player’s frame into another’s while the page has no focus', () => {
      vi.useFakeTimers();
      render(
        <>
          <Song card={DEEZER_SONG} href={DEEZER_SONG.uri} testId="first" />
          <Song card={SONG_ALONE} testId="second" />
        </>,
      );
      const first = frameOf('first');
      engage(first);
      expect(first.closest('[data-keep-playing]')).not.toBeNull();

      // Firefox and Safari: the focus moves on into the other frame with no event on the page.
      const second = frameOf('second');
      fireEvent.mouseOver(second);
      const focus = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(second);
      act(() => vi.advanceTimersByTime(300));
      focus.mockRestore();
      expect(first).not.toBeInTheDocument();
      expect(second.closest('[data-keep-playing]')).not.toBeNull();
    });

    it('takes no word from a player still playing, nor from a paused video being sought, for a start', () => {
      vi.useFakeTimers();
      render(<Page />);
      const youtube = frameOf('youtube');
      youtubeSays(youtube, 1);
      const deezer = frameOf('deezer');
      engage(deezer);
      const dockedDeezer = deezer.closest('[data-keep-playing]');

      // Still playing as it is told to pause, then paused and sought: Deezer keeps the page.
      youtubeSays(youtube, 1);
      youtubeSays(youtube, 3);
      youtubeSays(youtube, 2);
      youtubeSays(youtube, 3);
      expect(frameOf('deezer')).toBe(deezer);
      expect(Array.from(docked())).toEqual([dockedDeezer]);

      // Played again by the viewer: it takes the page.
      youtubeSays(youtube, 1);
      expect(deezer).not.toBeInTheDocument();
      expect(Array.from(docked())).toEqual([youtube.closest('[data-keep-playing]')]);
    });

    it('stops the other players for a preview’s player, which never docks', () => {
      vi.useFakeTimers();
      render(
        <>
          <Song card={DEEZER_SONG} href={DEEZER_SONG.uri} testId="deezer" />
          <Song card={YOUTUBE_SONG} href={YOUTUBE_SONG.uri} testId="youtube" preview />
        </>,
      );
      const deezer = frameOf('deezer');
      engage(deezer);
      expect(docked()).toHaveLength(1);

      youtubeSays(frameOf('youtube'), 1);
      expect(deezer).not.toBeInTheDocument();
      expect(docked()).toHaveLength(0);
      report(false);
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });
  });

  it('lets go of the page’s player when platform embeds are turned off while it plays', () => {
    vi.useFakeTimers();
    render(<Song card={SONG} />);
    engage(frameOf());
    expect(document.querySelector('[data-keep-playing]')).not.toBeNull();

    act(() => setMedia({ embedsUpFront: false }));
    expect(document.querySelector('iframe')).toBeNull();
    act(() => setMedia({ embedsUpFront: true }));
    expect(frameOf().closest('[data-keep-playing]')).toBeNull();
  });

  it('offers the service’s page when a player opened by Play on has not loaded after a while', () => {
    vi.useFakeTimers();
    setMedia({ embedsUpFront: false });
    render(<Song card={SONG} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play on Spotify' }));

    act(() => vi.advanceTimersByTime(12000));
    expect(screen.getByTestId('resource-player-status')).toHaveTextContent('Spotify has not answered.');
    expect(screen.getByRole('link', { name: /Open in Spotify/ })).toHaveAttribute('href', SPOTIFY);
  });

  it('does not start a plain audio file up front', () => {
    render(<Song card={{ ...SONG_ALONE, uri: 'https://example.com/song.mp3' }} href="https://example.com/song.mp3" />);

    const audio = screen.getByTestId('resource-player-audio') as HTMLAudioElement;
    expect(audio.autoplay).toBe(false);
  });

  it('keeps Play on for an album, and for a song that is not ok', () => {
    const album = { ...SONG, type: 'MusicAlbum', type_path: ['Thing', 'CreativeWork', 'MusicAlbum'] };
    const { unmount } = render(<Song card={album} />);
    expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
    unmount();

    render(<Song card={{ ...SONG, status: 'unreachable' }} />);
    expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('shows the card for a song on no service we can embed (Bandcamp), its links staying links', () => {
    render(
      <Song
        card={{ ...SONG_ALONE, uri: 'https://artist.bandcamp.com/track/song', site: 'Bandcamp' }}
        href="https://artist.bandcamp.com/track/song"
      />,
    );

    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
  });

  it('shows YouTube’s Get Lucky, a video Pinakes knows as a track elsewhere, as a song', () => {
    // As Pinakes reads it: a `VideoObject`, on Spotify, Deezer and TIDAL as tracks.
    const youtube: TPinakesResourceDetail = {
      ...musicFixture,
      uri: 'https://www.youtube.com/watch?v=5NV6Rdv1a3I',
      site: 'YouTube',
      type: 'VideoObject',
      type_path: ['Thing', 'CreativeWork', 'MediaObject', 'VideoObject'],
      facts: null,
      also_on: [
        { uri: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq', site: 'Spotify' },
        { uri: 'https://www.deezer.com/track/67238735', site: 'Deezer' },
        { uri: 'https://tidal.com/track/20115564', site: 'TIDAL' },
        { uri: 'https://music.apple.com/song/617154366', site: 'Apple Music' },
      ],
    };
    render(<Song card={youtube} href={youtube.uri} />);

    expect(frameOf()).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/5NV6Rdv1a3I?enablejsapi=1&rel=0');
    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    const rows = within(openSwitch()).getAllByTestId('play-on-row');
    expect(rows.map((row) => row.textContent)).toEqual(['YouTube', 'Spotify', 'Deezer', 'TIDAL']);
  });

  describe('with no service of its own', () => {
    // A MusicBrainz recording: on Deezer, then Spotify, in Pinakes' order.
    const recording: TPinakesResourceDetail = {
      ...musicFixture,
      uri: 'https://musicbrainz.org/recording/b1a9c0e9-d987-4042-ae91-78d6a3267d69',
      site: 'MusicBrainz',
      also_on: [
        { uri: 'https://www.deezer.com/track/4329888262', site: 'Deezer' },
        { uri: 'https://open.spotify.com/track/2OBofMJx94NryV2SK8p8Zf', site: 'Spotify' },
      ],
    };

    it('shows the first service in Pinakes’ order, not the one that starts on a press first', () => {
      render(<Song card={recording} href={recording.uri} />);

      expect(frameOf()).toHaveAttribute('src', 'https://widget.deezer.com/widget/dark/track/4329888262');
    });

    it('still shows the viewer’s first player first', () => {
      setMedia({ playerOrder: ['spotify'] });
      render(<Song card={recording} href={recording.uri} />);

      expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/2OBofMJx94NryV2SK8p8Zf');
    });
  });

  describe('when the card turns into another song', () => {
    const other: TPinakesResourceDetail = {
      ...SONG,
      id: 'another-song',
      uri: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq',
      name: 'Get Lucky',
    };

    it('forgets the service picked for the first one', () => {
      const { rerender } = render(<Song card={SONG} />);
      fireEvent.click(within(openSwitch()).getAllByTestId('play-on-row')[1]);
      expect(frameOf()).toHaveAttribute('src', 'https://embed.tidal.com/tracks/490851477?hideOverlays=true');

      rerender(<Song card={other} href={other.uri} />);
      expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/69kOkLUCkxIZYexIgSG8rq');
    });

    it('is not the page’s player, nor docks, because the first one was pressed', () => {
      vi.useFakeTimers();
      const { rerender } = render(<Song card={SONG} />);
      engage(frameOf());
      expect(document.querySelector('[data-keep-playing]')).not.toBeNull();

      rerender(<Song card={other} href={other.uri} />);
      expect(document.querySelector('[data-keep-playing]')).toBeNull();
      report(false);
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('neither plays nor shows a player because Play on was pressed for the first one', () => {
      setMedia({ embedsUpFront: false });
      const { rerender } = render(<Song card={SONG} />);
      fireEvent.click(screen.getByRole('button', { name: 'Play on Spotify' }));
      expect(frameOf()).toBeInTheDocument();

      rerender(<Song card={other} href={other.uri} />);
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
    });
  });
});
