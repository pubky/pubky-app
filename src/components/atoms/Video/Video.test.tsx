import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Video } from './Video';

describe('Video', () => {
  it('renders with required props', () => {
    render(<Video src="/test-video.mp4" data-testid="test-video" />);
    const video = screen.getByTestId('test-video');
    expect(video).toBeInTheDocument();
  });

  it('renders with correct src attribute', () => {
    render(<Video src="/movie.mp4" data-testid="video" />);
    const video = screen.getByTestId('video') as HTMLVideoElement;
    expect(video.src).toContain('/movie.mp4');
  });

  it('applies custom className', () => {
    render(<Video src="/video.mp4" className="custom-class" data-testid="custom-video" />);
    const video = screen.getByTestId('custom-video');
    expect(video).toHaveClass('custom-class');
  });

  it('applies default classes', () => {
    render(<Video src="/video.mp4" data-testid="default-video" />);
    const video = screen.getByTestId('default-video');
    expect(video).toHaveClass('h-auto', 'max-w-full', 'rounded-md', 'bg-black');
  });

  it('renders with controls by default', () => {
    render(<Video src="/video.mp4" data-testid="video-controls" />);
    const video = screen.getByTestId('video-controls') as HTMLVideoElement;
    expect(video.controls).toBe(true);
  });

  it('can disable controls', () => {
    render(<Video src="/video.mp4" controls={false} data-testid="video-no-controls" />);
    const video = screen.getByTestId('video-no-controls') as HTMLVideoElement;
    expect(video.controls).toBe(false);
  });

  it('renders with poster attribute', () => {
    render(<Video src="/video.mp4" poster="/thumbnail.jpg" data-testid="video-poster" />);
    const video = screen.getByTestId('video-poster') as HTMLVideoElement;
    expect(video.poster).toContain('/thumbnail.jpg');
  });

  it('renders with autoPlay attribute', () => {
    render(<Video src="/video.mp4" autoPlay data-testid="video-autoplay" />);
    const video = screen.getByTestId('video-autoplay') as HTMLVideoElement;
    expect(video.autoplay).toBe(true);
  });

  it('renders with loop attribute', () => {
    render(<Video src="/video.mp4" loop data-testid="video-loop" />);
    const video = screen.getByTestId('video-loop') as HTMLVideoElement;
    expect(video.loop).toBe(true);
  });

  it('renders with muted attribute', () => {
    render(<Video src="/video.mp4" muted data-testid="video-muted" />);
    const video = screen.getByTestId('video-muted') as HTMLVideoElement;
    expect(video.muted).toBe(true);
  });

  it('renders with playsInline attribute', () => {
    render(<Video src="/video.mp4" playsInline data-testid="video-playsinline" />);
    const video = screen.getByTestId('video-playsinline') as HTMLVideoElement;
    expect(video.playsInline).toBe(true);
  });

  it('accepts width and height attributes', () => {
    render(<Video src="/video.mp4" width={640} height={480} data-testid="video-dimensions" />);
    const video = screen.getByTestId('video-dimensions') as HTMLVideoElement;
    expect(video.width).toBe(640);
    expect(video.height).toBe(480);
  });

  it('renders with preload attribute', () => {
    render(<Video src="/video.mp4" preload="metadata" data-testid="video-preload" />);
    const video = screen.getByTestId('video-preload') as HTMLVideoElement;
    expect(video.preload).toBe('metadata');
  });

  it('uses default data-testid when not provided', () => {
    render(<Video src="/video.mp4" />);
    const video = screen.getByTestId('video');
    expect(video).toBeInTheDocument();
  });

  it('forwards ref correctly as a ref object', () => {
    const ref = createRef<HTMLVideoElement>();
    render(<Video src="/video.mp4" ref={ref} data-testid="ref-video" />);
    const video = screen.getByTestId('ref-video');
    expect(ref.current).toBe(video);
  });

  it('forwards ref correctly as a callback function', () => {
    const refCallback = vi.fn();
    render(<Video src="/video.mp4" ref={refCallback} data-testid="callback-ref-video" />);
    const video = screen.getByTestId('callback-ref-video');
    expect(refCallback).toHaveBeenCalledWith(video);
  });
});

describe('Video - pauseVideo prop', () => {
  it('pauses the video when pauseVideo is true and video is playing', () => {
    const { rerender } = render(<Video src="/video.mp4" data-testid="pause-video" />);
    const video = screen.getByTestId('pause-video') as HTMLVideoElement;

    // Mock the pause method and paused property
    const pauseMock = vi.fn();
    video.pause = pauseMock;
    Object.defineProperty(video, 'paused', { value: false, writable: true });

    // Rerender with pauseVideo=true
    rerender(<Video src="/video.mp4" data-testid="pause-video" pauseVideo={true} />);

    expect(pauseMock).toHaveBeenCalledTimes(1);
  });

  it('does not pause the video when pauseVideo is true but video is already paused', () => {
    const { rerender } = render(<Video src="/video.mp4" data-testid="already-paused" />);
    const video = screen.getByTestId('already-paused') as HTMLVideoElement;

    // Mock the pause method and paused property (video is already paused)
    const pauseMock = vi.fn();
    video.pause = pauseMock;
    Object.defineProperty(video, 'paused', { value: true, writable: true });

    // Rerender with pauseVideo=true
    rerender(<Video src="/video.mp4" data-testid="already-paused" pauseVideo={true} />);

    expect(pauseMock).not.toHaveBeenCalled();
  });

  it('does not pause the video when pauseVideo is false', () => {
    const { rerender } = render(<Video src="/video.mp4" data-testid="no-pause" />);
    const video = screen.getByTestId('no-pause') as HTMLVideoElement;

    // Mock the pause method and paused property
    const pauseMock = vi.fn();
    video.pause = pauseMock;
    Object.defineProperty(video, 'paused', { value: false, writable: true });

    // Rerender with pauseVideo=false
    rerender(<Video src="/video.mp4" data-testid="no-pause" pauseVideo={false} />);

    expect(pauseMock).not.toHaveBeenCalled();
  });

  it('does not pause the video when pauseVideo is undefined', () => {
    const { rerender } = render(<Video src="/video.mp4" data-testid="undefined-pause" />);
    const video = screen.getByTestId('undefined-pause') as HTMLVideoElement;

    // Mock the pause method and paused property
    const pauseMock = vi.fn();
    video.pause = pauseMock;
    Object.defineProperty(video, 'paused', { value: false, writable: true });

    // Rerender without pauseVideo prop
    rerender(<Video src="/video.mp4" data-testid="undefined-pause" />);

    expect(pauseMock).not.toHaveBeenCalled();
  });

  it('pauses the video when pauseVideo changes from false to true', () => {
    const { rerender } = render(<Video src="/video.mp4" data-testid="toggle-pause" pauseVideo={false} />);
    const video = screen.getByTestId('toggle-pause') as HTMLVideoElement;

    // Mock the pause method and paused property
    const pauseMock = vi.fn();
    video.pause = pauseMock;
    Object.defineProperty(video, 'paused', { value: false, writable: true });

    // Rerender with pauseVideo=true
    rerender(<Video src="/video.mp4" data-testid="toggle-pause" pauseVideo={true} />);

    expect(pauseMock).toHaveBeenCalledTimes(1);
  });
});

describe('Video - Snapshots', () => {
  it('matches snapshot with required props', () => {
    const { container } = render(<Video src="/video.mp4" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Video src="/video.mp4" className="rounded-lg shadow-lg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with MP4 video', () => {
    const { container } = render(<Video src="/movie.mp4" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with WebM video', () => {
    const { container } = render(<Video src="/animation.webm" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with OGG video', () => {
    const { container } = render(<Video src="/clip.ogg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with poster', () => {
    const { container } = render(<Video src="/video.mp4" poster="/thumbnail.jpg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with controls disabled', () => {
    const { container } = render(<Video src="/video.mp4" controls={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with autoPlay and muted', () => {
    const { container } = render(<Video src="/video.mp4" autoPlay muted />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with loop', () => {
    const { container } = render(<Video src="/video.mp4" loop />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with playsInline', () => {
    const { container } = render(<Video src="/video.mp4" playsInline />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with width and height', () => {
    const { container } = render(<Video src="/video.mp4" width={800} height={600} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with preload attribute', () => {
    const { container } = render(<Video src="/video.mp4" preload="none" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<Video src="/video.mp4" id="hero-video" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<Video src="/video.mp4" data-testid="custom-test-id" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple custom attributes', () => {
    const { container } = render(
      <Video
        src="/complex.mp4"
        className="rounded-xl border-2"
        width={1280}
        height={720}
        poster="/poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
