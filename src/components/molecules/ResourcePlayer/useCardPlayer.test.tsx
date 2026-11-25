import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ResourceLocationProvider } from '@/molecules/ResourceMap/ResourceLocationContext';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import podcastFixture from '@/services/pinakes/fixtures/by-uri.podcast.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { expectNoThirdPartyLoads } from '@/test-utils/third-party';
import { asOpaque } from '@/test-utils/type-assertions';
import { useCardPlayer } from './useCardPlayer';

// These cases are for platform embeds up front (Settings, Links & Media) turned on; the default
// is off (`defaultMediaPreferences`): the same view, the player drawn by the app until a press.
const upFrontMedia = { ...defaultMediaPreferences, embedsUpFront: true };
beforeEach(() => useSettingsStore.setState({ media: upFrontMedia }));

/** Every image or frame address on the page is the app's own (its `/api/favicon` icons): nothing from a service. */
/** The player's drawing with platform embeds up front off: what it plays, on which service. */
const playOn = (service: string, title = musicFixture.name!) => `Play ${title} on ${service}`;

// A generic link (an artist's MusicBrainz page) Pinakes knows on a service with a player (Spotify,
// the song's link): its card first, the services in its switch.
const ARTIST: TPinakesResourceDetail = {
  ...musicFixture,
  uri: 'https://musicbrainz.org/artist/056e4f3e-d505-4dad-8ec1-d04f521cbb56',
  site: 'MusicBrainz',
  type: 'MusicGroup',
  type_path: ['Thing', 'Organization', 'PerformingGroup', 'MusicGroup'],
  aliases: [],
  also_on: [{ id: 's', uri: musicFixture.uri, site: 'Spotify' }],
};

function Card({ card, testId }: { card: TPinakesResourceDetail; testId: string }) {
  const { embed, switcher, isCard, player } = useCardPlayer(card, card.uri);
  const body = <p>{card.name}</p>;
  return (
    <section data-testid={testId} data-card={String(Boolean(isCard))}>
      <header data-testid={`${testId}-header`}>{switcher}</header>
      {embed ?? body}
      {player}
    </section>
  );
}

const openSwitchOf = (testId: string) => {
  fireEvent.pointerDown(within(screen.getByTestId(testId)).getByRole('button', { name: /choose another service$/ }), {
    button: 0,
  });
  return screen.getByTestId('play-on-menu');
};
const rowsOf = (menu: HTMLElement) =>
  within(menu)
    .getAllByTestId('play-on-row')
    .map((row) => row.textContent);

/** Picks a service in the switch of the card in `testId`: with platform embeds up front off, that loads it. */
const pickIn = (testId: string, row = 0) => {
  fireEvent.pointerDown(within(screen.getByTestId(testId)).getByRole('button', { name: /choose another service$/ }), {
    button: 0,
  });
  fireEvent.click(within(screen.getByTestId('play-on-menu')).getAllByTestId('play-on-row')[row]);
};

describe('useCardPlayer, a generic link', () => {
  it('shows its card first, loads nothing, and offers its services in the header switch, not Play on', () => {
    render(<Card card={ARTIST} testId="artist" />);

    expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('artist')).toHaveAttribute('data-card', 'true');
    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    const trigger = within(screen.getByTestId('artist-header')).getByTestId('player-switch');
    expect(trigger).toHaveTextContent('Card');
    const menu = openSwitchOf('artist');
    expect(within(menu).getByTestId('play-on-card')).toHaveAttribute('aria-current', 'true');
    expect(rowsOf(menu)).toEqual(['Spotify']);
  });

  it('shows a picked service’s player paused in place of the card’s body, and Card brings the body back', () => {
    render(<Card card={ARTIST} testId="artist" />);

    fireEvent.click(within(openSwitchOf('artist')).getAllByTestId('play-on-row')[0]);
    const frame = screen.getByTestId('resource-player-frame');
    expect(frame).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
    expect(screen.queryByText(musicFixture.name!)).not.toBeInTheDocument();
    expect(screen.getByTestId('player-switch')).toHaveTextContent('Spotify');

    fireEvent.click(within(openSwitchOf('artist')).getByTestId('play-on-card'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
  });

  describe('with the viewer’s Players', () => {
    // An artist on Spotify, also on Bandcamp (no player) and TIDAL.
    const artist: TPinakesResourceDetail = {
      ...ARTIST,
      also_on: [
        ...ARTIST.also_on,
        { id: 'b', uri: 'https://rickastley.bandcamp.com/track/never-gonna-give-you-up', site: 'Bandcamp' },
        { id: 't', uri: 'https://tidal.com/track/490851477', site: 'TIDAL' },
      ],
    };
    const setPlayers = (playerOrder: string[], hiddenPlayers: string[] = []) =>
      useSettingsStore.setState({ media: { ...upFrontMedia, playerOrder, hiddenPlayers } });

    afterEach(() => setPlayers([]));

    it('lists its services in Pinakes’ order on Auto', () => {
      render(<Card card={artist} testId="artist" />);

      expect(rowsOf(openSwitchOf('artist'))).toEqual(['Spotify', 'TIDAL']);
    });

    it('lists the viewer’s order first, and still shows the card first', () => {
      setPlayers(['deezer', 'tidal', 'spotify']);
      render(<Card card={artist} testId="artist" />);

      expect(document.querySelector('iframe')).toBeNull();
      expect(rowsOf(openSwitchOf('artist'))).toEqual(['TIDAL', 'Spotify']);
    });

    it('never offers a removed service', () => {
      setPlayers([], ['spotify']);
      render(<Card card={artist} testId="artist" />);

      expect(rowsOf(openSwitchOf('artist'))).toEqual(['TIDAL']);
    });

    it('has no switch when the viewer removed every service the card is on', () => {
      setPlayers([], ['spotify', 'tidal']);
      render(<Card card={artist} testId="artist" />);

      expect(screen.queryByTestId('player-switch')).not.toBeInTheDocument();
      expect(screen.getByText(artist.name!)).toBeInTheDocument();
    });
  });

  it('loads nothing with platform embeds up front off: its card, its one service in the switch, loaded at once when picked', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    onTestFinished(() => {
      useSettingsStore.setState({ media: upFrontMedia });
    });
    render(<Card card={ARTIST} testId="artist" />);

    expect(screen.getByTestId('artist')).toHaveAttribute('data-card', 'true');
    expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
    // No Play of its own: the switch is the header's one control.
    expect(screen.queryByRole('button', { name: playOn('Spotify') })).not.toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
    expectNoThirdPartyLoads();
    expect(rowsOf(openSwitchOf('artist'))).toEqual(['Spotify']);
    expectNoThirdPartyLoads();
    // The pick is the press: Spotify's player loads at once, started, in the card's place.
    fireEvent.click(screen.getByTestId('play-on-row'));
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(screen.getByTestId('resource-player-frame').getAttribute('src')).toContain('open.spotify.com/embed/');
    expect(screen.getByTestId('artist')).toHaveAttribute('data-card', 'false');
  });

  it('offers nothing for a card on no service that allows embedding', () => {
    render(<Card card={eventFixture} testId="event" />);

    expect(screen.queryByTestId('player-switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    expect(screen.getByText(eventFixture.name!)).toBeInTheDocument();
  });
});

describe('useCardPlayer, links Pinakes matched by metadata (kind maybe)', () => {
  const DEEZER_MAYBE = {
    uri: 'https://www.deezer.com/track/67238735',
    site: 'Deezer',
    derived: true,
    via: 'youtube_match',
    kind: 'maybe',
  };
  const TIDAL_EXACT = { id: 't', uri: 'https://tidal.com/track/490851477', site: 'TIDAL' };
  // A song on Spotify (its own link), exactly on TIDAL, and maybe on Deezer (by artist, title and length).
  const SONG: TPinakesResourceDetail = { ...musicFixture, also_on: [DEEZER_MAYBE, TIDAL_EXACT] };
  const DEEZER_WIDGET = 'https://widget.deezer.com/widget/dark/track/67238735';
  const setPlayers = (playerOrder: string[]) => useSettingsStore.setState({ media: { ...upFrontMedia, playerOrder } });

  afterEach(() => setPlayers([]));

  it('shows an exact link’s player up front, never a match, even one the viewer ranks first', () => {
    setPlayers(['deezer', 'tidal', 'spotify']);
    render(<Card card={SONG} testId="song" />);

    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
      'src',
      'https://embed.tidal.com/tracks/490851477?hideOverlays=true',
    );
    expect(screen.getByTestId('player-switch').textContent).toBe('TIDAL');
    expect(rowsOf(openSwitchOf('song'))).toEqual(['TIDAL', 'Spotify', 'Deezer']);
  });

  it('lists a match after the exact services with no label, its note in its hover text and name only', () => {
    render(<Card card={SONG} testId="song" />);

    const menu = openSwitchOf('song');
    expect(rowsOf(menu)).toEqual(['Spotify', 'TIDAL', 'Deezer']);
    expect(menu.textContent).not.toMatch(/maybe|matched/i);
    const [spotify, tidal, deezer] = within(menu).getAllByTestId('play-on-row');
    expect(deezer).toHaveAccessibleName('Deezer, Matched by title and length');
    expect(deezer).toHaveAttribute('title', 'Matched by title and length');
    // An exact link's row is as before: named by what it shows, no hover text.
    for (const [row, name] of [
      [spotify, 'Spotify'],
      [tidal, 'TIDAL'],
    ] as const) {
      expect(row).toHaveAccessibleName(name);
      expect(row).not.toHaveAttribute('title');
    }
    fireEvent.click(deezer);

    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', DEEZER_WIDGET);
    const trigger = screen.getByTestId('player-switch');
    expect(trigger.textContent).toBe('Deezer');
    expect(trigger).toHaveAccessibleName('Deezer, Matched by title and length: choose another service');
    expect(trigger).toHaveAttribute('title', 'Matched by title and length');
    expect(
      within(openSwitchOf('song')).getByRole('menuitem', { name: 'Deezer, Matched by title and length' }),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('gives an exact service the switch shows no hover text, and its name as before', () => {
    render(<Card card={SONG} testId="song" />);

    const trigger = screen.getByTestId('player-switch');
    expect(trigger.textContent).toBe('Spotify');
    expect(trigger).toHaveAccessibleName('Spotify: choose another service');
    expect(trigger).not.toHaveAttribute('title');
  });

  it('shows the card, not a match, when Card (no player) ranks between the match and the exact services', () => {
    setPlayers(['deezer', 'card', 'spotify', 'tidal']);
    render(<Card card={SONG} testId="song" />);

    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('song')).toHaveAttribute('data-card', 'true');
    expect(rowsOf(openSwitchOf('song'))).toEqual(['Spotify', 'TIDAL', 'Deezer']);
  });

  it('still embeds a card’s only match: a generic link offers it below Card, and plays it when picked', () => {
    const recording: TPinakesResourceDetail = {
      ...ARTIST,
      uri: 'https://musicbrainz.org/recording/b1a9c0e9-d987-4042-ae91-78d6a3267d69',
      type: 'MusicRecording',
      type_path: ['Thing', 'CreativeWork', 'MusicRecording'],
      also_on: [DEEZER_MAYBE],
    };
    render(<Card card={recording} testId="recording" />);

    expect(screen.getByTestId('recording')).toHaveAttribute('data-card', 'true');
    const menu = openSwitchOf('recording');
    expect(rowsOf(menu)).toEqual(['Deezer']);
    fireEvent.click(within(menu).getByTestId('play-on-row'));

    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', DEEZER_WIDGET);
    expect(screen.getByTestId('player-switch').textContent).toBe('Deezer');
  });

  it('marks nothing on a card with exact links only, in Pinakes’ order as before', () => {
    render(<Card card={{ ...SONG, also_on: [TIDAL_EXACT, { ...DEEZER_MAYBE, kind: undefined }] }} testId="song" />);

    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
      'src',
      'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP',
    );
    const menu = openSwitchOf('song');
    expect(rowsOf(menu)).toEqual(['Spotify', 'TIDAL', 'Deezer']);
    for (const row of within(menu).getAllByTestId('play-on-row')) {
      expect(row).not.toHaveAttribute('title');
      expect(row).not.toHaveAttribute('aria-label');
    }
  });
});

/**
 * A song shared as its link on a service with a player shows that player up front (`embed`):
 * the chosen service's own embed, paused, with a switch to Card and the card's other services; no
 * Play on.
 */
describe('useCardPlayer, a song', () => {
  const SPOTIFY = musicFixture.uri;
  const SONG: TPinakesResourceDetail = {
    ...musicFixture,
    also_on: [
      { id: 'b', uri: 'https://rickastley.bandcamp.com/track/never-gonna-give-you-up', site: 'Bandcamp' },
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
    useSettingsStore.setState({ media: { ...upFrontMedia, ...media } });

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
    const { embed, switcher, player } = useCardPlayer(card, href, undefined, { preview });
    const body = <p>{card.name}</p>;
    return (
      <section data-testid={testId}>
        {switcher}
        {embed ?? body}
        {player}
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

  it('shows its card first, like a generic link’s, when the viewer removed the shared link’s service', () => {
    setMedia({ hiddenPlayers: ['spotify'] });
    render(<Song card={SONG} />);

    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
    expect(
      within(openSwitch())
        .getAllByTestId('play-on-row')
        .map((row) => row.textContent),
    ).toEqual(['TIDAL', 'YouTube']);
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
    expect(screen.queryByTestId('embed-player')).not.toBeInTheDocument();
    expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
  });

  it('has no switch for a song on one service: nothing to choose', () => {
    render(<Song card={SONG_ALONE} />);

    expect(frameOf()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose another service$/ })).not.toBeInTheDocument();
  });

  describe('Card', () => {
    const cardRow = (menu: HTMLElement) =>
      within(menu).getByRole('menuitem', { name: 'Show the link card instead of a player' });

    it('is the switch’s first row, set apart from the services by a separator, unchecked while a player shows', () => {
      render(<Song card={SONG} />);

      const menu = openSwitch();
      const rows = within(menu).getAllByRole('menuitem');
      expect(rows[0]).toBe(cardRow(menu));
      expect(rows.slice(1).map((row) => row.textContent)).toEqual(['Spotify', 'TIDAL', 'YouTube']);
      expect(cardRow(menu)).not.toHaveAttribute('aria-current');
      const separator = within(menu).getByRole('separator');
      expect(separator).toHaveClass('-mx-4', 'my-0');
      expect(cardRow(menu).nextElementSibling).toBe(separator);
      expect(separator.nextElementSibling).toBe(rows[1]);
    });

    it('stays first and checked while the card shows', () => {
      render(<Song card={SONG} />);
      fireEvent.click(cardRow(openSwitch()));

      const menu = openSwitch();
      const rows = within(menu).getAllByRole('menuitem');
      expect(rows[0]).toBe(cardRow(menu));
      expect(cardRow(menu)).toHaveAttribute('aria-current', 'true');
      expect(
        within(menu)
          .getAllByTestId('play-on-row')
          .some((row) => row.hasAttribute('aria-current')),
      ).toBe(false);
      expect(within(menu).getByRole('separator')).toBeInTheDocument();
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

      it('keeps the switch for a song on one service: Card and that service, there and back', () => {
        render(<Song card={SONG_ALONE} />);

        expect(document.querySelector('iframe')).toBeNull();
        let menu = openSwitch();
        expect(cardRow(menu)).toHaveAttribute('aria-current', 'true');
        expect(
          within(menu)
            .getAllByTestId('play-on-row')
            .map((row) => row.textContent),
        ).toEqual(['Spotify']);

        fireEvent.click(within(menu).getAllByTestId('play-on-row')[0]);
        expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
        expect(screen.getByRole('button', { name: 'Spotify: choose another service' })).toBeInTheDocument();
        menu = openSwitch();
        expect(cardRow(menu)).not.toHaveAttribute('aria-current');

        fireEvent.click(cardRow(menu));
        expect(document.querySelector('iframe')).toBeNull();
        expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
      });

      it('has no switch for a song on one service the viewer ranked above Card', () => {
        setMedia({ playerOrder: ['spotify', 'card'] });
        render(<Song card={SONG_ALONE} />);

        expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
        expect(screen.queryByRole('button', { name: /choose another service$/ })).not.toBeInTheDocument();
      });

      it('loads the services’ icons only from the app with platform embeds up front off', () => {
        setMedia({ playerOrder: ['card'], embedsUpFront: false });
        render(<Song card={SONG} />);

        expect(document.querySelector('iframe')).toBeNull();
        expectNoThirdPartyLoads();
        expect(within(openSwitch()).getAllByTestId('play-on-row')).toHaveLength(3);
        expectNoThirdPartyLoads();
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

      it('shows an artist’s generic link as its card with the switch, never Play on', () => {
        render(<Song card={ARTIST} href={ARTIST.uri} />);

        expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
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

  describe('with the default settings (a new viewer, nothing saved)', () => {
    beforeEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

    it('draws the player in its place from the card, one control, and loads nothing from the service', () => {
      render(<Song card={SONG} />);

      expect(document.querySelector('iframe')).toBeNull();
      expect(document.querySelector('audio, video, script')).toBeNull();
      expectNoThirdPartyLoads();
      const facade = screen.getByTestId('player-facade');
      // One control, named for what it plays where; the header holds the switch only.
      expect(facade).toBe(screen.getByRole('button', { name: playOn('Spotify') }));
      expect(within(facade).queryAllByRole('button')).toHaveLength(0);
      expect(facade).toHaveAttribute('data-provider', 'spotify');
      // In the player's place and of its height: Spotify's one-track player.
      expect(facade).toHaveStyle({ height: '152px' });
      expect(facade).toHaveTextContent(musicFixture.name!);
      expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
        'Spotify: choose another service',
        playOn('Spotify'),
      ]);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('loads the player in its place on one press, started, as the page’s player, with no dialog', () => {
      render(<Song card={SONG} />);

      fireEvent.click(screen.getByTestId('player-facade'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
      expect(document.querySelectorAll('iframe')).toHaveLength(1);
      expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
      expect(frameOf().closest('[data-keep-playing]')).not.toBeNull();
    });

    it('loads the player from the keyboard: the drawing is a button, Enter presses it', async () => {
      const user = userEvent.setup();
      render(<Song card={SONG} />);

      screen.getByTestId('player-facade').focus();
      await user.keyboard('{Enter}');

      expect(document.querySelectorAll('iframe')).toHaveLength(1);
      expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
    });

    it('loads the player from Space too, and leaves the focus in the player that replaced the drawing', async () => {
      const user = userEvent.setup();
      render(<Song card={SONG} />);

      screen.getByTestId('player-facade').focus();
      await user.keyboard(' ');

      expect(document.querySelectorAll('iframe')).toHaveLength(1);
      // The pressed button is gone: the focus is on the player's region, the next Tab goes into the frame.
      expect(document.activeElement).toBe(screen.getByRole('region', { name: /^Spotify player:/ }));
    });

    it('closes from the dock back to the drawing, nothing loaded', () => {
      render(<Song card={SONG} />);
      fireEvent.click(screen.getByTestId('player-facade'));
      report(false);

      fireEvent.click(screen.getByRole('button', { name: 'Close the Spotify player' }));

      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByTestId('player-facade')).toBeInTheDocument();
      expectNoThirdPartyLoads();
    });

    it('loads the drawn service when it is picked again in the switch', () => {
      render(<Song card={SONG} />);

      fireEvent.click(within(openSwitch()).getAllByTestId('play-on-row')[0]);

      expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
      expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
    });

    it('shows a pick paused in a preview (the composer): no autoplay, never the page’s player', () => {
      render(<Song card={SONG} preview />);

      // YouTube, which takes an autoplay parameter.
      fireEvent.click(within(openSwitch()).getAllByTestId('play-on-row')[2]);

      expect(frameOf().getAttribute('src')).toContain('youtube');
      expect(frameOf().getAttribute('src')).not.toContain('autoplay=1');
      expect(document.querySelector('[data-keep-playing]')).toBeNull();
    });

    it('shows the card, no drawing, when Card (no player) ranks first in Players', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder: ['card'] } });
      render(<Song card={SONG} />);

      expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
      expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
    });

    it('loads a picked service at once, started: the pick is the press', () => {
      render(<Song card={SONG} />);
      expect(document.querySelector('iframe')).toBeNull();

      fireEvent.click(within(openSwitch()).getAllByTestId('play-on-row')[1]);

      expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
      expect(document.querySelectorAll('iframe')).toHaveLength(1);
      expect(frameOf().getAttribute('src')).toContain('embed.tidal.com');
      expect(frameOf().closest('[data-keep-playing]')).not.toBeNull();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('lets the played service go on a pick: the picked one plays instead, Card unloads both', () => {
      render(<Song card={SONG} />);
      fireEvent.click(screen.getByTestId('player-facade'));
      const spotify = frameOf();

      fireEvent.click(within(openSwitch()).getAllByTestId('play-on-row')[1]);
      expect(document.querySelectorAll('iframe')).toHaveLength(1);
      expect(frameOf()).not.toBe(spotify);
      expect(frameOf().getAttribute('src')).toContain('embed.tidal.com');

      fireEvent.click(within(openSwitch()).getByTestId('play-on-card'));
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
      expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
      expectNoThirdPartyLoads();
    });
  });

  describe('with platform embeds up front off', () => {
    beforeEach(() => setMedia({ embedsUpFront: false }));

    it('draws the player until it is pressed, and the service icons only from the app', () => {
      render(<Song card={SONG} />);

      expect(document.querySelector('iframe')).toBeNull();
      expectNoThirdPartyLoads();
      expect(screen.getByTestId('player-facade')).toHaveTextContent(musicFixture.name!);
      expect(screen.getByRole('button', { name: /choose another service$/ })).toBeInTheDocument();
      expect(within(openSwitch()).getAllByTestId('play-on-row')).toHaveLength(3);
      expectNoThirdPartyLoads();
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
    const TOOT: TPinakesResourceDetail = {
      ...SONG_ALONE,
      uri: 'https://mastodon.social/@Mastodon/117466985005297414',
      name: 'A post',
      site: 'mastodon.social',
      type: 'SocialMediaPosting',
      type_path: ['Thing', 'CreativeWork', 'SocialMediaPosting'],
      embed: {
        provider: 'mastodon',
        kind: 'post',
        src: 'https://mastodon.social/@Mastodon/117466985005297414/embed',
        height: null,
        aspect: null,
        allow: [],
        autoplay_param: null,
      },
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

    it('keeps what plays when a post’s frame is pressed: a post or map frame is no player', () => {
      vi.useFakeTimers();
      render(
        <>
          <Song card={DEEZER_SONG} href={DEEZER_SONG.uri} testId="deezer" />
          <Song card={TOOT} testId="toot" />
        </>,
      );
      const deezer = frameOf('deezer');
      engage(deezer);
      const playing = deezer.closest('[data-keep-playing]');
      expect(playing).not.toBeNull();

      const toot = frameOf('toot');
      expect(toot).toHaveAttribute('src', TOOT.embed?.src);
      engage(toot);
      expect(frameOf('deezer')).toBe(deezer);
      expect(Array.from(docked())).toEqual([playing]);
      expect(toot.closest('[data-keep-playing]')).toBeNull();
      expect(document.querySelector('[data-docked]')).toBeNull();
    });

    it('stops what plays when the video in a post’s frame is pressed, and loads that frame anew when other media starts', () => {
      vi.useFakeTimers();
      setMedia({ embedsUpFront: false });
      const VIDEO_TOOT = {
        ...TOOT,
        stream: { url: 'https://files.mastodon.social/a.mp4', type: 'video/mp4', preview: false },
      };
      render(
        <>
          <Song card={DEEZER_SONG} href={DEEZER_SONG.uri} testId="deezer" />
          <Song card={VIDEO_TOOT} testId="toot" />
        </>,
      );
      fireEvent.click(screen.getByRole('button', { name: playOn('Deezer') }));
      const deezer = frameOf('deezer');
      expect(deezer.closest('[data-keep-playing]')).not.toBeNull();

      // The post's frame is the link's own: the card first, the frame picked in the switch.
      pickIn('toot');
      // The menu gives the focus back to its trigger once closed: then the viewer presses in the frame.
      act(() => vi.advanceTimersByTime(1000));
      const toot = frameOf('toot');
      engage(toot);

      // The post's video plays: Deezer is let go, its drawing back (the menu closes on a later tick: by its test ID).
      expect(within(screen.getByTestId('deezer')).getByTestId('player-facade')).toHaveAttribute(
        'aria-label',
        playOn('Deezer'),
      );
      expect(within(screen.getByTestId('deezer')).queryByTestId('resource-player-frame')).not.toBeInTheDocument();
      expect(frameOf('toot')).toBe(toot);
    });

    it('keeps what plays when a post’s frame is shown by its press: a frame shown stops nothing', () => {
      setMedia({ embedsUpFront: false });
      render(
        <>
          <Song card={DEEZER_SONG} href={DEEZER_SONG.uri} testId="deezer" />
          {/* A post the card cannot tell (no text): its frame shown by the press in the card. */}
          <Song card={{ ...TOOT, name: null, description: null }} testId="toot" />
        </>,
      );
      fireEvent.click(screen.getByRole('button', { name: playOn('Deezer') }));
      const deezer = frameOf('deezer');
      const playing = deezer.closest('[data-keep-playing]');
      expect(playing).not.toBeNull();

      fireEvent.click(within(screen.getByTestId('toot')).getByTestId('post-press'));
      expect(frameOf('toot')).toHaveAttribute('src', TOOT.embed?.src);
      expect(frameOf('deezer')).toBe(deezer);
      expect(Array.from(docked())).toEqual([playing]);
    });

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

    it('leaves a player the viewer paused in its card out of the dock, until it plays again', () => {
      vi.useFakeTimers();
      render(<Page withVideo />);
      const youtube = frameOf('youtube');
      youtubeSays(youtube, 1);
      youtubeSays(youtube, 2);
      report(false);
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      // Still loaded, paused, in its card.
      expect(frameOf('youtube')).toBe(youtube);

      youtubeSays(youtube, 1);
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
    fireEvent.click(screen.getByRole('button', { name: playOn('Spotify') }));

    act(() => vi.advanceTimersByTime(12000));
    expect(screen.getByTestId('resource-player-status')).toHaveTextContent('Spotify has not answered.');
    expect(screen.getByRole('link', { name: /Open in Spotify/ })).toHaveAttribute('href', SPOTIFY);
  });

  it('does not start a plain audio file up front', () => {
    render(<Song card={{ ...SONG_ALONE, uri: 'https://example.com/song.mp3' }} href="https://example.com/song.mp3" />);

    const audio = screen.getByTestId('resource-player-audio') as HTMLAudioElement;
    expect(audio.autoplay).toBe(false);
  });

  it('shows an artist’s generic link as its card, a song that is not ok as its player, one gone upstream as its card', () => {
    const { unmount } = render(<Song card={ARTIST} href={ARTIST.uri} />);
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('player-switch')).toHaveTextContent('Card');
    unmount();

    const { unmount: unmountUnreachable } = render(<Song card={{ ...SONG, status: 'unreachable' }} />);
    expect(frameOf()).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
    unmountUnreachable();

    // Gone upstream: its own link offers no player, so the card shows, its Also on in the switch.
    render(<Song card={{ ...SONG, status: 'missing' }} />);
    expect(document.querySelector('iframe')).toBeNull();
    expect(
      within(openSwitch())
        .getAllByTestId('play-on-row')
        .map((row) => row.textContent),
    ).toEqual(['TIDAL', 'YouTube']);
    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
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
    expect(rows.map((row) => row.textContent)).toEqual(['YouTube', 'Spotify', 'Deezer', 'TIDAL', 'Apple Music']);
  });

  describe('with no service of its own (a generic link)', () => {
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

    const rows = () =>
      within(openSwitch())
        .getAllByTestId('play-on-row')
        .map((row) => row.textContent);

    it('shows its card first, its services in Pinakes’ order in the switch, not the one that starts on a press first', () => {
      render(<Song card={recording} href={recording.uri} />);

      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByText(musicFixture.name!)).toBeInTheDocument();
      expect(rows()).toEqual(['Deezer', 'Spotify']);
    });

    it('lists the viewer’s first player first, the card still first', () => {
      setMedia({ playerOrder: ['spotify'] });
      render(<Song card={recording} href={recording.uri} />);

      expect(document.querySelector('iframe')).toBeNull();
      expect(rows()).toEqual(['Spotify', 'Deezer']);
    });

    it('shows a picked service’s player, paused', () => {
      render(<Song card={recording} href={recording.uri} />);

      fireEvent.click(within(openSwitch()).getAllByTestId('play-on-row')[1]);
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
      fireEvent.click(screen.getByRole('button', { name: playOn('Spotify') }));
      expect(frameOf()).toBeInTheDocument();

      rerender(<Song card={other} href={other.uri} />);
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByRole('button', { name: playOn('Spotify', 'Get Lucky') })).toBeInTheDocument();
    });
  });
});

/**
 * Every link that plays shows its player up front, as a song does: a video, an album, an episode,
 * any link on a service with a player; the switch only when there is more than one service.
 */
describe('useCardPlayer, anything that plays', () => {
  function Item({ card, href = card.uri }: { card: TPinakesResourceDetail; href?: string }) {
    const { embed, switcher } = useCardPlayer(card, href);
    const body = <p>{card.name}</p>;
    return (
      <section data-testid="item">
        <header data-testid="item-header">{switcher}</header>
        {embed ?? body}
      </section>
    );
  }
  const frame = () => screen.getByTestId('resource-player-frame');
  const noPlayOn = () => expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
  const switchRows = () => {
    fireEvent.pointerDown(screen.getByRole('button', { name: /choose another service$/ }), { button: 0 });
    return within(screen.getByTestId('play-on-menu'))
      .getAllByTestId('play-on-row')
      .map((row) => row.textContent);
  };

  afterEach(() => useSettingsStore.setState({ media: upFrontMedia }));

  it('shows an ordinary video Pinakes knows nowhere else as its player, paused, with no switch and no Play on', () => {
    render(<Item card={{ ...videoFixture, also_on: [] }} />);

    expect(frame()).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0');
    expect(screen.queryByText(videoFixture.name!)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose another service$/ })).not.toBeInTheDocument();
    noPlayOn();
  });

  it('shows a video with Also on as its player too, its other services in the switch', () => {
    render(<Item card={videoFixture} />);

    expect(frame()).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0');
    noPlayOn();
    expect(switchRows()).toEqual(['YouTube', 'TIDAL', 'Apple Music', 'Deezer', 'Spotify']);
  });

  it('shows a MusicBrainz release group, a generic link, as its card first, its Also on in the switch', () => {
    const album: TPinakesResourceDetail = {
      ...musicFixture,
      uri: 'https://musicbrainz.org/release-group/8e8a594f-2175-38c7-a871-abb68ec363e7',
      type: 'MusicAlbum',
      type_path: ['Thing', 'CreativeWork', 'MusicPlaylist', 'MusicAlbum'],
      aliases: [],
      also_on: [{ uri: 'https://open.spotify.com/album/1weenld61qoidwYuZ1GESA', site: 'Spotify' }],
    };
    render(<Item card={album} />);

    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('player-switch')).toHaveTextContent('Card');
    expect(switchRows()).toEqual(['Spotify']);
    noPlayOn();
  });

  it('shows a Spotify artist page, its link on a service with a player, as that player', () => {
    const artist: TPinakesResourceDetail = {
      ...ARTIST,
      uri: 'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi',
      site: 'Spotify',
      also_on: [{ uri: 'https://www.deezer.com/artist/27', site: 'Deezer' }],
    };
    render(<Item card={artist} />);

    expect(frame()).toHaveAttribute('src', 'https://open.spotify.com/embed/artist/4tZwfgrHOc3mvqYlEYSvVi');
    expect(switchRows()).toEqual(['Spotify', 'Deezer']);
    noPlayOn();
  });

  it('shows a podcast episode’s generic link as its card, Apple Podcasts from its Also on in the switch', () => {
    const episode: TPinakesResourceDetail = {
      ...musicFixture,
      uri: 'https://podcastindex.org/podcast/759235?episode=61210434390',
      type: 'PodcastEpisode',
      type_path: ['Thing', 'CreativeWork', 'Episode', 'PodcastEpisode'],
      aliases: [],
      also_on: [
        { uri: 'https://podcasters.spotify.com/pod/show/stephan-livera/episodes/x-e3pqhh4', site: 'Spotify' },
        { uri: 'https://podcasts.apple.com/us/podcast/x/id1415720320?i=1000792990676', site: 'Apple Podcasts' },
      ],
    };
    render(<Item card={episode} />);

    expect(document.querySelector('iframe')).toBeNull();
    expect(switchRows()).toEqual(['Apple Podcasts']);
    fireEvent.click(within(screen.getByTestId('play-on-menu')).getAllByTestId('play-on-row')[0]);
    expect(frame()).toHaveAttribute('src', 'https://embed.podcasts.apple.com/us/episode/1000792990676');
    noPlayOn();
  });

  it('shows a SoundCloud track as its player, with no switch', () => {
    const track: TPinakesResourceDetail = {
      ...musicFixture,
      uri: 'https://soundcloud.com/forss/flickermood',
      type: 'CreativeWork',
      type_path: ['Thing', 'CreativeWork'],
      aliases: [],
      also_on: [],
    };
    render(<Item card={track} />);

    expect(frame().getAttribute('src')).toMatch(/^https:\/\/w\.soundcloud\.com\/player\/\?url=/);
    expect(frame().getAttribute('src')).not.toMatch(/auto_play/);
    expect(screen.queryByRole('button', { name: /choose another service$/ })).not.toBeInTheDocument();
  });

  it('loads nothing up front with platform embeds up front off: a stand-in with Play on', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    render(<Item card={videoFixture} />);

    expect(document.querySelector('iframe')).toBeNull();
    expectNoThirdPartyLoads();
    expect(screen.getByRole('button', { name: playOn('YouTube', videoFixture.name!) })).toBeInTheDocument();
  });

  it('loads the player in the drawing’s place on a press with platform embeds up front off, started, with no Close pill', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    render(<Item card={videoFixture} />);

    fireEvent.click(screen.getByRole('button', { name: playOn('YouTube', videoFixture.name!) }));
    expect(frame()).toHaveAttribute('src', expect.stringContaining('autoplay=1'));
    expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close YouTube' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts the switch apart from the player, for the header of the frame it is shown in', () => {
    render(<Item card={videoFixture} />);

    expect(within(screen.getByTestId('item-header')).getByTestId('player-switch')).toHaveTextContent('YouTube');
    expect(within(screen.getByTestId('embed-player')).queryByTestId('player-switch')).not.toBeInTheDocument();
  });
});

describe('useCardPlayer, a podcast that plays in its card', () => {
  // Dan Carlin's show on Apple Podcasts (also on Spotify), with its latest episodes.
  const episodes = [1, 2].map((n) => ({
    uri: `https://example.org/episode/${n}`,
    name: `Episode ${n}`,
    guid: `guid-${n}`,
    stream: { url: `https://example.org/ep${n}.mp3`, type: 'audio/mpeg', preview: false },
  }));
  const SHOW: TPinakesResourceDetail = { ...podcastFixture, episodes };
  const setMedia = (media: Partial<typeof defaultMediaPreferences>) =>
    useSettingsStore.setState({ media: { ...upFrontMedia, ...media } });

  afterEach(() => setMedia({}));

  it('shows its card first, loads nothing, and offers the services’ embeds in the switch', () => {
    render(<Card card={SHOW} testId="show" />);

    expect(screen.getByTestId('show')).toHaveAttribute('data-card', 'true');
    expect(document.querySelector('iframe')).toBeNull();
    expect(within(screen.getByTestId('show-header')).getByTestId('player-switch')).toHaveTextContent('Card');
    const menu = openSwitchOf('show');
    expect(within(menu).getByTestId('play-on-card')).toHaveAttribute('aria-current', 'true');
    expect(rowsOf(menu)).toEqual(['Apple Podcasts', 'Spotify']);
  });

  it('does so for an episode with its whole audio too, but not for a preview', () => {
    const episode: TPinakesResourceDetail = {
      ...podcastFixture,
      type: 'PodcastEpisode',
      type_path: ['Thing', 'CreativeWork', 'Episode', 'PodcastEpisode'],
      stream: { url: 'https://example.org/ep.mp3', type: 'audio/mpeg', preview: false },
    };
    const { unmount } = render(<Card card={episode} testId="episode" />);
    expect(screen.getByTestId('episode')).toHaveAttribute('data-card', 'true');
    unmount();

    render(<Card card={{ ...episode, stream: { ...episode.stream!, preview: true } }} testId="preview" />);
    expect(screen.getByTestId('preview')).toHaveAttribute('data-card', 'false');
  });

  it('shows the first service’s embed once the viewer moves the built-in player below the services', () => {
    // Moved to the end of Podcasts' list: stored as no order (Auto), the shared link's service first.
    setMedia({ players: { podcasts: { order: [], hidden: [] } } });
    const { unmount } = render(<Card card={SHOW} testId="show" />);

    expect(screen.getByTestId('show')).toHaveAttribute('data-card', 'false');
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
      'src',
      expect.stringContaining('embed.podcasts.apple.com'),
    );
    unmount();

    // Ranked below Spotify: Spotify's embed.
    setMedia({ players: { podcasts: { order: ['spotify', 'card', 'apple-podcasts'], hidden: [] } } });
    render(<Card card={SHOW} testId="ranked" />);
    expect(screen.getByTestId('ranked')).toHaveAttribute('data-card', 'false');
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
      'src',
      expect.stringContaining('open.spotify.com/embed/show/'),
    );
  });

  it('keeps the shared link’s embed first for a show with nothing to play in its card', () => {
    render(<Card card={podcastFixture} testId="show" />);

    expect(screen.getByTestId('show')).toHaveAttribute('data-card', 'false');
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
      'src',
      expect.stringContaining('embed.podcasts.apple.com'),
    );
  });

  it('follows Podcasts’ players, not the ones music or video set', () => {
    setMedia({ players: { music: { order: ['spotify', 'card'], hidden: ['apple-podcasts'] } } });
    render(<Card card={SHOW} testId="show" />);

    expect(screen.getByTestId('show')).toHaveAttribute('data-card', 'true');
    expect(rowsOf(openSwitchOf('show'))).toEqual(['Apple Podcasts', 'Spotify']);
  });

  it('keeps its built-in player first for an episode whose frame is on a host the app does not list, and the switch back to it', () => {
    const episode: TPinakesResourceDetail = {
      ...podcastFixture,
      uri: 'https://example.podbean.com/e/episode-1/',
      site: 'Podbean',
      type: 'PodcastEpisode',
      type_path: ['Thing', 'CreativeWork', 'Episode', 'PodcastEpisode'],
      stream: { url: 'https://example.org/ep.mp3', type: 'audio/mpeg', preview: false },
      aliases: [],
      also_on: [],
      embed: {
        provider: 'podbean',
        kind: 'audio',
        src: 'https://www.podbean.com/player-v2/?i=abc',
        height: 150,
        aspect: null,
        allow: [],
        autoplay_param: null,
      },
    };
    render(<Card card={episode} testId="episode" />);

    expect(screen.getByTestId('episode')).toHaveAttribute('data-card', 'true');
    expect(document.querySelector('iframe')).toBeNull();
    let menu = openSwitchOf('episode');
    expect(rowsOf(menu)).toEqual(['Podbean']);

    // Its frame picked, the switch stays: Card brings the built-in player back.
    fireEvent.click(within(menu).getAllByTestId('play-on-row')[0]);
    expect(screen.getByTestId('episode')).toHaveAttribute('data-card', 'false');
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', expect.stringContaining('podbean.com'));
    menu = openSwitchOf('episode');
    expect(within(menu).getByTestId('play-on-card')).not.toHaveAttribute('aria-current');
    fireEvent.click(within(menu).getByTestId('play-on-card'));
    expect(screen.getByTestId('episode')).toHaveAttribute('data-card', 'true');
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('useCardPlayer, a frame Pinakes names (`embed`)', () => {
  const POST: TPinakesResourceDetail = {
    ...musicFixture,
    uri: 'https://mastodon.social/@Mastodon/117466985005297414',
    site: 'mastodon.social',
    type: 'SocialMediaPosting',
    type_path: ['Thing', 'CreativeWork', 'SocialMediaPosting'],
    aliases: [],
    also_on: [],
    embed: {
      provider: 'mastodon',
      kind: 'post',
      src: 'https://mastodon.social/@Mastodon/117466985005297414/embed',
      height: null,
      aspect: null,
      allow: [],
      autoplay_param: null,
    },
  };
  const PLACE: TPinakesResourceDetail = {
    ...musicFixture,
    uri: 'https://www.openstreetmap.org/node/240109189',
    name: 'Lugano',
    site: 'OpenStreetMap',
    type: 'Place',
    type_path: ['Thing', 'Place'],
    aliases: [],
    also_on: [],
    embed: {
      provider: 'openstreetmap',
      kind: 'map',
      src: 'https://www.openstreetmap.org/export/embed.html?bbox=8.94%2C46.00%2C8.96%2C46.01&layer=mapnik&marker=46.00%2C8.95',
      height: null,
      aspect: 1.7778,
      allow: [],
      autoplay_param: null,
    },
  };

  const SLIDES: TPinakesResourceDetail = {
    ...musicFixture,
    uri: 'https://speakerdeck.com/jlugia/what-is-pubky',
    name: 'What is Pubky',
    site: 'Speaker Deck',
    type: 'PresentationDigitalDocument',
    type_path: ['Thing', 'CreativeWork', 'DigitalDocument', 'PresentationDigitalDocument'],
    aliases: [],
    also_on: [],
    embed: {
      provider: 'speaker-deck',
      kind: 'rich',
      src: 'https://speakerdeck.com/player/0123456789abcdef',
      height: null,
      aspect: 1.7778,
      allow: [],
      autoplay_param: null,
    },
  };

  it('shows a rich frame up front like any embed, while a place keeps its card first', () => {
    render(
      <>
        <Card card={SLIDES} testId="slides" />
        <Card card={PLACE} testId="place" />
      </>,
    );

    expect(screen.getByTestId('slides')).toHaveAttribute('data-card', 'false');
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', SLIDES.embed?.src);
    expect(screen.getByRole('region', { name: /^Speaker Deck embed:/ })).toBeInTheDocument();
    expect(within(screen.getByTestId('slides')).queryByTestId('player-switch')).not.toBeInTheDocument();
    expect(screen.getByTestId('place')).toHaveAttribute('data-card', 'true');
    expect(within(screen.getByTestId('place')).queryByTestId('resource-player-frame')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('place-header')).getByTestId('player-switch')).toHaveTextContent('Card');
  });

  it('offers no map service’s frame for a place whose card draws its own map, and keeps it where none is drawn', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    onTestFinished(() => {
      useSettingsStore.setState({ media: upFrontMedia });
    });
    const MAPPED = { ...PLACE, point: { lat: 46.0, lon: 8.95 } };
    render(
      <>
        <Card card={MAPPED} testId="mapped" />
        <ResourceLocationProvider variant="row">
          <Card card={MAPPED} testId="row" />
        </ResourceLocationProvider>
        <Card card={PLACE} testId="unmapped" />
      </>,
    );

    // The card's own map is the place's map: no Show on OpenStreetMap, no second map frame.
    expect(within(screen.getByTestId('mapped-header')).queryByRole('button', { name: /OpenStreetMap/ })).toBeNull();
    expect(within(screen.getByTestId('mapped-header')).queryByTestId('player-switch')).toBeNull();
    // A row draws no map, nor does a place with no point: the card first, the frame one pick away.
    expect(screen.getByTestId('row')).toHaveAttribute('data-card', 'true');
    expect(within(screen.getByTestId('unmapped-header')).getByTestId('player-switch')).toHaveTextContent('Card');
    expect(rowsOf(openSwitchOf('row'))).toEqual(['OpenStreetMap']);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('keeps the map service in the switch of a place that draws its map, with platform embeds up front on', () => {
    render(<Card card={{ ...PLACE, point: { lat: 46.0, lon: 8.95 } }} testId="mapped" />);

    expect(within(screen.getByTestId('mapped-header')).getByTestId('player-switch')).toHaveTextContent('Card');
  });

  it('keeps a rich link’s card with platform embeds up front off: its frame in the switch, shown when picked', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    onTestFinished(() => {
      useSettingsStore.setState({ media: upFrontMedia });
    });
    render(
      <>
        <Card card={SLIDES} testId="slides" />
        <Card card={PLACE} testId="place" />
      </>,
    );

    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('slides')).toHaveAttribute('data-card', 'true');
    expect(screen.getByTestId('place')).toHaveAttribute('data-card', 'true');
    // Its one frame in the switch, below Card: the pick shows it at once.
    expect(rowsOf(openSwitchOf('slides'))).toEqual(['Speaker Deck']);
    fireEvent.click(screen.getByTestId('play-on-row'));
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', SLIDES.embed?.src);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(screen.queryByTestId('player-dock-close')).not.toBeInTheDocument();
  });

  it('lets a frame go while its card is hidden (a feed behind an open post), and loads it again when shown', () => {
    // Cards inside `[data-hidden]` are laid out nowhere; any other far below the viewport.
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return asOpaque<DOMRectList>(this.closest('[data-hidden]') ? [] : [{}]);
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ top: 5000, bottom: 5080, left: 0, right: 400, width: 400, height: 80, x: 0, y: 5000 }) as DOMRect,
    );
    let resizes: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private readonly report: () => void;
        constructor(report: () => void) {
          this.report = report;
        }
        observe() {
          resizes.push(this.report);
        }
        unobserve() {}
        disconnect() {
          resizes = resizes.filter((report) => report !== this.report);
        }
      },
    );
    onTestFinished(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });
    const Feed = ({ hidden }: { hidden: boolean }) => (
      <div data-hidden={hidden || undefined}>
        <Card card={SLIDES} testId="slides" />
      </div>
    );
    const resize = () => act(() => resizes.forEach((report) => report()));
    const { rerender } = render(<Feed hidden={false} />);

    // Off screen but laid out: it stays.
    resize();
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', SLIDES.embed?.src);

    rerender(<Feed hidden />);
    resize();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('embed-player')).toBeInTheDocument();

    rerender(<Feed hidden={false} />);
    resize();
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', SLIDES.embed?.src);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('shows a post’s own frame up front, its only source: no switch, no Card', () => {
    render(<Card card={POST} testId="post" />);

    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', POST.embed?.src);
    expect(screen.getByRole('region', { name: /^mastodon\.social embed:/ })).toBeInTheDocument();
    expect(screen.queryByTestId('player-switch')).not.toBeInTheDocument();
  });

  it('shows a place’s card first and its map in the switch, at the map’s shape', () => {
    render(<Card card={PLACE} testId="place" />);

    expect(screen.getByTestId('place')).toHaveAttribute('data-card', 'true');
    expect(document.querySelector('iframe')).toBeNull();
    const menu = openSwitchOf('place');
    expect(rowsOf(menu)).toEqual(['OpenStreetMap']);
    fireEvent.click(within(menu).getAllByTestId('play-on-row')[0]);
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', PLACE.embed?.src);
    expect(screen.getByRole('region', { name: /^OpenStreetMap embed:/ })).toHaveStyle({ aspectRatio: '1.7778' });
  });

  it('offers no frame for a post its card tells, with platform embeds up front off: the card shows it', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    onTestFinished(() => {
      useSettingsStore.setState({ media: upFrontMedia });
    });
    render(<Card card={POST} testId="post" />);

    // Nothing to play or show: no switch, no Show on in the header.
    expect(within(screen.getByTestId('post-header')).queryByRole('button')).not.toBeInTheDocument();
    expectNoThirdPartyLoads();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('sees a post’s video in the link preview image it is given (an X video still), as its surfaces do', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    onTestFinished(() => {
      useSettingsStore.setState({ media: upFrontMedia });
    });
    function PostWithPreview() {
      const { switcher, embed } = useCardPlayer({ ...POST, image: null }, POST.uri, undefined, {
        previewImage: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still.jpg',
      });
      return (
        <section data-testid="preview-post">
          {switcher}
          {embed}
        </section>
      );
    }
    render(<PostWithPreview />);

    // Not told from the card (it has a video): its frame is a choice, loaded when picked.
    pickIn('preview-post');
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', POST.embed?.src);
  });

  it('offers a post whose frame carries a video in the switch, with platform embeds up front off, loaded when picked', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    onTestFinished(() => {
      useSettingsStore.setState({ media: upFrontMedia });
    });
    render(
      <Card
        card={{ ...POST, stream: { url: 'https://media.example/a.mp4', type: 'video/mp4', preview: false } }}
        testId="post"
      />,
    );

    expectNoThirdPartyLoads();
    expect(screen.getByTestId('post')).toHaveAttribute('data-card', 'true');
    pickIn('post');
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', POST.embed?.src);
  });

  it('offers only the other services in the switch beside a post’s press, never the post’s own frame', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    onTestFinished(() => {
      useSettingsStore.setState({ media: upFrontMedia });
    });
    const spotify = { id: 's', uri: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq', site: 'Spotify' };
    render(<Card card={{ ...POST, name: null, description: null, also_on: [spotify] }} testId="post" />);

    expect(screen.getByTestId('post-press')).toBeInTheDocument();
    const menu = openSwitchOf('post');
    expect(rowsOf(menu)).toEqual(['Spotify']);
    expect(document.querySelector('iframe')).toBeNull();

    // Another service from the switch takes the card's place; Card gives the card and its press back.
    fireEvent.click(within(menu).getAllByTestId('play-on-row')[0]);
    expect(screen.queryByTestId('post-press')).not.toBeInTheDocument();
    expect(screen.getByTestId('post')).toHaveAttribute('data-card', 'false');
    fireEvent.click(within(openSwitchOf('post')).getByTestId('play-on-card'));
    expect(screen.getByTestId('post')).toHaveAttribute('data-card', 'true');
    expect(screen.getByTestId('post-press')).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('loads no frame with platform embeds up front off for a post its card cannot tell, until the press in its card', () => {
    useSettingsStore.setState({ media: { ...upFrontMedia, embedsUpFront: false } });
    onTestFinished(() => {
      useSettingsStore.setState({ media: upFrontMedia });
    });
    render(<Card card={{ ...POST, name: null, description: null }} testId="post" />);

    expect(document.querySelector('iframe')).toBeNull();
    expectNoThirdPartyLoads();
    expect(screen.getByTestId('post')).toHaveAttribute('data-card', 'true');
    expect(screen.queryByTestId('player-switch')).not.toBeInTheDocument();
    const press = screen.getByRole('button', { name: 'Show post from mastodon.social' });
    fireEvent.click(press);
    // Shown, not played: it is not the page's player, so it neither docks nor stops what plays.
    expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', POST.embed?.src);
    expect(screen.queryByTestId('player-dock-close')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-press')).not.toBeInTheDocument();

    // Close gives the card back, nothing loaded.
    fireEvent.click(screen.getByRole('button', { name: 'Close the mastodon.social post' }));
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByTestId('post-press')).toHaveFocus();
  });
});
