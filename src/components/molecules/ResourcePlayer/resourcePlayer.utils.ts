import { inferMediaKindFromUrl } from '@/libs/file/inlineMediaKind';
import { extractVimeoVideoId, extractYouTubeVideoId } from '@/libs/utils/videoUrl';
import { VIDEO_EMBED_PROPS } from '@/molecules/PostLinkEmbeds/Providers/Provider.constants';
import type { TPinakesCard, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import type { MediaPreferences } from '@/stores/settings/settings.types';

/** The services whose own player the card can load. Anything else stays "Open in" only. */
export enum PlayerProvider {
  YOUTUBE = 'youtube',
  VIMEO = 'vimeo',
  SPOTIFY = 'spotify',
  SOUNDCLOUD = 'soundcloud',
  MIXCLOUD = 'mixcloud',
  TIDAL = 'tidal',
  DEEZER = 'deezer',
  APPLE_MUSIC = 'apple-music',
  APPLE_PODCASTS = 'apple-podcasts',
  AUDIO_FILE = 'audio-file',
}

/** A service the viewer ranks or removes (Settings, Links & Media, Players): every one but a plain audio file. */
export type ListedPlayer = Exclude<PlayerProvider, PlayerProvider.AUDIO_FILE>;

/** Each service's name, in this order also the Players list's default order (Settings, Links & Media). */
export const PROVIDER_NAMES: Record<ListedPlayer, string> = {
  [PlayerProvider.YOUTUBE]: 'YouTube',
  [PlayerProvider.VIMEO]: 'Vimeo',
  [PlayerProvider.SPOTIFY]: 'Spotify',
  [PlayerProvider.SOUNDCLOUD]: 'SoundCloud',
  [PlayerProvider.MIXCLOUD]: 'Mixcloud',
  [PlayerProvider.TIDAL]: 'TIDAL',
  [PlayerProvider.DEEZER]: 'Deezer',
  [PlayerProvider.APPLE_MUSIC]: 'Apple Music',
  [PlayerProvider.APPLE_PODCASTS]: 'Apple Podcasts',
};

/** Each service's site, whose favicon stands for it in the Players list. */
export const PROVIDER_SITES: Record<ListedPlayer, string> = {
  [PlayerProvider.YOUTUBE]: 'https://www.youtube.com/',
  [PlayerProvider.VIMEO]: 'https://vimeo.com/',
  [PlayerProvider.SPOTIFY]: 'https://open.spotify.com/',
  [PlayerProvider.SOUNDCLOUD]: 'https://soundcloud.com/',
  [PlayerProvider.MIXCLOUD]: 'https://www.mixcloud.com/',
  [PlayerProvider.TIDAL]: 'https://tidal.com/',
  [PlayerProvider.DEEZER]: 'https://www.deezer.com/',
  [PlayerProvider.APPLE_MUSIC]: 'https://music.apple.com/',
  [PlayerProvider.APPLE_PODCASTS]: 'https://podcasts.apple.com/',
};

/** The viewer's Players (Settings, Links & Media): their order and the removed ones. */
export type PlayerPreferences = Pick<MediaPreferences, 'playerOrder' | 'hiddenPlayers'>;

/** Whether an id is a service this version lists (a later version's id is not). */
export function isListedPlayer(id: string): id is ListedPlayer {
  return Object.hasOwn(PROVIDER_NAMES, id);
}

/**
 * The Players list as shown (Settings, Links & Media): the services in the viewer's order, then
 * those not in it in their default order (a service a later version adds shows up at the end), the
 * removed ones apart. Card (no player) is a row too, last until moved, and never removed. Ids this
 * version does not play are left out of both.
 */
export function getPlayerList({ playerOrder, hiddenPlayers }: PlayerPreferences): {
  shown: PlayerListEntry[];
  removed: ListedPlayer[];
} {
  const all = [
    ...new Set<PlayerListEntry>([
      ...playerOrder.filter(isPlayerListEntry),
      ...(Object.keys(PROVIDER_NAMES) as ListedPlayer[]),
      CARD_PLAYER,
    ]),
  ];
  return {
    shown: all.filter((id) => id === CARD_PLAYER || !hiddenPlayers.includes(id)),
    removed: all.filter((id): id is ListedPlayer => id !== CARD_PLAYER && hiddenPlayers.includes(id)),
  };
}

/**
 * Whether a service may load at all: not removed from Players. A plain audio file is no service, so
 * it always may.
 */
export function isPlayerShown(provider: PlayerProvider, hiddenPlayers: readonly string[] = []): boolean {
  return !hiddenPlayers.includes(provider);
}

/**
 * The choice that is no player: a song shows its card ("Card" in its switch, "Card (no player)" in
 * the Players list), and nothing loads from the services until one is picked.
 */
export const CARD_PLAYER = 'card';

/** A row of the Players list: a service, or Card (no player), which is never removed. */
export type PlayerListEntry = ListedPlayer | typeof CARD_PLAYER;

/** Whether an id is a row of the Players list this version shows (a service it lists, or Card). */
export function isPlayerListEntry(id: string): id is PlayerListEntry {
  return id === CARD_PLAYER || isListedPlayer(id);
}

/**
 * Whether a card shows itself instead of a service's player: Card (no player) is in the viewer's
 * Players order above that service (`provider`, the one it would play first). A service not in the
 * order comes after Card; a plain audio file is no service in the list, so it still plays. Without
 * Card in the order (never moved, or a client that does not know it), the player shows.
 */
export function isCardFirst(provider: PlayerProvider, playerOrder: readonly string[]): boolean {
  const card = playerOrder.indexOf(CARD_PLAYER);
  if (card === -1) return false;
  const service = playerOrder.indexOf(provider);
  return service === -1 ? isListedPlayer(provider) : card < service;
}

/**
 * Whether the viewer ranked the services: a service is in the order after Card, or without it. An
 * order that ends at Card only places Card (moved alone), so the services keep Auto.
 */
export function isRankedOrder(playerOrder: readonly string[]): boolean {
  return playerOrder.slice(playerOrder.indexOf(CARD_PLAYER) + 1).some(isListedPlayer);
}

/**
 * How the player sits in the card: a video keeps 16:9 at the card's width, audio its own strip
 * height; `dockHeight` is the service's own compact height, used in the dock (defaults to `height`).
 */
export type PlayerLayout = { kind: 'video' } | { kind: 'audio'; height: number; dockHeight?: number };

export interface PlayerTarget {
  provider: PlayerProvider;
  /** The service's name ("YouTube"), or the host for a plain audio file. */
  name: string;
  /** The resource's page on that service: what "Open in" opens and the favicon is read from. */
  link: string;
  /** What loads after the click, built from parsed parts only, never a supplied iframe URL as is. */
  src: string;
  element: 'iframe' | 'audio';
  layout: PlayerLayout;
  /** The frame's permissions: the app's video embed set, or what the service's own embed code asks for. */
  allow: string;
  /**
   * The player starts on the viewer's press on our Play: by a `src` parameter (YouTube, Vimeo,
   * SoundCloud) or by its `start` message. Else a press inside the player is needed (Mixcloud, whose
   * `autoplay=1` and widget API leave it paused; Deezer's widget, which takes no start command), and
   * the frame says so.
   */
  autoplay: boolean;
  /** How a player without an autoplay parameter is told to start, through its embed's own messages. */
  start?: PlayerStart;
}

/**
 * A message the player's own page understands as a press on its play button, sent to the frame
 * once: when the frame posts `readyType` (from `origin`), or once it has loaded without one. Only
 * ever after the viewer's press on our Play, which mounts the frame; never on scroll or load.
 */
export interface PlayerStart {
  /** The frame's origin: messages go only there, and only its messages are read. */
  origin: string;
  message: string | Readonly<Record<string, string>>;
  /** The `type` of the frame's message saying it is ready for commands. */
  readyType?: string;
}

/** `https:` only, no credentials or port, host from an exact list. */
function parseHttps(value: string, hosts: readonly string[]): URL | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return hosts.includes(url.hostname.toLowerCase()) ? url : null;
}

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
const YOUTUBE_LIST = /^[A-Za-z0-9_-]{10,64}$/;
/**
 * A channel by its id (`/channel/UC…`, also its videos or home tab); a `/@handle` or `/c/name` has
 * no id in the link. An auto-generated "<artist> - Topic" channel has an uploads list too.
 */
const YOUTUBE_CHANNEL = /^\/channel\/UC([A-Za-z0-9_-]{22})(?:\/(?:videos|featured))?\/?$/;

function youtube(value: string): PlayerTarget | null {
  const url = parseHttps(value, YOUTUBE_HOSTS);
  if (!url) return null;
  const base = { provider: PlayerProvider.YOUTUBE, name: PROVIDER_NAMES.youtube, element: 'iframe' as const };
  const common = { layout: { kind: 'video' } as const, allow: VIDEO_EMBED_PROPS.allow, autoplay: true };
  const list = url.searchParams.get('list');
  if (url.pathname === '/playlist' && list && YOUTUBE_LIST.test(list)) {
    return {
      ...base,
      ...common,
      link: `https://www.youtube.com/playlist?list=${list}`,
      src: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&enablejsapi=1&autoplay=1&rel=0`,
    };
  }
  // A channel (an artist's, from MusicBrainz) plays its uploads: YouTube's playlist `UU` + the id.
  const channel = YOUTUBE_CHANNEL.exec(url.pathname);
  if (channel) {
    return {
      ...base,
      ...common,
      link: `https://www.youtube.com/channel/UC${channel[1]}`,
      src: `https://www.youtube-nocookie.com/embed/videoseries?list=UU${channel[1]}&enablejsapi=1&autoplay=1&rel=0`,
    };
  }
  const id = extractYouTubeVideoId(url.href);
  if (!id) return null;
  return {
    ...base,
    ...common,
    link: `https://www.youtube.com/watch?v=${id}`,
    src: `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&autoplay=1&rel=0`,
  };
}

function vimeo(value: string): PlayerTarget | null {
  const url = parseHttps(value, ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
  const id = url ? extractVimeoVideoId(url.href) : null;
  if (!id || !/^\d{1,12}$/.test(id)) return null;
  return {
    provider: PlayerProvider.VIMEO,
    name: PROVIDER_NAMES.vimeo,
    link: `https://vimeo.com/${id}`,
    src: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`,
    element: 'iframe',
    layout: { kind: 'video' },
    allow: VIDEO_EMBED_PROPS.allow,
    autoplay: true,
  };
}

const SPOTIFY_PATH =
  /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|artist|playlist|show|episode)\/([A-Za-z0-9]{22})\/?$/i;

function spotify(value: string): PlayerTarget | null {
  const url = parseHttps(value, ['open.spotify.com']);
  const match = url ? SPOTIFY_PATH.exec(url.pathname) : null;
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const id = match[2];
  return {
    provider: PlayerProvider.SPOTIFY,
    name: PROVIDER_NAMES.spotify,
    link: `https://open.spotify.com/${kind}/${id}`,
    src: `https://open.spotify.com/embed/${kind}/${id}`,
    element: 'iframe',
    // Spotify's documented heights: compact for one track or episode, the list for the rest.
    // In the dock, Spotify's 80 px compact player.
    layout: { kind: 'audio', height: kind === 'track' || kind === 'episode' ? 152 : 352, dockHeight: 80 },
    allow: VIDEO_EMBED_PROPS.allow,
    autoplay: true,
    // Spotify's iFrame API command (`EmbedController.play()`), spoken to our own frame: no Spotify
    // script runs in the page. The embed posts `{ type: 'ready' }` when it can take it.
    start: { origin: 'https://open.spotify.com', message: { command: 'play' }, readyType: 'ready' },
  };
}

const SOUNDCLOUD_RESERVED = new Set([
  'discover',
  'search',
  'stream',
  'you',
  'upload',
  'charts',
  'pages',
  'stations',
  'mobile',
  // Top-level pages that are no profile (`soundcloud.com/<user>` plays the user's tracks).
  'settings',
  'notifications',
  'messages',
  'feed',
  'signin',
  'signup',
  'logout',
  'terms-of-use',
  'popular',
  'people',
  'pro',
  'jobs',
  'imprint',
  'premium',
  'artists',
  'creators',
]);
const SOUNDCLOUD_SUB = new Set([
  'tracks',
  'albums',
  'sets',
  'reposts',
  'likes',
  'followers',
  'following',
  'popular-tracks',
  'comments',
]);
const SOUNDCLOUD_PATH = /^\/([a-z0-9_-]{2,64})\/(?:(sets)\/)?([a-z0-9_-]{1,128})\/?$/i;
/** A profile (`soundcloud.com/<user>`): the widget plays its tracks as a list. */
const SOUNDCLOUD_PROFILE = /^\/([a-z0-9_-]{2,64})\/?$/i;

function soundcloud(value: string): PlayerTarget | null {
  const url = parseHttps(value, ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com']);
  const match = url ? (SOUNDCLOUD_PATH.exec(url.pathname) ?? SOUNDCLOUD_PROFILE.exec(url.pathname)) : null;
  if (!match) return null;
  const [, user, sets, slug] = match;
  if (SOUNDCLOUD_RESERVED.has(user.toLowerCase()) || (slug && !sets && SOUNDCLOUD_SUB.has(slug.toLowerCase()))) {
    return null;
  }
  const link = slug ? `https://soundcloud.com/${user}/${sets ? 'sets/' : ''}${slug}` : `https://soundcloud.com/${user}`;
  return {
    provider: PlayerProvider.SOUNDCLOUD,
    name: PROVIDER_NAMES.soundcloud,
    link,
    src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(link)}&auto_play=true&visual=false&show_teaser=false`,
    element: 'iframe',
    // A set or profile shows its list; the dock uses the one-track widget's height.
    layout: { kind: 'audio', height: sets || !slug ? 450 : 166, dockHeight: 166 },
    allow: VIDEO_EMBED_PROPS.allow,
    autoplay: true,
  };
}

const MIXCLOUD_RESERVED = new Set([
  'discover',
  'upload',
  'live',
  'select',
  'settings',
  'search',
  'categories',
  'widget',
]);
const MIXCLOUD_PATH = /^\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,160})\/?$/;

function mixcloud(value: string): PlayerTarget | null {
  const url = parseHttps(value, ['www.mixcloud.com', 'mixcloud.com', 'm.mixcloud.com']);
  const match = url ? MIXCLOUD_PATH.exec(url.pathname) : null;
  if (!match || MIXCLOUD_RESERVED.has(match[1].toLowerCase())) return null;
  const link = `https://www.mixcloud.com/${match[1]}/${match[2]}/`;
  return {
    provider: PlayerProvider.MIXCLOUD,
    name: PROVIDER_NAMES.mixcloud,
    link,
    src: `https://www.mixcloud.com/widget/iframe/?feed=${encodeURIComponent(link)}&hide_cover=1&autoplay=1`,
    element: 'iframe',
    layout: { kind: 'audio', height: 120 },
    allow: VIDEO_EMBED_PROPS.allow,
    // `autoplay=1` is asked for, but the widget stays paused until pressed inside.
    autoplay: false,
  };
}

/** A TIDAL page, also its share link (`/track/<id>/u`). */
const TIDAL_PATH = /^\/(?:browse\/)?(track|album|video|playlist)\/([0-9]{1,12}|[0-9a-f-]{36})(?:\/u)?\/?$/i;

function tidal(value: string): PlayerTarget | null {
  const url = parseHttps(value, ['tidal.com', 'www.tidal.com', 'listen.tidal.com']);
  const match = url ? TIDAL_PATH.exec(url.pathname) : null;
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const id = match[2].toLowerCase();
  return {
    provider: PlayerProvider.TIDAL,
    name: PROVIDER_NAMES.tidal,
    link: `https://tidal.com/browse/${kind}/${id}`,
    // `hideOverlays`: TIDAL's plain player (what its Slack embeds use): no ⋯ menu, and no Sign up / Log in
    // panel over it when a preview ends. Not for a video, which would lose its fullscreen button too.
    src: `https://embed.tidal.com/${kind}s/${id}${kind === 'video' ? '' : '?hideOverlays=true'}`,
    element: 'iframe',
    // TIDAL's oEmbed heights: 120 for a track, 275 for an album or playlist.
    layout:
      kind === 'video' ? { kind: 'video' } : { kind: 'audio', height: kind === 'track' ? 120 : 275, dockHeight: 120 },
    allow: 'autoplay; encrypted-media; fullscreen; clipboard-write; web-share',
    autoplay: true,
    // Asks TIDAL's embed to play with `{"commandName":"play"}`, what its own embed script sends. It
    // posts no ready message, so this goes once it has loaded.
    start: { origin: 'https://embed.tidal.com', message: JSON.stringify({ commandName: 'play' }) },
  };
}

const DEEZER_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist|artist)\/([0-9]{1,15})\/?$/i;

/**
 * Deezer's widget: a track, album or playlist, an artist as its top tracks. It has no start command
 * we can send, so the viewer presses play inside it (the frame says so).
 */
function deezer(value: string): PlayerTarget | null {
  const url = parseHttps(value, ['www.deezer.com', 'deezer.com']);
  const match = url ? DEEZER_PATH.exec(url.pathname) : null;
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const id = match[2];
  return {
    provider: PlayerProvider.DEEZER,
    name: PROVIDER_NAMES.deezer,
    link: `https://www.deezer.com/${kind}/${id}`,
    src: `https://widget.deezer.com/widget/dark/${kind}/${id}${kind === 'artist' ? '/top_tracks' : ''}`,
    element: 'iframe',
    // The widget's own sizes: one track compact, a list at its default height.
    layout: { kind: 'audio', height: kind === 'track' ? 150 : 300, dockHeight: 150 },
    allow: 'encrypted-media; clipboard-write',
    autoplay: false,
  };
}

/** What Apple's embed code asks for. */
const APPLE_ALLOW = 'autoplay *; encrypted-media *; fullscreen *; clipboard-write';
/** A storefront (`us`), then a song, album or playlist with or without its name (`/us/album/<name>/<id>`). */
const APPLE_MUSIC_PATH =
  /^\/(?:([a-z]{2})\/)?(song|album|playlist)\/(?:[^/]+\/)?([0-9]{1,15}|pl\.[A-Za-z0-9-]{1,64})\/?$/i;
const APPLE_ID = /^[0-9]{1,15}$/;

/**
 * Apple Music's embed: a song (also an album's song, `?i=<song>`), an album or a playlist. It has no
 * start command we can send, so the viewer presses play inside it.
 */
function appleMusic(value: string): PlayerTarget | null {
  const url = parseHttps(value, ['music.apple.com']);
  const match = url ? APPLE_MUSIC_PATH.exec(url.pathname) : null;
  if (!url || !match) return null;
  const storefront = (match[1] ?? 'us').toLowerCase();
  const song = url.searchParams.get('i');
  const isAlbumSong = match[2].toLowerCase() === 'album' && song !== null && APPLE_ID.test(song);
  const kind = isAlbumSong ? 'song' : match[2].toLowerCase();
  const id = isAlbumSong ? song : match[3];
  // A playlist's id is `pl.…`, a song's or album's a number.
  if ((kind === 'playlist') !== id.startsWith('pl.')) return null;
  return {
    provider: PlayerProvider.APPLE_MUSIC,
    name: PROVIDER_NAMES[PlayerProvider.APPLE_MUSIC],
    link: `https://music.apple.com/${storefront}/${kind}/${id}`,
    src: `https://embed.music.apple.com/${storefront}/${kind}/${id}`,
    element: 'iframe',
    // Apple's embed code: 175 px for one song, 450 px for a list.
    layout: { kind: 'audio', height: kind === 'song' ? 175 : 450, dockHeight: 175 },
    allow: APPLE_ALLOW,
    autoplay: false,
  };
}

const APPLE_PODCAST_PATH = /^\/(?:([a-z]{2})\/)?podcast\/(?:[^/]+\/)?id([0-9]{1,15})\/?$/i;

/** Apple Podcasts' embed: a show, or one of its episodes (`?i=<episode>`); played by a press inside it. */
function applePodcasts(value: string): PlayerTarget | null {
  const url = parseHttps(value, ['podcasts.apple.com']);
  const match = url ? APPLE_PODCAST_PATH.exec(url.pathname) : null;
  if (!url || !match) return null;
  const storefront = (match[1] ?? 'us').toLowerCase();
  const show = match[2];
  const episode = url.searchParams.get('i');
  const isEpisode = episode !== null && APPLE_ID.test(episode);
  return {
    provider: PlayerProvider.APPLE_PODCASTS,
    name: PROVIDER_NAMES[PlayerProvider.APPLE_PODCASTS],
    link: `https://podcasts.apple.com/${storefront}/podcast/id${show}${isEpisode ? `?i=${episode}` : ''}`,
    src: isEpisode
      ? `https://embed.podcasts.apple.com/${storefront}/episode/${episode}`
      : `https://embed.podcasts.apple.com/${storefront}/podcast/${show}`,
    element: 'iframe',
    layout: { kind: 'audio', height: isEpisode ? 175 : 450, dockHeight: 175 },
    allow: APPLE_ALLOW,
    autoplay: false,
  };
}

/** A plain audio file (a homeserver file, a podcast enclosure): the browser's own `<audio>` player. */
function audioFile(value: string): PlayerTarget | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (inferMediaKindFromUrl(url.href) !== 'audio') return null;
  return {
    provider: PlayerProvider.AUDIO_FILE,
    name: url.hostname.replace(/^www\./, ''),
    link: url.href,
    src: url.href,
    element: 'audio',
    layout: { kind: 'audio', height: 54 },
    allow: '',
    autoplay: true,
  };
}

const LINK_PARSERS = [
  youtube,
  vimeo,
  spotify,
  soundcloud,
  mixcloud,
  tidal,
  deezer,
  appleMusic,
  applePodcasts,
  audioFile,
];

/** The player for one link, when the link is on a service in the allowlist. */
export function getPlayerTarget(link: string): PlayerTarget | null {
  for (const parse of LINK_PARSERS) {
    const target = parse(link);
    if (target) return target;
  }
  return null;
}

/** A card's links its own player may be built from: its canonical `uri` and its other spellings. */
type TOwnLinks = Pick<TPinakesCard, 'uri'> & Partial<Pick<TPinakesResourceDetail, 'aliases'>>;

/**
 * The card's own link a player is built from: the link as written (`href`) when a player takes it,
 * else the card's canonical `uri`, else one of its `aliases`; else the link as written.
 */
function getOwnLink(card: TOwnLinks, href?: string | null): string {
  const links = [...(href ? [href] : []), card.uri, ...(card.aliases ?? [])];
  return links.find((link) => getPlayerTarget(link)) ?? href ?? card.uri;
}

/**
 * Whether a card's own link is on a service with a player (`getOwnPlayer`): a Spotify track or
 * artist page, a YouTube video or channel, a SoundCloud track. A generic link (a MusicBrainz
 * recording, a Wikipedia article, an artist's Discogs page) is not, even when Pinakes knows it on
 * such a service (Also on). `useCardPlayer` shows that player first unless the viewer removed its
 * service in Players.
 */
export function isPlayable(card: TOwnLinks, href?: string | null): boolean {
  return getOwnPlayer(card, href) !== null;
}

/** The player of a card's own link (`getOwnLink`), or `null` when its link is on no service with a player. */
export function getOwnPlayer(card: TOwnLinks, href?: string | null): PlayerTarget | null {
  return getPlayerTarget(getOwnLink(card, href));
}

/** The `src` parameters that start a player on load. */
const AUTOPLAY_PARAMS = ['autoplay', 'auto_play'] as const;

/**
 * A player shown up front, not after a press on Play: the same player without what starts it on
 * load (its autoplay parameter and start message), so it plays only when pressed inside. A plain
 * audio file keeps the browser's player, which then does not start on its own (`autoplay: false`).
 */
export function getUpFrontTarget(target: PlayerTarget): PlayerTarget {
  if (target.element !== 'iframe') return { ...target, autoplay: false };
  const src = new URL(target.src);
  for (const param of AUTOPLAY_PARAMS) src.searchParams.delete(param);
  return { ...target, src: src.href, autoplay: false, start: undefined };
}

/**
 * Every player the card offers, one per service: the card's own link first (`getOwnLink`), then
 * its `also_on` links in Pinakes' order (its best link of a service first). A `missing` card's own
 * link is gone upstream and offers no player. A player shows paused and starts on a press inside
 * it, so no service is put first for starting on our press.
 *
 * The viewer's Players (`players`, Settings, Links & Media) come last: a removed service offers no
 * player, and the services in the viewer's order go first, in that order,
 * before those not in it (Auto order). With no ranked order (never reordered, or only Card moved:
 * `isRankedOrder`) it all stays Auto.
 */
export function getPlayerTargets(
  card: Pick<TPinakesCard, 'status' | 'also_on'> & TOwnLinks,
  { href, players }: { href?: string | null; players?: PlayerPreferences } = {},
): PlayerTarget[] {
  const own = card.status === 'missing' ? null : getOwnLink(card, href);
  const links = [...(own ? [own] : []), ...card.also_on.map((entry) => entry.uri)];

  const seen = new Set<PlayerProvider>();
  const targets: PlayerTarget[] = [];
  for (const link of links) {
    const target = getPlayerTarget(link);
    if (!target || seen.has(target.provider)) continue;
    seen.add(target.provider);
    targets.push(target);
  }
  const shown = targets.filter((target) => isPlayerShown(target.provider, players?.hiddenPlayers));
  const order = players && isRankedOrder(players.playerOrder) ? players.playerOrder : [];
  const rank = (target: PlayerTarget) => {
    const index = order.indexOf(target.provider);
    return index === -1 ? order.length : index;
  };
  // A stable sort: those not in the order keep the Auto order among themselves.
  return [...shown].sort((a, b) => rank(a) - rank(b));
}
