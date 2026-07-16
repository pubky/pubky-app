import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePauseMediaOutsideViewport } from './usePauseMediaOutsideViewport';

let intersectionCallback: ((entries: IntersectionObserverEntry[]) => void) | null = null;

class MockIntersectionObserver {
  constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
    intersectionCallback = callback;
  }

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = '0px';
  thresholds = [0];
}

const MediaEmbed = () => {
  const ref = usePauseMediaOutsideViewport();

  return (
    <div ref={ref}>
      <audio />
      <video />
      <iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="YouTube" />
      <iframe src="https://player.vimeo.com/video/123456789" title="Vimeo" />
    </div>
  );
};

const markNativeMediaAsPlaying = (container: HTMLElement) => {
  container.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
    Object.defineProperty(media, 'paused', { configurable: true, value: false });
  });
};

describe('usePauseMediaOutsideViewport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    intersectionCallback = null;
  });

  it('renders without viewport handling when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    expect(() => render(<MediaEmbed />)).not.toThrow();
  });

  it('pauses existing media without observing late mounts when MutationObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal('MutationObserver', undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { container } = render(<MediaEmbed />);
    markNativeMediaAsPlaying(container);

    expect(() => intersectionCallback?.([{ isIntersecting: false } as IntersectionObserverEntry])).not.toThrow();
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('pauses native and supported iframe media when outside the viewport', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { container } = render(<MediaEmbed />);
    markNativeMediaAsPlaying(container);
    const [youtube, vimeo] = Array.from(container.querySelectorAll('iframe'));
    const youtubePostMessage = vi.spyOn(youtube.contentWindow!, 'postMessage');
    const vimeoPostMessage = vi.spyOn(vimeo.contentWindow!, 'postMessage');

    intersectionCallback?.([{ isIntersecting: false } as IntersectionObserverEntry]);

    expect(pause).toHaveBeenCalledTimes(2);
    expect(youtubePostMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
      'https://www.youtube-nocookie.com',
    );
    expect(vimeoPostMessage).toHaveBeenCalledWith({ method: 'pause' }, 'https://player.vimeo.com');
  });

  it('leaves media playing while the embed remains in the viewport', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<MediaEmbed />);

    intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);

    expect(pause).not.toHaveBeenCalled();
  });

  it('pauses native media mounted asynchronously while outside the viewport', async () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { container } = render(<MediaEmbed />);
    intersectionCallback?.([{ isIntersecting: false } as IntersectionObserverEntry]);
    pause.mockClear();

    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    container.firstElementChild!.appendChild(video);

    await waitFor(() => expect(pause.mock.instances).toContain(video));
  });

  it('does not pause media mounted after returning to the viewport', async () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { container } = render(<MediaEmbed />);

    intersectionCallback?.([{ isIntersecting: false } as IntersectionObserverEntry]);
    intersectionCallback?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    pause.mockClear();

    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    container.firstElementChild!.appendChild(video);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pause.mock.instances).not.toContain(video);
  });
});
