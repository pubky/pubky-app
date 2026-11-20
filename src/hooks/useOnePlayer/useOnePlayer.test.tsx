import { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type MediaBox, onMediaStop, useMediaBox, useOnePlayer } from './useOnePlayer';

/** A player's box with one frame from `src`, telling `onStart` when its media starts. */
function Box({ src, ...box }: { src: string } & MediaBox) {
  const ref = useRef<HTMLDivElement>(null);
  useMediaBox(ref, box);
  return (
    <div ref={ref}>
      <iframe src={src} title={src} />
    </div>
  );
}

function say(frame: HTMLIFrameElement, data: unknown, origin = new URL(frame.src).origin) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: frame.contentWindow }));
  });
}

describe('useMediaBox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['Vimeo', 'https://player.vimeo.com/video/1', { event: 'play' }],
    ['SoundCloud', 'https://w.soundcloud.com/player/?url=x', JSON.stringify({ method: 'play' })],
    ['Spotify', 'https://open.spotify.com/embed/track/1', { type: 'playback_update', payload: { isPaused: false } }],
  ])('starts the box when the %s player says it plays, once', (_name, src, playing) => {
    const onStart = vi.fn();
    render(<Box src={src} onStart={onStart} />);
    const frame = screen.getByTitle(src) as HTMLIFrameElement;

    say(frame, playing, 'https://evil.example');
    expect(onStart).not.toHaveBeenCalled();
    say(frame, playing);
    say(frame, playing);
    expect(onStart.mock.calls).toEqual([[frame]]);
  });

  it('asks a Vimeo player again to say when it plays once it is ready', () => {
    render(<Box src="https://player.vimeo.com/video/1" onStart={() => {}} />);
    const frame = screen.getByTitle('https://player.vimeo.com/video/1') as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});

    say(frame, { event: 'ready' });
    expect(post).toHaveBeenCalledWith({ method: 'addEventListener', value: 'play' }, 'https://player.vimeo.com');
  });

  it('stops the other boxes and tells the page’s player when other media starts', () => {
    const onStop = vi.fn();
    const stopped = vi.fn();
    const unsubscribe = onMediaStop(stopped);
    render(
      <>
        <Box src="https://widget.deezer.com/widget/dark/track/1" onStop={onStop} />
        <video data-testid="post-video" />
      </>,
    );

    fireEvent.play(screen.getByTestId('post-video'));
    unsubscribe();
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('stops listening to the page once the last watch is gone', () => {
    function Watch() {
      useOnePlayer();
      return null;
    }
    const removeFromWindow = vi.spyOn(window, 'removeEventListener');
    const removeFromDocument = vi.spyOn(document, 'removeEventListener');
    const first = render(<Watch />);
    const second = render(<Watch />);

    first.unmount();
    expect(removeFromWindow).not.toHaveBeenCalledWith('message', expect.any(Function));
    second.unmount();
    expect(removeFromWindow).toHaveBeenCalledWith('message', expect.any(Function));
    expect(removeFromDocument).toHaveBeenCalledWith('play', expect.any(Function), true);
    expect(removeFromDocument).toHaveBeenCalledWith('pause', expect.any(Function), true);
    expect(removeFromDocument).toHaveBeenCalledWith('load', expect.any(Function), true);
  });

  it.each([
    ['Spotify', 'https://open.spotify.com/embed/track/1', { type: 'playback_update', payload: { isPaused: true } }],
    ['SoundCloud', 'https://w.soundcloud.com/player/?url=x', JSON.stringify({ method: 'finish' })],
    ['YouTube', 'https://www.youtube.com/embed/x', JSON.stringify({ event: 'infoDelivery', info: { playerState: 2 } })],
  ])('tells the box when the %s player says it paused or ended', (_name, src, paused) => {
    const onPause = vi.fn();
    render(<Box src={src} onPause={onPause} />);
    const frame = screen.getByTitle(src) as HTMLIFrameElement;

    say(frame, paused, 'https://evil.example');
    expect(onPause).not.toHaveBeenCalled();
    say(frame, paused);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('tells the box when its own audio pauses (also at its end), and no other box', () => {
    const onPause = vi.fn();
    const otherPause = vi.fn();
    function AudioBox() {
      const ref = useRef<HTMLDivElement>(null);
      useMediaBox(ref, { onPause });
      return (
        <div ref={ref}>
          <audio data-testid="episode" />
        </div>
      );
    }
    render(
      <>
        <AudioBox />
        <Box src="https://open.spotify.com/embed/track/1" onPause={otherPause} />
      </>,
    );

    fireEvent.pause(screen.getByTestId('episode'));
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(otherPause).not.toHaveBeenCalled();
  });
});
