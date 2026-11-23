import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { X_POST_VIDEO_START_MS, XPostVideo } from './XPostVideo';

const MP4 = 'https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/576x720/a.mp4?tag=12';
const fallback = () => <div data-testid="x-own-post" />;

/** The frame's document as a browser would build it from `srcdoc` (jsdom does not), then its `load`. */
function loadFrame(frame: HTMLIFrameElement): HTMLVideoElement {
  const doc = frame.contentDocument!;
  const video = doc.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
  vi.spyOn(video, 'play').mockResolvedValue();
  doc.body.append(video);
  fireEvent.load(frame);
  return video;
}

describe('XPostVideo', () => {
  afterEach(() => vi.useRealTimers());

  it('plays the MP4 in a same-origin frame that sends no Referer, sized to the video, the page’s policy untouched', () => {
    render(<XPostVideo src={MP4} aspect={0.8} fallback={fallback} />);

    const box = screen.getByTestId('x-post-video');
    expect(box).toHaveStyle({ aspectRatio: '0.8' });
    const frame = box.querySelector('iframe')!;
    expect(frame).not.toHaveAttribute('src');
    expect(frame).not.toHaveAttribute('sandbox');
    expect(frame).toHaveAttribute('allow', 'autoplay; fullscreen');
    const doc = frame.getAttribute('srcdoc') ?? '';
    expect(doc).toContain('<meta name="referrer" content="no-referrer">');
    expect(doc).toContain(`src="${MP4.replace('&', '&amp;')}"`);
    expect(document.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it('starts the video once its frame loads, and pauses it when other media starts', () => {
    render(
      <>
        <XPostVideo src={MP4} fallback={fallback} />
        <audio data-testid="other" />
      </>,
    );
    const video = loadFrame(screen.getByTestId('x-post-video').querySelector('iframe')!);
    expect(video.play).toHaveBeenCalled();

    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    const other = screen.getByTestId('other') as HTMLAudioElement;
    Object.defineProperty(other, 'paused', { value: false });
    fireEvent.play(other);
    expect(pause).toHaveBeenCalled();
  });

  it('stops the page’s other media when it plays', () => {
    render(
      <>
        <XPostVideo src={MP4} fallback={fallback} />
        <audio data-testid="other" />
      </>,
    );
    const other = screen.getByTestId('other') as HTMLAudioElement;
    Object.defineProperty(other, 'paused', { value: false });
    const pauseOther = vi.spyOn(other, 'pause').mockImplementation(() => {});
    const video = loadFrame(screen.getByTestId('x-post-video').querySelector('iframe')!);

    video.dispatchEvent(new Event('play'));
    expect(pauseOther).toHaveBeenCalled();
  });

  it('gives way to X’s own post when the video errs', () => {
    render(<XPostVideo src={MP4} fallback={fallback} />);
    const video = loadFrame(screen.getByTestId('x-post-video').querySelector('iframe')!);

    act(() => video.dispatchEvent(new Event('error')));
    expect(screen.getByTestId('x-own-post')).toBeInTheDocument();
    expect(screen.queryByTestId('x-post-video')).not.toBeInTheDocument();
  });

  it('counts a video already playing when its frame loads (its autoplay) as the start, stopping the others', () => {
    render(
      <>
        <XPostVideo src={MP4} fallback={fallback} />
        <audio data-testid="other" />
      </>,
    );
    const other = screen.getByTestId('other') as HTMLAudioElement;
    Object.defineProperty(other, 'paused', { value: false });
    const pauseOther = vi.spyOn(other, 'pause').mockImplementation(() => {});
    const frame = screen.getByTestId('x-post-video').querySelector('iframe')!;
    const video = frame.contentDocument!.createElement('video');
    Object.defineProperty(video, 'paused', { value: false });
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    frame.contentDocument!.body.append(video);

    fireEvent.load(frame);

    expect(pauseOther).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('gives way to X’s own post when the video already failed before its frame loaded', () => {
    render(<XPostVideo src={MP4} fallback={fallback} />);
    const frame = screen.getByTestId('x-post-video').querySelector('iframe')!;
    const video = frame.contentDocument!.createElement('video');
    Object.defineProperty(video, 'error', { value: { code: 4 } });
    frame.contentDocument!.body.append(video);

    act(() => fireEvent.load(frame));

    expect(screen.getByTestId('x-own-post')).toBeInTheDocument();
  });

  it('builds the frame from the normalized address, every character that could end the attribute escaped', () => {
    render(<XPostVideo src={"https://VIDEO.twimg.com/a/b c'd>e.mp4?x=1&y=2"} fallback={fallback} />);

    const doc = screen.getByTestId('x-post-video').querySelector('iframe')?.getAttribute('srcdoc') ?? '';
    expect(doc).toContain('src="https://video.twimg.com/a/b%20c&#39;d%3Ee.mp4?x=1&amp;y=2"');
    expect(doc).not.toMatch(/src="[^"]*[<>'][^"]*"/);
  });

  it('gives way to X’s own post when the video has no data in time', () => {
    vi.useFakeTimers();
    render(<XPostVideo src={MP4} fallback={fallback} />);

    act(() => vi.advanceTimersByTime(X_POST_VIDEO_START_MS));
    expect(screen.getByTestId('x-own-post')).toBeInTheDocument();
  });

  it('puts nothing but an MP4 on X’s video host into the frame', () => {
    render(<XPostVideo src={'https://evil.example/a.mp4"><script>alert(1)</script>'} fallback={fallback} />);

    expect(screen.getByTestId('x-own-post')).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });
});
