import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { LandingBrokenPoster } from './LandingBrokenPoster';
import { LandingVideo } from './LandingVideo';
import { LANDING_DESKTOP_QUERY, LANDING_VIDEO_QUERY } from './LandingVideo.constants';

function setPlaybackPreference(matches: boolean, desktop = matches) {
  const matchMedia = vi.fn((query: string) => ({
    matches: (query === LANDING_VIDEO_QUERY && matches) || (query === LANDING_DESKTOP_QUERY && desktop),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
}

function observeVideo() {
  let intersect = () => {};
  vi.stubGlobal(
    'IntersectionObserver',
    class extends IntersectionObserver {
      readonly thresholds = [0];

      constructor(private readonly onIntersect: IntersectionObserverCallback) {
        super(onIntersect);
      }

      observe(target: Element) {
        intersect = () =>
          this.onIntersect(
            [asOpaque<IntersectionObserverEntry>({ isIntersecting: true, intersectionRatio: 1, target })],
            this,
          );
      }
    },
  );
  return () => act(intersect);
}

const posterProps = { asset: '/images/landing-webbroken1', alt: 'They own you', descriptionId: 'feature-description', className: 'aspect-square' };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('LandingVideo', () => {
  it('starts the visible hero after the page has loaded', () => {
    setPlaybackPreference(true);
    const intersect = observeVideo();
    const readyState = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const { container } = render(<LandingVideo />);

    intersect();
    expect(container.querySelector('video')).not.toBeInTheDocument();

    readyState.mockReturnValue('complete');
    fireEvent.load(window);
    expect(container.querySelector('video')).not.toBeInTheDocument();

    intersect();
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', '/images/landing-video.mp4');
    expect(video).toHaveAttribute('poster', '/images/landing-video-poster.webp');
    expect(video).toHaveAttribute('autoplay');
  });

  it('keeps desktop motion disabled when the media query does not match', () => {
    setPlaybackPreference(false);
    const intersect = observeVideo();
    const { container } = render(<LandingVideo />);
    intersect();
    expect(container.querySelector('video')).not.toBeInTheDocument();
  });
});

describe('LandingBrokenPoster', () => {
  it('loads a responsive poster and requests its movie only during pointer or keyboard preview', () => {
    setPlaybackPreference(true);
    const { container } = render(<LandingBrokenPoster {...posterProps} />);
    const poster = screen.getByRole('img', { name: 'They own you' });
    expect(poster).toHaveAttribute('loading', 'lazy');
    expect(container.querySelector('source')).toHaveAttribute('srcset', expect.stringContaining('384w'));
    expect(container.querySelector('video')).not.toBeInTheDocument();

    fireEvent.pointerEnter(poster, { pointerType: 'mouse' });
    expect(container.querySelector('video')).toHaveAttribute('src', '/images/landing-webbroken1.mp4');
    fireEvent.pointerLeave(poster);
    expect(container.querySelector('video')).not.toBeInTheDocument();

    const focusTarget = container.querySelector<HTMLElement>('[tabindex="0"]')!;
    act(() => focusTarget.focus());
    expect(container.querySelector('video')).toHaveAttribute('autoplay');
    fireEvent.blur(focusTarget);
    expect(container.querySelector('video')).not.toBeInTheDocument();
  });

  it('releases a clicked or touched preview when the pointer leaves', () => {
    setPlaybackPreference(true);
    const { container } = render(<LandingBrokenPoster {...posterProps} />);
    const poster = screen.getByRole('img');
    // jsdom does not distinguish pointer focus from keyboard focus.
    vi.spyOn(poster, 'matches').mockImplementation((selector) => selector !== ':focus-visible');
    fireEvent.pointerEnter(poster, { pointerType: 'mouse' });
    fireEvent.pointerDown(poster, { pointerType: 'mouse' });
    fireEvent.focus(poster);
    fireEvent.pointerLeave(poster, { pointerType: 'mouse' });
    expect(container.querySelector('video')).not.toBeInTheDocument();
    fireEvent.pointerEnter(poster, { pointerType: 'touch' });
    fireEvent.pointerDown(poster, { pointerType: 'touch' });
    fireEvent.focus(poster);
    expect(container.querySelector('video')).not.toBeInTheDocument();
  });

  it('keeps the description keyboard-accessible on desktop with reduced motion', () => {
    setPlaybackPreference(false, true);
    const { container } = render(<LandingBrokenPoster {...posterProps} />);
    const poster = screen.getByRole('img');
    expect(poster).toHaveAttribute('tabindex', '0');
    expect(poster).toHaveAttribute('aria-describedby', posterProps.descriptionId);
    act(() => poster.focus());
    expect(poster).toHaveFocus();
    expect(container.querySelector('video')).not.toBeInTheDocument();
  });

  it('retains the static image when playback is disabled', () => {
    setPlaybackPreference(false);
    const { container } = render(<LandingBrokenPoster {...posterProps} />);
    fireEvent.pointerEnter(screen.getByRole('img'), { pointerType: 'mouse' });
    expect(container.querySelector('video')).not.toBeInTheDocument();
  });
});
