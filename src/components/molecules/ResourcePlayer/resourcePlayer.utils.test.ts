import { describe, expect, it } from 'vitest';
import type { TPinakesAlsoOn } from '@/services/pinakes/pinakes.types';
import { getPlayerTarget, getPlayerTargets, PlayerProvider } from './resourcePlayer.utils';

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
    'https://music.apple.com/song/1440717826',
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
    expect(getPlayerTargets(card('https://music.apple.com/song/1440717826'))).toEqual([]);
  });
});
