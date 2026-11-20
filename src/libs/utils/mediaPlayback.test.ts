import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getFramePlayer,
  listenToFrame,
  pauseFrame,
  pauseMedia,
  readFrameMessage,
  tellsWhenPlaying,
} from './mediaPlayback';

function frame(src: string) {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  document.body.appendChild(iframe);
  const post = vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation(() => {});
  return { iframe, post };
}

describe('mediaPlayback', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('knows the players it can pause and hear from by their embed address', () => {
    expect(getFramePlayer('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1')).toEqual({
      player: 'youtube',
      origin: 'https://www.youtube-nocookie.com',
    });
    expect(getFramePlayer('https://www.youtube.com/embed/dQw4w9WgXcQ')?.player).toBe('youtube');
    expect(getFramePlayer('https://player.vimeo.com/video/1')?.player).toBe('vimeo');
    expect(getFramePlayer('https://w.soundcloud.com/player/?url=x')?.player).toBe('soundcloud');
    expect(getFramePlayer('https://open.spotify.com/embed/track/1')?.player).toBe('spotify');
    expect(getFramePlayer('https://widget.deezer.com/widget/dark/track/1')).toBeNull();
    expect(getFramePlayer('https://notyoutube.com/embed/1')).toBeNull();
    expect(getFramePlayer('not a url')).toBeNull();
  });

  it('says which players tell when they play: not Spotify, whose word is not relied on alone', () => {
    expect(tellsWhenPlaying('https://www.youtube-nocookie.com/embed/x')).toBe(true);
    expect(tellsWhenPlaying('https://player.vimeo.com/video/1')).toBe(true);
    expect(tellsWhenPlaying('https://w.soundcloud.com/player/?url=x')).toBe(true);
    expect(tellsWhenPlaying('https://open.spotify.com/embed/track/1')).toBe(false);
    expect(tellsWhenPlaying('https://widget.deezer.com/widget/dark/track/1')).toBe(false);
  });

  it('pauses each player with its own command, sent only to its origin', () => {
    const cases = [
      ['https://www.youtube-nocookie.com/embed/x', JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' })],
      ['https://player.vimeo.com/video/1', { method: 'pause' }],
      ['https://w.soundcloud.com/player/?url=x', JSON.stringify({ method: 'pause' })],
      ['https://open.spotify.com/embed/track/1', { command: 'pause' }],
    ] as const;
    for (const [src, message] of cases) {
      const { iframe, post } = frame(src);
      pauseFrame(iframe);
      expect(post).toHaveBeenCalledWith(message, new URL(src).origin);
    }
    const deezer = frame('https://widget.deezer.com/widget/dark/track/1');
    pauseFrame(deezer.iframe);
    expect(deezer.post).not.toHaveBeenCalled();
  });

  it('pauses the media in a box but what it keeps', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const [audio, kept] = ['audio', 'video'].map((tag) => {
      const media = document.createElement(tag) as HTMLMediaElement;
      document.body.appendChild(media);
      return media;
    });
    const youtube = frame('https://www.youtube-nocookie.com/embed/x');
    const keptFrame = frame('https://player.vimeo.com/video/1');

    pauseMedia(document, (element) => element === kept || element === keptFrame.iframe);

    expect(pause.mock.contexts).toEqual([audio]);
    expect(youtube.post).toHaveBeenCalledTimes(1);
    expect(keptFrame.post).not.toHaveBeenCalled();
  });

  it('asks YouTube, Vimeo and SoundCloud to say when they play; Spotify always does', () => {
    const youtube = frame('https://www.youtube-nocookie.com/embed/x');
    listenToFrame(youtube.iframe);
    expect(youtube.post).toHaveBeenCalledWith(
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
      'https://www.youtube-nocookie.com',
    );

    const vimeo = frame('https://player.vimeo.com/video/1');
    listenToFrame(vimeo.iframe);
    expect(vimeo.post).toHaveBeenCalledWith({ method: 'addEventListener', value: 'play' }, 'https://player.vimeo.com');

    const soundcloud = frame('https://w.soundcloud.com/player/?url=x');
    listenToFrame(soundcloud.iframe);
    expect(soundcloud.post).toHaveBeenCalledWith(
      JSON.stringify({ method: 'addEventListener', value: 'play' }),
      'https://w.soundcloud.com',
    );

    const spotify = frame('https://open.spotify.com/embed/track/1');
    listenToFrame(spotify.iframe);
    expect(spotify.post).not.toHaveBeenCalled();
  });

  it('reads whether a player plays from its own messages', () => {
    const youtube = (info: unknown, event = 'infoDelivery') => JSON.stringify({ event, info });
    expect(readFrameMessage('youtube', youtube({ playerState: 1 }))).toBe('play');
    expect(readFrameMessage('youtube', youtube({ playerState: 3 }))).toBe('progress');
    expect(readFrameMessage('youtube', youtube({ playerState: 2 }))).toBe('pause');
    expect(readFrameMessage('youtube', youtube({ playerState: -1 }))).toBe('stop');
    expect(readFrameMessage('youtube', youtube({ playerState: 0 }))).toBe('stop');
    expect(readFrameMessage('youtube', youtube(1, 'onStateChange'))).toBe('play');
    expect(readFrameMessage('youtube', youtube({ currentTime: 3 }))).toBeNull();

    expect(readFrameMessage('vimeo', { event: 'play' })).toBe('play');
    expect(readFrameMessage('vimeo', JSON.stringify({ event: 'pause' }))).toBe('pause');
    expect(readFrameMessage('vimeo', { event: 'ended' })).toBe('stop');
    expect(readFrameMessage('vimeo', { event: 'ready' })).toBe('ready');

    expect(readFrameMessage('soundcloud', JSON.stringify({ method: 'play' }))).toBe('play');
    expect(readFrameMessage('soundcloud', JSON.stringify({ method: 'playProgress' }))).toBe('progress');
    expect(readFrameMessage('soundcloud', JSON.stringify({ method: 'pause' }))).toBe('pause');
    expect(readFrameMessage('soundcloud', JSON.stringify({ method: 'finish' }))).toBe('stop');
    expect(readFrameMessage('soundcloud', JSON.stringify({ method: 'ready' }))).toBe('ready');

    expect(readFrameMessage('spotify', { type: 'playback_update', payload: { isPaused: false } })).toBe('play');
    expect(readFrameMessage('spotify', { type: 'playback_update', payload: { isPaused: true } })).toBe('pause');
    expect(readFrameMessage('spotify', { type: 'ready' })).toBeNull();

    expect(readFrameMessage('youtube', 'not json')).toBeNull();
    expect(readFrameMessage('vimeo', null)).toBeNull();
  });
});
