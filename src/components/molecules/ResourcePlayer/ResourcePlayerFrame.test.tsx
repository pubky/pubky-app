import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPlayerTarget } from './resourcePlayer.utils';
import { ResourcePlayerFrame } from './ResourcePlayerFrame';
import { useResourcePlayer } from './useResourcePlayer';

const SPOTIFY = getPlayerTarget('https://open.spotify.com/track/1YQWosTIljIvxAgHWTp7KP')!;
const YOUTUBE = getPlayerTarget('https://www.youtube.com/watch?v=dQw4w9WgXcQ')!;
const TIDAL = getPlayerTarget('https://tidal.com/browse/track/77646168')!;
const MIXCLOUD = getPlayerTarget('https://www.mixcloud.com/spartacus/party-time/')!;
const DEEZER = getPlayerTarget('https://www.deezer.com/track/3135556')!;

/** The frame's window, with its `postMessage` watched. */
function watchFrame() {
  const frame = screen.getByTestId('resource-player-frame') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
  return { frame, post };
}

function postFromFrame(frame: HTMLIFrameElement, data: unknown, origin = 'https://open.spotify.com') {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: frame.contentWindow }));
  });
}

function Player({ target }: { target: typeof SPOTIFY }) {
  const player = useResourcePlayer('frame-test', [target]);
  if (!player.current) {
    return (
      <button type="button" onClick={() => player.play(target)}>
        play
      </button>
    );
  }
  return (
    <ResourcePlayerFrame target={player.current} title="Get Lucky" load={player.load} onLoaded={player.onLoaded} />
  );
}

describe('ResourcePlayerFrame', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays a plain audio file in the app Audio player, drawn in the app theme', () => {
    const file = getPlayerTarget('https://example.com/episode.mp3')!;
    render(<ResourcePlayerFrame target={file} title="Episode 1" load="loading" onLoaded={() => {}} />);

    const audio = screen.getByTestId('resource-player-audio') as HTMLAudioElement;
    expect(audio.tagName).toBe('AUDIO');
    expect(audio).toHaveAttribute('src', 'https://example.com/episode.mp3');
    expect(audio).toHaveAttribute('aria-label', 'example.com player: Episode 1');
    expect(audio).toHaveAttribute('preload', 'metadata');
    expect(audio.controls).toBe(true);
    expect(audio.autoplay).toBe(true);
    expect(audio).toHaveClass('scheme-dark', 'light:scheme-light', 'absolute', 'inset-0', 'size-full');
    expect(screen.getByRole('region', { name: 'example.com player: Episode 1' })).not.toHaveClass('bg-card');
    // Until its metadata has loaded, a placeholder covers it; only the status line names the service.
    expect(screen.getByTestId('resource-player-placeholder')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('resource-player-placeholder').textContent).toBe('');
  });

  it('shows no loading text, and tells only screen readers it is loading', () => {
    render(<ResourcePlayerFrame target={SPOTIFY} title="Get Lucky" load="loading" onLoaded={() => {}} />);

    expect(screen.getByTestId('resource-player-placeholder').textContent).toBe('');
    const status = screen.getByTestId('resource-player-status');
    expect(status).toHaveTextContent('Loading the Spotify player');
    expect(status).toHaveClass('sr-only');
  });

  it('loads the service’s own player, sandboxed, with what its embed code allows', () => {
    render(<ResourcePlayerFrame target={SPOTIFY} title="Get Lucky" load="loading" onLoaded={() => {}} />);

    const frame = screen.getByTestId('resource-player-frame');
    expect(frame).toHaveAttribute('src', SPOTIFY.src);
    expect(frame).toHaveAttribute('title', 'Spotify player: Get Lucky');
    expect(frame).toHaveAttribute('allow', SPOTIFY.allow);
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    const sandbox = frame.getAttribute('sandbox')!.split(' ');
    expect(sandbox).toEqual(expect.arrayContaining(['allow-scripts', 'allow-same-origin', 'allow-popups']));
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).not.toContain('allow-forms');
    expect(screen.getByRole('region', { name: 'Spotify player: Get Lucky' })).toHaveAttribute('aria-busy', 'true');
  });

  it.each([
    ['Mixcloud', MIXCLOUD],
    ['Deezer', DEEZER],
  ])('tells only screen readers that a press inside the %s player is needed', (name, target) => {
    render(<ResourcePlayerFrame target={target} title="Party Time" load="ready" onLoaded={() => {}} />);

    const status = screen.getByTestId('resource-player-status');
    expect(status).toHaveTextContent(`Press play in the ${name} player to start.`);
    expect(status).toHaveClass('sr-only');
  });

  it('tells Spotify to play once its embed is ready, only from Spotify’s own frame, and says nothing more', () => {
    render(<ResourcePlayerFrame target={SPOTIFY} title="Get Lucky" load="ready" onLoaded={() => {}} />);
    const { frame, post } = watchFrame();

    postFromFrame(frame, { type: 'ready' }, 'https://evil.example');
    postFromFrame(frame, { type: 'playback_update' });
    expect(post).not.toHaveBeenCalled();

    postFromFrame(frame, { type: 'ready' });
    postFromFrame(frame, { type: 'ready' });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ command: 'play' }, 'https://open.spotify.com');
    expect(screen.getByTestId('resource-player-status')).toBeEmptyDOMElement();
  });

  it('ignores a ready message from another window', () => {
    render(<ResourcePlayerFrame target={SPOTIFY} title="Get Lucky" load="ready" onLoaded={() => {}} />);
    const { post } = watchFrame();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'ready' }, origin: 'https://open.spotify.com', source: window }),
      );
    });

    expect(post).not.toHaveBeenCalled();
  });

  it('tells TIDAL to play once its frame has loaded, once', () => {
    const onLoaded = vi.fn();
    render(<ResourcePlayerFrame target={TIDAL} title="Internal Calm" load="loading" onLoaded={onLoaded} />);
    const { frame, post } = watchFrame();

    expect(frame).toHaveAttribute('allow', expect.stringContaining('autoplay'));
    act(() => frame.dispatchEvent(new Event('load')));
    act(() => frame.dispatchEvent(new Event('load')));

    expect(onLoaded).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('{"commandName":"play"}', 'https://embed.tidal.com');
  });

  it('tells a player to play once per frame, also across a re-render with an equal target', () => {
    const { rerender } = render(
      <ResourcePlayerFrame target={SPOTIFY} title="Get Lucky" load="ready" onLoaded={() => {}} />,
    );
    const { frame, post } = watchFrame();

    postFromFrame(frame, { type: 'ready' });
    rerender(
      <ResourcePlayerFrame
        target={{ ...SPOTIFY, start: { ...SPOTIFY.start! } }}
        title="Get Lucky"
        load="ready"
        onLoaded={() => {}}
      />,
    );
    postFromFrame(frame, { type: 'ready' });

    expect(post).toHaveBeenCalledTimes(1);
  });

  it('tells a frame that loads another player address to play again, once', () => {
    const { rerender } = render(
      <ResourcePlayerFrame target={SPOTIFY} title="Get Lucky" load="ready" onLoaded={() => {}} />,
    );
    const { frame, post } = watchFrame();

    postFromFrame(frame, { type: 'ready' });
    rerender(
      <ResourcePlayerFrame
        target={{ ...SPOTIFY, src: `${SPOTIFY.src}?x` }}
        title="Get Lucky"
        load="ready"
        onLoaded={() => {}}
      />,
    );
    // The new address is a new document: the frame may have a new window (jsdom gives it one).
    const next = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
    postFromFrame(frame, { type: 'ready' });
    postFromFrame(frame, { type: 'ready' });

    expect(post.mock.calls.length + (next === post ? 0 : next.mock.calls.length)).toBe(2);
  });

  it('tells TIDAL to play once, also when an equal target re-renders and the frame loads again', () => {
    const { rerender } = render(
      <ResourcePlayerFrame target={TIDAL} title="Internal Calm" load="loading" onLoaded={() => {}} />,
    );
    const { frame, post } = watchFrame();

    act(() => frame.dispatchEvent(new Event('load')));
    rerender(
      <ResourcePlayerFrame
        target={{ ...TIDAL, start: { ...TIDAL.start! } }}
        title="Internal Calm"
        load="ready"
        onLoaded={() => {}}
      />,
    );
    act(() => frame.dispatchEvent(new Event('load')));

    expect(post).toHaveBeenCalledTimes(1);
  });

  it('sends no message to a player that starts by its own address', () => {
    render(<ResourcePlayerFrame target={YOUTUBE} title="Video" load="loading" onLoaded={() => {}} />);
    const { frame, post } = watchFrame();

    act(() => frame.dispatchEvent(new Event('load')));
    postFromFrame(frame, { type: 'ready' }, 'https://www.youtube-nocookie.com');

    expect(post).not.toHaveBeenCalled();
  });

  it('says nothing more once a player that starts on load has loaded', () => {
    render(<ResourcePlayerFrame target={YOUTUBE} title="Video" load="ready" onLoaded={() => {}} />);

    expect(screen.getByTestId('resource-player-status')).toBeEmptyDOMElement();
  });

  it('offers the service’s page when the frame has not loaded after a while', () => {
    vi.useFakeTimers();
    render(<Player target={SPOTIFY} />);

    act(() => screen.getByRole('button', { name: 'play' }).click());
    act(() => vi.advanceTimersByTime(12_000));

    expect(screen.getByTestId('resource-player-status')).toHaveTextContent('Spotify has not answered.');
    expect(screen.getByTestId('resource-player-status')).not.toHaveClass('sr-only');
    expect(screen.getByRole('link', { name: 'Open in Spotify' })).toHaveAttribute('href', SPOTIFY.link);
  });
});
