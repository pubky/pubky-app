import { describe, expect, it } from 'vitest';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import type { TPinakesAlsoOn } from '@/services/pinakes/pinakes.types';
import {
  CARD_PLAYER,
  getPlayerList,
  getPlayerTarget,
  getPlayerTargets,
  getUpFrontTarget,
  isCardFirst,
  isPlayable,
  isRankedOrder,
  PlayerProvider,
  PROVIDER_NAMES,
} from './resourcePlayer.utils';

const card = (uri: string, alsoOn: TPinakesAlsoOn[] = [], status = 'ok') => ({ uri, status, also_on: alsoOn });

describe('getPlayerTarget', () => {
  it('builds a youtube-nocookie player from a watch link, dropping everything else', () => {
    const target = getPlayerTarget('https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc&t=10');
    expect(target?.provider).toBe(PlayerProvider.YOUTUBE);
    expect(target?.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&autoplay=1&rel=0');
    expect(target?.layout).toEqual({ kind: 'video' });
  });

  it('plays a YouTube playlist as a video series', () => {
    const target = getPlayerTarget('https://www.youtube.com/playlist?list=OLAK5uy_kNhM2yaBTOVwrcZJepB1C9P3-n5_Sfy5c');
    expect(target?.src).toContain(
      'https://www.youtube-nocookie.com/embed/videoseries?list=OLAK5uy_kNhM2yaBTOVwrcZJepB1C9P3-n5_Sfy5c',
    );
  });

  it('reads Spotify kinds with their documented heights', () => {
    expect(getPlayerTarget('https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq?si=x')).toMatchObject({
      src: 'https://open.spotify.com/embed/track/69kOkLUCkxIZYexIgSG8rq',
      layout: { kind: 'audio', height: 152, dockHeight: 80 },
    });
    expect(getPlayerTarget('https://open.spotify.com/intl-de/show/2VRS1IJCTn2Nlkg33ZVfkM')?.layout).toEqual({
      kind: 'audio',
      height: 352,
      dockHeight: 80,
    });
  });

  it('starts Spotify and TIDAL on our press by their embed messages; Mixcloud needs a press inside', () => {
    expect(getPlayerTarget('https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq')).toMatchObject({
      autoplay: true,
      start: { origin: 'https://open.spotify.com', message: { command: 'play' }, readyType: 'ready' },
    });
    expect(getPlayerTarget('https://tidal.com/browse/track/77646168')).toMatchObject({
      autoplay: true,
      start: { origin: 'https://embed.tidal.com', message: '{"commandName":"play"}' },
    });
    const mixcloud = getPlayerTarget('https://www.mixcloud.com/spartacus/party-time/');
    expect(mixcloud?.autoplay).toBe(false);
    expect(mixcloud?.start).toBeUndefined();
    expect(getPlayerTarget('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.start).toBeUndefined();
  });

  it('builds SoundCloud, Mixcloud, TIDAL and Vimeo players from links', () => {
    expect(getPlayerTarget('https://soundcloud.com/forss/flickermood')?.src).toBe(
      'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood&auto_play=true&visual=false&show_teaser=false',
    );
    expect(
      getPlayerTarget('https://soundcloud.com/daftpunkofficialmusic/sets/random-access-memories-4')?.layout,
    ).toEqual({
      kind: 'audio',
      height: 450,
      dockHeight: 166,
    });
    expect(getPlayerTarget('https://www.mixcloud.com/spartacus/party-time/')?.src).toBe(
      'https://www.mixcloud.com/widget/iframe/?feed=https%3A%2F%2Fwww.mixcloud.com%2Fspartacus%2Fparty-time%2F&hide_cover=1&autoplay=1',
    );
    expect(getPlayerTarget('https://tidal.com/track/490851477')?.src).toBe(
      'https://embed.tidal.com/tracks/490851477?hideOverlays=true',
    );
    expect(getPlayerTarget('https://tidal.com/browse/album/20115556')?.layout).toEqual({
      kind: 'audio',
      height: 275,
      dockHeight: 120,
    });
    expect(getPlayerTarget('https://vimeo.com/1084537')?.src).toBe(
      'https://player.vimeo.com/video/1084537?autoplay=1&dnt=1',
    );
  });

  it('plays an artist’s links: YouTube channel uploads, SoundCloud profile, Deezer top tracks', () => {
    expect(getPlayerTarget('https://www.youtube.com/channel/UCZpHk06_nhe7C6n0tD1mt_w')).toMatchObject({
      provider: PlayerProvider.YOUTUBE,
      link: 'https://www.youtube.com/channel/UCZpHk06_nhe7C6n0tD1mt_w',
      src: 'https://www.youtube-nocookie.com/embed/videoseries?list=UUZpHk06_nhe7C6n0tD1mt_w&enablejsapi=1&autoplay=1&rel=0',
    });
    expect(getPlayerTarget('https://soundcloud.com/sefadj')).toMatchObject({
      provider: PlayerProvider.SOUNDCLOUD,
      link: 'https://soundcloud.com/sefadj',
      layout: { kind: 'audio', height: 450 },
    });
    expect(getPlayerTarget('https://www.youtube.com/channel/UCZpHk06_nhe7C6n0tD1mt_w/videos')?.link).toBe(
      'https://www.youtube.com/channel/UCZpHk06_nhe7C6n0tD1mt_w',
    );
    expect(getPlayerTarget('https://soundcloud.com/discover')).toBeNull();
    expect(getPlayerTarget('https://soundcloud.com/settings')).toBeNull();
    expect(getPlayerTarget('https://soundcloud.com/sefadj/tracks')).toBeNull();
    expect(getPlayerTarget('https://www.deezer.com/artist/13142371')).toMatchObject({
      provider: PlayerProvider.DEEZER,
      name: 'Deezer',
      src: 'https://widget.deezer.com/widget/dark/artist/13142371/top_tracks',
      autoplay: false,
    });
    expect(getPlayerTarget('https://www.deezer.com/en/album/320429237')?.src).toBe(
      'https://widget.deezer.com/widget/dark/album/320429237',
    );
  });

  it.each(['track', 'album', 'video', 'playlist'])('plays a TIDAL %s share link (`/u`)', (kind) => {
    const id = kind === 'playlist' ? '0f4f2a2a-6c8a-4b2e-9d55-4d5c1a3b9e10' : '3524506';
    const target = getPlayerTarget(`https://tidal.com/${kind}/${id}/u`);
    expect(target?.provider).toBe(PlayerProvider.TIDAL);
    expect(target?.link).toBe(`https://tidal.com/browse/${kind}/${id}`);
    expect(target?.src).toBe(`https://embed.tidal.com/${kind}s/${id}${kind === 'video' ? '' : '?hideOverlays=true'}`);
    expect(getPlayerTarget(`https://tidal.com/browse/${kind}/${id}/u/`)?.link).toBe(target?.link);
  });

  it('keeps every audio player at a phone-sized height in the dock', () => {
    const links = [
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      'https://soundcloud.com/daftpunkofficialmusic/sets/random-access-memories-4',
      'https://soundcloud.com/sefadj',
      'https://www.mixcloud.com/spartacus/party-time/',
      'https://tidal.com/browse/album/20115556',
      'https://www.deezer.com/album/320429237',
      'https://example.com/files/episode.mp3',
    ];
    const dockHeights = links.map((link) => {
      const layout = getPlayerTarget(link)?.layout;
      return layout?.kind === 'audio' ? (layout.dockHeight ?? layout.height) : null;
    });
    dockHeights.forEach((height) => expect(height).toBeLessThanOrEqual(166));
  });

  it('plays Apple Music songs, albums and playlists in Apple’s embed, which needs a press inside', () => {
    expect(getPlayerTarget('https://music.apple.com/song/1440717826')).toMatchObject({
      provider: PlayerProvider.APPLE_MUSIC,
      name: 'Apple Music',
      link: 'https://music.apple.com/us/song/1440717826',
      src: 'https://embed.music.apple.com/us/song/1440717826',
      layout: { kind: 'audio', height: 175, dockHeight: 175 },
      autoplay: false,
    });
    // An album's song (`?i=`) is that song.
    expect(getPlayerTarget('https://music.apple.com/de/album/random-access-memories/617154241?i=617154366')?.src).toBe(
      'https://embed.music.apple.com/de/song/617154366',
    );
    expect(getPlayerTarget('https://music.apple.com/us/album/random-access-memories/617154241')).toMatchObject({
      src: 'https://embed.music.apple.com/us/album/617154241',
      layout: { kind: 'audio', height: 450 },
    });
    expect(
      getPlayerTarget('https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb')?.src,
    ).toBe('https://embed.music.apple.com/us/playlist/pl.f4d106fed2bd41149aaacabb233eb5eb');
  });

  it('plays Apple Podcasts shows and episodes in Apple’s embed', () => {
    expect(
      getPlayerTarget('https://podcasts.apple.com/us/podcast/lightning-in-x402/id1415720320?i=1000792990676'),
    ).toMatchObject({
      provider: PlayerProvider.APPLE_PODCASTS,
      name: 'Apple Podcasts',
      link: 'https://podcasts.apple.com/us/podcast/id1415720320?i=1000792990676',
      src: 'https://embed.podcasts.apple.com/us/episode/1000792990676',
      layout: { kind: 'audio', height: 175 },
      autoplay: false,
    });
    expect(getPlayerTarget('https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485')).toMatchObject({
      src: 'https://embed.podcasts.apple.com/us/podcast/1296350485',
      layout: { kind: 'audio', height: 450 },
    });
  });

  it('plays a plain https audio file in the browser player', () => {
    expect(getPlayerTarget('https://example.com/files/episode.mp3')).toMatchObject({ element: 'audio' });
  });

  it.each([
    'http://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq',
    'https://open.spotify.com.evil.example/track/69kOkLUCkxIZYexIgSG8rq',
    'https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ',
    'https://soundcloud.com/discover/sets/x',
    'https://soundcloud.com/forss/likes',
    'https://www.deezer.com/episode/320429237',
    'https://tidal.com/artist/7429906',
    'https://tidal.com/track/3524506/x',
    'https://music.apple.com/us/artist/daft-punk/5468295',
    'https://music.apple.com/us/playlist/x/1440717826',
    'https://podcasts.apple.com/us/podcast/darknet-diaries/1296350485',
    'https://tycho.bandcamp.com/album/dive',
    'https://www.youtube.com/@Sefaofficial',
    'javascript:alert(1)',
  ])('offers no player for %s', (link) => {
    expect(getPlayerTarget(link)).toBeNull();
  });
});

describe('getPlayerTargets', () => {
  it('lists one player per service: own link first, then Also on in Pinakes’ order', () => {
    const targets = getPlayerTargets(
      card('https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq', [
        { uri: 'https://www.deezer.com/track/67238735', site: 'Deezer' },
        { uri: 'https://tidal.com/track/20115564', site: 'TIDAL', derived: true },
        { uri: 'https://www.youtube.com/watch?v=5NV6Rdv1a3I', site: 'YouTube' },
        { uri: 'https://open.spotify.com/track/118Opfz7qv2KA1g3Pmyk9T', site: 'Spotify', derived: true },
        { uri: 'https://www.youtube.com/watch?v=4D7u5KF7SP8', site: 'YouTube', derived: true },
      ] as TPinakesAlsoOn[]),
    );
    // Deezer needs a press inside its player: after the services that start on ours.
    expect(targets.map((target) => target.provider)).toEqual([
      PlayerProvider.SPOTIFY,
      PlayerProvider.TIDAL,
      PlayerProvider.YOUTUBE,
      PlayerProvider.DEEZER,
    ]);
    expect(targets[2].link).toBe('https://www.youtube.com/watch?v=5NV6Rdv1a3I');
  });

  it('keeps a card’s own Deezer link first', () => {
    const targets = getPlayerTargets(
      card('https://www.deezer.com/album/320429237', [
        { uri: 'https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv', site: 'Spotify' },
      ] as TPinakesAlsoOn[]),
    );
    expect(targets.map((target) => target.provider)).toEqual([PlayerProvider.DEEZER, PlayerProvider.SPOTIFY]);
  });

  it('skips the own link of a card that is gone upstream', () => {
    const targets = getPlayerTargets(
      card(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        [{ uri: 'https://vimeo.com/1084537' }] as TPinakesAlsoOn[],
        'missing',
      ),
    );
    expect(targets.map((target) => target.provider)).toEqual([PlayerProvider.VIMEO]);
  });

  it('plays the link as written first when a player takes it', () => {
    const tidal = { ...card('https://tidal.com/track/3524506'), aliases: [] };
    expect(getPlayerTargets(tidal, { href: 'https://tidal.com/album/3524505' })[0]?.link).toBe(
      'https://tidal.com/browse/album/3524505',
    );
  });

  it('falls back to the card’s canonical link, then its aliases, when the written link has no player', () => {
    const tidal = { ...card('https://tidal.com/track/3524506'), aliases: [] };
    expect(getPlayerTargets(tidal, { href: 'http://tidal.com/track/3524506' })[0]?.link).toBe(
      'https://tidal.com/browse/track/3524506',
    );
    const aliased = { ...card('https://example.com/song'), aliases: ['https://tidal.com/track/3524506'] };
    expect(getPlayerTargets(aliased, { href: 'https://example.com/s/1' }).map((target) => target.link)).toEqual([
      'https://tidal.com/browse/track/3524506',
    ]);
  });

  it('offers no own player for a missing card, whatever its written link', () => {
    const gone = { ...card('https://tidal.com/track/3524506', [], 'missing'), aliases: [] };
    expect(getPlayerTargets(gone, { href: 'https://tidal.com/track/3524506' })).toEqual([]);
  });

  it('offers nothing for a card on services we do not embed', () => {
    expect(getPlayerTargets(card('https://tycho.bandcamp.com/album/dive'))).toEqual([]);
  });

  describe('with the viewer’s Players', () => {
    const song = card('https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq', [
      { uri: 'https://tycho.bandcamp.com/track/awake', site: 'Bandcamp' },
      { uri: 'https://www.youtube.com/watch?v=5NV6Rdv1a3I', site: 'YouTube' },
      { uri: 'https://tidal.com/track/20115564', site: 'TIDAL' },
    ] as TPinakesAlsoOn[]);
    const providers = (playerOrder: string[], hiddenPlayers: string[] = []) =>
      getPlayerTargets(song, { players: { playerOrder, hiddenPlayers } }).map((target) => target.provider);
    const auto = [PlayerProvider.SPOTIFY, PlayerProvider.YOUTUBE, PlayerProvider.TIDAL];

    it('orders the card’s services by the viewer’s order', () => {
      expect(providers(['tidal', 'youtube', 'spotify'])).toEqual([
        PlayerProvider.TIDAL,
        PlayerProvider.YOUTUBE,
        PlayerProvider.SPOTIFY,
      ]);
    });

    it('puts the services not in the order after those that are, in the Auto order', () => {
      expect(providers(['tidal'])).toEqual([PlayerProvider.TIDAL, PlayerProvider.SPOTIFY, PlayerProvider.YOUTUBE]);
      // A service a later version adds is in no order yet.
      expect(providers(['youtube', 'deezer', 'napster'])).toEqual([
        PlayerProvider.YOUTUBE,
        PlayerProvider.SPOTIFY,
        PlayerProvider.TIDAL,
      ]);
    });

    it('keeps the Auto order with no order (never reordered), or none given', () => {
      expect(providers([])).toEqual(auto);
      expect(getPlayerTargets(song).map((target) => target.provider)).toEqual(auto);
    });

    it('leaves out the services the viewer removed, the card’s own link’s too', () => {
      expect(providers([], ['spotify'])).toEqual([PlayerProvider.YOUTUBE, PlayerProvider.TIDAL]);
      expect(providers(['tidal', 'youtube'], ['tidal'])).toEqual([PlayerProvider.YOUTUBE, PlayerProvider.SPOTIFY]);
    });

    it('offers nothing when every service the card is on is removed', () => {
      expect(providers([], ['spotify', 'youtube', 'tidal'])).toEqual([]);
    });

    it('keeps a plain audio file, which is no service, after the ranked ones', () => {
      const episode = card('https://example.com/episode.mp3', [
        { uri: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', site: 'Spotify' },
      ] as TPinakesAlsoOn[]);
      const ranked = getPlayerTargets(episode, {
        players: { playerOrder: Object.keys(PROVIDER_NAMES), hiddenPlayers: ['youtube'] },
      });
      expect(ranked.map((target) => target.provider)).toEqual([PlayerProvider.SPOTIFY, PlayerProvider.AUDIO_FILE]);
    });
  });
});

describe('getPlayerList', () => {
  const ALL = Object.keys(PROVIDER_NAMES);

  it('lists every service in the default order, none removed, with no order', () => {
    expect(getPlayerList({ playerOrder: [], hiddenPlayers: [] })).toEqual({
      shown: [...ALL, CARD_PLAYER],
      removed: [],
    });
  });

  it('shows the viewer’s order first, then the services not in it, and the removed ones apart', () => {
    expect(getPlayerList({ playerOrder: ['tidal', 'spotify'], hiddenPlayers: ['youtube'] })).toEqual({
      shown: [
        'tidal',
        'spotify',
        'vimeo',
        'soundcloud',
        'mixcloud',
        'deezer',
        'apple-music',
        'apple-podcasts',
        CARD_PLAYER,
      ],
      removed: ['youtube'],
    });
  });

  it('shows a service a later version adds at the end, and leaves out ids it does not play', () => {
    const order = ['deezer', 'tidal', 'mixcloud', 'soundcloud', 'spotify', 'napster', 'vimeo'];
    expect(getPlayerList({ playerOrder: order, hiddenPlayers: ['bandcamp'] })).toEqual({
      shown: [
        'deezer',
        'tidal',
        'mixcloud',
        'soundcloud',
        'spotify',
        'vimeo',
        'youtube',
        'apple-music',
        'apple-podcasts',
        CARD_PLAYER,
      ],
      removed: [],
    });
  });

  it('can have every service removed', () => {
    expect(getPlayerList({ playerOrder: [], hiddenPlayers: ALL })).toEqual({ shown: [CARD_PLAYER], removed: ALL });
  });

  it('shows Card (no player) where the viewer put it, and never as removed', () => {
    expect(getPlayerList({ playerOrder: ['tidal', 'card'], hiddenPlayers: ['card', 'youtube'] })).toEqual({
      shown: [
        'tidal',
        CARD_PLAYER,
        'vimeo',
        'spotify',
        'soundcloud',
        'mixcloud',
        'deezer',
        'apple-music',
        'apple-podcasts',
      ],
      removed: ['youtube'],
    });
  });
});

describe('isCardFirst', () => {
  it('is false without Card in the order (Auto, or never moved)', () => {
    expect(isCardFirst(PlayerProvider.SPOTIFY, [])).toBe(false);
    expect(isCardFirst(PlayerProvider.SPOTIFY, ['tidal', 'spotify'])).toBe(false);
  });

  it('is true when Card ranks above the service, or the service is not in the order', () => {
    expect(isCardFirst(PlayerProvider.SPOTIFY, ['card'])).toBe(true);
    expect(isCardFirst(PlayerProvider.SPOTIFY, ['tidal', 'card', 'spotify'])).toBe(true);
    expect(isCardFirst(PlayerProvider.DEEZER, ['tidal', 'card', 'spotify'])).toBe(true);
  });

  it('is false when the service ranks above Card', () => {
    expect(isCardFirst(PlayerProvider.TIDAL, ['tidal', 'card', 'spotify'])).toBe(false);
  });

  it('is false for a plain audio file: no service in the list', () => {
    expect(isCardFirst(PlayerProvider.AUDIO_FILE, ['card'])).toBe(false);
  });

  it('leaves the order of the services alone (getPlayerTargets)', () => {
    const song = card('https://open.spotify.com/track/1YQWosTIljIvxAgHWTp7KP', [
      { uri: 'https://tidal.com/track/490851477', site: 'TIDAL' },
    ]);
    const providers = (playerOrder: string[]) =>
      getPlayerTargets(song, { players: { playerOrder, hiddenPlayers: [] } }).map((target) => target.provider);

    expect(providers(['card'])).toEqual(providers([]));
    // Card moved alone saves the services above it: still Auto.
    expect(providers(['tidal', 'card'])).toEqual(providers([]));
    expect(providers(['tidal', 'card', 'spotify'])).toEqual([PlayerProvider.TIDAL, PlayerProvider.SPOTIFY]);
  });

  it('keeps the shared link’s service first when only Card moved, and shows the card for one below it', () => {
    const song = card('https://www.deezer.com/track/67238735', [
      { uri: 'https://www.youtube.com/watch?v=5NV6Rdv1a3I', site: 'YouTube' },
    ] as TPinakesAlsoOn[]);
    const playerOrder = ['youtube', 'vimeo', 'spotify', 'card'];
    const [first] = getPlayerTargets(song, { players: { playerOrder, hiddenPlayers: [] } });

    expect(first.provider).toBe(PlayerProvider.DEEZER);
    expect(isCardFirst(first.provider, playerOrder)).toBe(true);
  });
});

describe('isRankedOrder', () => {
  it('is true with a service in the order after Card, or without Card', () => {
    expect(isRankedOrder(['tidal'])).toBe(true);
    expect(isRankedOrder(['tidal', 'card', 'spotify'])).toBe(true);
    expect(isRankedOrder(['card', 'youtube'])).toBe(true);
  });

  it('is false with no service, or none after Card (Card moved alone)', () => {
    expect(isRankedOrder([])).toBe(false);
    expect(isRankedOrder(['card'])).toBe(false);
    expect(isRankedOrder(['youtube', 'vimeo', 'card'])).toBe(false);
    expect(isRankedOrder(['youtube', 'card', 'napster'])).toBe(false);
  });
});

describe('getUpFrontTarget', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://open.spotify.com/track/1YQWosTIljIvxAgHWTp7KP',
    'https://soundcloud.com/artist/track',
    'https://www.mixcloud.com/artist/mix/',
    'https://tidal.com/browse/track/77646168',
    'https://www.deezer.com/track/3135556',
  ])('keeps %s’s player, without what starts it on load', (link) => {
    const target = getPlayerTarget(link)!;
    const upFront = getUpFrontTarget(target);
    const src = new URL(upFront.src);
    expect(upFront.provider).toBe(target.provider);
    expect(src.searchParams.has('autoplay')).toBe(false);
    expect(src.searchParams.has('auto_play')).toBe(false);
    expect(upFront.start).toBeUndefined();
    expect(upFront.autoplay).toBe(false);
  });

  it('keeps a plain audio file in the browser player, which then does not start on its own', () => {
    const upFront = getUpFrontTarget(getPlayerTarget('https://example.com/a.mp3')!);
    expect(upFront.element).toBe('audio');
    expect(upFront.src).toBe('https://example.com/a.mp3');
    expect(upFront.autoplay).toBe(false);
  });
});

/**
 * The YouTube upload of Get Lucky as Pinakes reads it:
 * a `VideoObject` with no facts, on Spotify, Deezer and TIDAL as tracks and on Apple Music.
 */
const YOUTUBE_GET_LUCKY = {
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

describe('isPlayable', () => {
  const typed = (uri: string, type: string, typePath: string[], alsoOn: string[] = []) => ({
    uri,
    type,
    type_path: ['Thing', ...typePath, type],
    also_on: alsoOn.map((link) => ({ uri: link })),
    aliases: [],
  });
  const SPOTIFY_TRACK = 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq';

  it('is any card whose own link is on a service with a player: a video, a song, an artist’s page', () => {
    expect(isPlayable(YOUTUBE_GET_LUCKY)).toBe(true);
    expect(isPlayable(typed('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'VideoObject', ['CreativeWork']))).toBe(
      true,
    );
    expect(isPlayable(typed('https://www.deezer.com/artist/804443', 'Person', []))).toBe(true);
    expect(isPlayable(typed('https://soundcloud.com/forss/flickermood', 'CreativeWork', []))).toBe(true);
    expect(
      isPlayable(typed('https://podcasts.apple.com/us/podcast/x/id1296350485', 'PodcastSeries', ['CreativeWork'])),
    ).toBe(true);
  });

  it('reads the link as written, then the canonical link and its other spellings', () => {
    const page = typed('https://example.com/watch/1', 'WebPage', ['CreativeWork']);
    expect(isPlayable(page)).toBe(false);
    expect(isPlayable(page, 'https://vimeo.com/1084537')).toBe(true);
    expect(isPlayable({ ...page, aliases: ['https://vimeo.com/1084537'] })).toBe(true);
  });

  it('is a recording, album, video or episode on another site, which plays on its Also on services', () => {
    const recording = 'https://musicbrainz.org/recording/833f00e1-781f-4edd-90e4-e52712618862';
    expect(isPlayable(typed(recording, 'MusicRecording', ['CreativeWork'], [SPOTIFY_TRACK]))).toBe(true);
    expect(isPlayable({ type: null, type_path: ['Thing', 'CreativeWork', 'MusicRecording'], uri: recording })).toBe(
      true,
    );
    expect(
      isPlayable(typed('https://musicbrainz.org/release-group/1', 'MusicAlbum', ['CreativeWork', 'MusicPlaylist'])),
    ).toBe(true);
    expect(
      isPlayable(typed('https://podcastindex.org/podcast/1?episode=2', 'PodcastEpisode', ['CreativeWork', 'Episode'])),
    ).toBe(true);
  });

  it('is no card about something else, whatever services it is on: an artist, an article, a post, a place', () => {
    const artist = typed('https://musicbrainz.org/artist/b5416a54', 'Person', [], [SPOTIFY_TRACK]);
    expect(isPlayable(artist)).toBe(false);
    expect(
      isPlayable(typed('https://en.wikipedia.org/wiki/Sum_41', 'Article', ['CreativeWork'], [SPOTIFY_TRACK])),
    ).toBe(false);
    expect(
      isPlayable(
        typed(
          'https://x.com/a/status/1',
          'SocialMediaPosting',
          ['CreativeWork'],
          ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
        ),
      ),
    ).toBe(false);
    expect(isPlayable(typed('https://www.openstreetmap.org/node/1', 'Place', []))).toBe(false);
  });
});

describe('getPlayerTargets in Pinakes’ order (`autoplayFirst: false`)', () => {
  // A link with no player (MusicBrainz), on Deezer (no start on our press) before Spotify.
  const song = card('https://musicbrainz.org/recording/b1a9c0e9-d987-4042-ae91-78d6a3267d69', [
    { uri: 'https://www.deezer.com/track/4329888262', site: 'Deezer' },
    { uri: 'https://open.spotify.com/track/2OBofMJx94NryV2SK8p8Zf', site: 'Spotify' },
  ]);

  it('keeps Also on in Pinakes’ order, where Play on puts the services that start on our press first', () => {
    expect(getPlayerTargets(song).map((target) => target.provider)).toEqual(['spotify', 'deezer']);
    expect(getPlayerTargets(song, { autoplayFirst: false }).map((target) => target.provider)).toEqual([
      'deezer',
      'spotify',
    ]);
  });

  it('still puts the viewer’s first player first', () => {
    const players = { playerOrder: ['spotify'], hiddenPlayers: [] };
    expect(getPlayerTargets(song, { autoplayFirst: false, players }).map((target) => target.provider)).toEqual([
      'spotify',
      'deezer',
    ]);
  });
});
