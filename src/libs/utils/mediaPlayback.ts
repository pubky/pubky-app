/**
 * The players embedded from other services that the page can pause and hear from, through their own
 * players' messages, each sent only to the frame's own origin: YouTube, Vimeo, SoundCloud and Spotify.
 * Shared by the off-screen pause (`usePauseMediaOutsideViewport`) and the page's one player
 * (`useOnePlayer`).
 */
export type FramePlayer = 'youtube' | 'vimeo' | 'soundcloud' | 'spotify';

const isHost = (hostname: string, domain: string) => hostname === domain || hostname.endsWith(`.${domain}`);

/** The player at an embed address and its origin, or `null` for any other address. */
export function getFramePlayer(src: string): { player: FramePlayer; origin: string } | null {
  try {
    const { hostname, origin } = new URL(src);
    if (isHost(hostname, 'youtube.com') || isHost(hostname, 'youtube-nocookie.com')) {
      return { player: 'youtube', origin };
    }
    if (hostname === 'player.vimeo.com') return { player: 'vimeo', origin };
    if (hostname === 'w.soundcloud.com') return { player: 'soundcloud', origin };
    if (hostname === 'open.spotify.com') return { player: 'spotify', origin };
  } catch {
    // A malformed iframe source cannot be controlled. Leave it untouched.
  }
  return null;
}

/**
 * Whether the player at `src` says when it plays (`readFrameMessage`): YouTube, Vimeo and SoundCloud.
 * Spotify's `playback_update` is read too, but a press inside its frame is its start as well, and it
 * is loaded anew to stop.
 */
export function tellsWhenPlaying(src: string): boolean {
  const player = getFramePlayer(src)?.player;
  return player !== undefined && player !== 'spotify';
}

/** Each player's own pause command (YouTube's and SoundCloud's widgets read JSON text). */
const PAUSE: Record<FramePlayer, unknown> = {
  youtube: JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
  vimeo: { method: 'pause' },
  soundcloud: JSON.stringify({ method: 'pause' }),
  spotify: { command: 'pause' },
};

/** Pauses the player in `iframe` through its own API; any other frame is left as it is. */
export function pauseFrame(iframe: HTMLIFrameElement): void {
  const frame = getFramePlayer(iframe.src);
  if (frame) iframe.contentWindow?.postMessage(PAUSE[frame.player], frame.origin);
}

/**
 * Pauses the media in `root`, the browser's own (`<audio>`, `<video>`) and the players `pauseFrame`
 * reaches, except what `keep` holds on to.
 */
export function pauseMedia(root: ParentNode, keep: (element: Element) => boolean = () => false): void {
  root.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
    if (!keep(media)) media.pause();
  });
  root.querySelectorAll<HTMLIFrameElement>('iframe').forEach((iframe) => {
    if (!keep(iframe)) pauseFrame(iframe);
  });
}

/**
 * Asks the player in `iframe` to tell the page when it plays or pauses: YouTube, Vimeo and SoundCloud
 * only do once asked (on each new frame document); Spotify always does.
 */
export function listenToFrame(iframe: HTMLIFrameElement): void {
  const frame = getFramePlayer(iframe.src);
  const target = iframe.contentWindow;
  if (!frame || !target) return;
  const post = (message: unknown) => target.postMessage(message, frame.origin);
  if (frame.player === 'youtube') post(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }));
  if (frame.player === 'vimeo')
    ['play', 'pause', 'ended'].forEach((value) => post({ method: 'addEventListener', value }));
  if (frame.player === 'soundcloud') {
    // `playProgress` too: a widget that started on its own address said `play` before it was asked.
    ['play', 'playProgress', 'pause', 'finish'].forEach((value) =>
      post(JSON.stringify({ method: 'addEventListener', value })),
    );
  }
}

const readData = (data: unknown): Record<string, unknown> | null => {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
};

/**
 * What a player's message says: it started playing (`play`); it is on its way or going on
 * (`progress`: YouTube's buffering, which follows a press until the sound comes, also while a paused
 * video is sought; SoundCloud's progress, the only word of a widget that started by its address);
 * it was paused (`pause`); it has not started or has ended (`stop`); it is `ready` to be asked again
 * (`listenToFrame`); or `null` for anything else.
 */
export type FrameMessage = 'play' | 'progress' | 'pause' | 'stop' | 'ready';

/** YouTube's player states: 1 playing, 3 buffering, 2 paused; -1 unstarted, 0 ended, 5 cued. */
const YOUTUBE_STATES: Record<number, FrameMessage> = { 1: 'play', 3: 'progress', 2: 'pause' };

/** What `player`'s `message` says (`FrameMessage`). */
export function readFrameMessage(player: FramePlayer, message: unknown): FrameMessage | null {
  const data = readData(message);
  if (!data) return null;
  switch (player) {
    case 'youtube': {
      const state = data.event === 'onStateChange' ? data.info : readData(data.info)?.playerState;
      if (typeof state !== 'number') return null;
      return YOUTUBE_STATES[state] ?? 'stop';
    }
    case 'vimeo':
      if (data.event === 'ready') return 'ready';
      if (data.event === 'play') return 'play';
      if (data.event === 'pause') return 'pause';
      return data.event === 'ended' ? 'stop' : null;
    case 'soundcloud':
      if (data.method === 'ready') return 'ready';
      if (data.method === 'play') return 'play';
      if (data.method === 'playProgress') return 'progress';
      if (data.method === 'pause') return 'pause';
      return data.method === 'finish' ? 'stop' : null;
    case 'spotify': {
      if (data.type !== 'playback_update') return null;
      const isPaused = readData(data.payload)?.isPaused;
      if (typeof isPaused !== 'boolean') return null;
      return isPaused ? 'pause' : 'play';
    }
  }
}
