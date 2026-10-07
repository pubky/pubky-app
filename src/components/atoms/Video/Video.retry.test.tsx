import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { Video } from './Video';

let intersect: ((visible: boolean) => void) | undefined;

const failVideo = (video: HTMLVideoElement, code = 4, readyState = 0) => {
  Object.defineProperties(video, {
    error: { configurable: true, value: { code, message: 'Media load failed' } },
    readyState: { configurable: true, value: readyState },
  });
  fireEvent.error(video);
};

const setVisible = (visible: boolean) => act(() => intersect?.(visible));
const advance = (milliseconds: number) => act(() => vi.advanceTimersByTime(milliseconds));

describe('Video - initial load recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    intersect = undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe(target: Element) {
          intersect = (isIntersecting) =>
            this.callback(
              [asOpaque<IntersectionObserverEntry>({ target, isIntersecting })],
              asOpaque<IntersectionObserver>(this),
            );
        }
        disconnect() {}
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'error', { configurable: true, value: null });
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([2, 4])('reloads a visible player after an initial media error %i', (code) => {
    const onError = vi.fn();
    render(<Video src="/video.mp4" onError={onError} />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    // Chromium reports an HTTP 429 as MEDIA_ERR_SRC_NOT_SUPPORTED (4).
    failVideo(video, code);
    setVisible(true);
    advance(999);
    expect(video.load).not.toHaveBeenCalled();
    advance(1);
    expect(video.load).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    advance(10_000);
    expect(video.load).toHaveBeenCalledOnce();
  });

  it('bounds retries with backoff and forwards the final error to the caller', () => {
    const onError = vi.fn();
    render(<Video src="/video.mp4" onError={onError} />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    failVideo(video);
    setVisible(true);
    advance(1_000);
    failVideo(video);
    setVisible(true);
    advance(1_999);
    expect(video.load).toHaveBeenCalledOnce();
    advance(1);
    expect(video.load).toHaveBeenCalledTimes(2);
    failVideo(video);
    expect(onError).toHaveBeenCalledOnce();
    advance(10_000);
    expect(video.load).toHaveBeenCalledTimes(2);
  });

  it('waits for visibility and cancels a pending retry when the video leaves view', () => {
    render(<Video src="/video.mp4" />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    failVideo(video);
    setVisible(false);
    advance(10_000);
    expect(video.load).not.toHaveBeenCalled();
    setVisible(true);
    advance(500);
    setVisible(false);
    advance(10_000);
    expect(video.load).not.toHaveBeenCalled();
    setVisible(true);
    advance(1_000);
    expect(video.load).toHaveBeenCalledOnce();
  });

  it('cancels an old source retry and gives a new source its own retry budget', () => {
    const { rerender } = render(<Video src="/first.mp4" />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    failVideo(video);
    setVisible(true);
    advance(1_000);
    expect(video.load).toHaveBeenCalledOnce();
    failVideo(video);
    setVisible(true);
    advance(500);
    rerender(<Video src="/second.mp4" />);
    advance(10_000);
    expect(video.load).toHaveBeenCalledOnce();
    failVideo(video);
    setVisible(true);
    advance(1_000);
    expect(video.load).toHaveBeenCalledTimes(2);
  });

  it('cancels the retry on unmount', () => {
    const { unmount } = render(<Video src="/video.mp4" />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    failVideo(video);
    setVisible(true);
    unmount();
    advance(10_000);
    expect(video.load).not.toHaveBeenCalled();
  });

  it('recovers when viewport observation is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Video src="/video.mp4" />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    failVideo(video);
    advance(1_000);
    expect(video.load).toHaveBeenCalledOnce();
  });

  it('does not reload if the video recovered before the timer fired', () => {
    render(<Video src="/video.mp4" />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    failVideo(video);
    setVisible(true);
    Object.defineProperties(video, {
      error: { configurable: true, value: null },
      readyState: { configurable: true, value: 4 },
    });
    advance(1_000);
    expect(video.load).not.toHaveBeenCalled();
  });

  it('recovers a visible player that its caller keeps paused', () => {
    // The list-layout thumbnail passes a permanent pauseVideo; load() never
    // starts playback without autoPlay, so visibility alone gates recovery.
    render(<Video src="/video.mp4" controls={false} muted playsInline pauseVideo />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    failVideo(video);
    setVisible(true);
    advance(1_000);
    expect(video.load).toHaveBeenCalledOnce();
  });

  it.each([
    { src: '/video.mp4', code: 1, readyState: 0 },
    { src: '/video.mp4', code: 3, readyState: 0 },
    { src: '/video.mp4', code: 2, readyState: 2 },
    { src: 'blob:local-video', code: 4, readyState: 0 },
    { src: 'data:video/mp4;base64,invalid', code: 4, readyState: 0 },
  ])('does not restart decoded media or retry a local/unsupported file: %o', ({ src, code, readyState }) => {
    const onError = vi.fn();
    render(<Video src={src} onError={onError} />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    failVideo(video, code, readyState);
    setVisible(true);
    advance(10_000);
    expect(video.load).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });
});
