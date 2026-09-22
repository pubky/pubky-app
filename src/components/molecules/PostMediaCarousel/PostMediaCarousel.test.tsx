import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostMediaCarousel } from './PostMediaCarousel';

// jsdom has no slide geometry; exercise our event bridge against Embla's public API.
const embla = vi.hoisted(() => {
  let index = 0;
  const listeners = new Set<() => void>();
  const select = (next: number) => {
    index = next;
    listeners.forEach((listener) => listener());
  };
  const api = {
    selectedScrollSnap: () => index,
    canScrollNext: () => true,
    canScrollPrev: () => true,
    scrollNext: () => select(1),
    scrollPrev: () => select(0),
    on: (_event: string, listener: () => void) => listeners.add(listener),
    off: (_event: string, listener: () => void) => listeners.delete(listener),
  };
  return {
    api,
    ref: vi.fn(),
    reset: () => {
      index = 0;
      listeners.clear();
    },
  };
});
vi.mock('embla-carousel-react', () => ({ default: () => [embla.ref, embla.api] }));
beforeEach(() => embla.reset());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const media = [
  { name: 'Portrait', type: 'image/png', width: 600, height: 900, urls: { main: '/portrait.png' } },
  { name: 'Landscape', type: 'image/png', width: 1200, height: 600, urls: { main: '/landscape.png' } },
];

describe('PostMediaCarousel', () => {
  it('reserves the first media proportions and opens the selected image in the shared lightbox', () => {
    const open = vi.fn();
    render(<PostMediaCarousel media={media} onOpenPreview={open} isPreviewOpen={false} />);
    const trigger = screen.getByRole('button', { name: 'Open image 1 of 2: Portrait' });
    expect(trigger.parentElement).toHaveStyle({ aspectRatio: '0.6666666666666666' });
    fireEvent.click(trigger);
    expect(open).toHaveBeenCalledWith(0, expect.anything());
    expect(screen.getByText('1 / 2')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('button', { name: 'Open image 2 of 2: Landscape' })).not.toBeInTheDocument();
  });

  it('navigates without changing the frame and opens the selected attachment', () => {
    const open = vi.fn();
    render(<PostMediaCarousel media={media} onOpenPreview={open} isPreviewOpen={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    const trigger = screen.getByRole('button', { name: 'Open image 2 of 2: Landscape' });
    expect(trigger.parentElement).toHaveStyle({ aspectRatio: '0.6666666666666666' });
    fireEvent.click(trigger);
    expect(open).toHaveBeenCalledWith(1, expect.anything());
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }));
    expect(screen.getByRole('button', { name: 'Open image 1 of 2: Portrait' })).toBeInTheDocument();
  });

  it('pauses a video when its slide becomes inactive or the lightbox opens', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const paused = vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);
    const videoMedia = [{ ...media[0], type: 'video/mp4' }, media[1]];
    const { rerender } = render(<PostMediaCarousel media={videoMedia} onOpenPreview={vi.fn()} isPreviewOpen={false} />);
    expect(screen.getByTestId('video')).toHaveAttribute('controls');
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(pause).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }));
    rerender(<PostMediaCarousel media={videoMedia} onOpenPreview={vi.fn()} isPreviewOpen />);
    expect(pause).toHaveBeenCalledTimes(2);
    pause.mockRestore();
    paused.mockRestore();
  });

  it.each([1, 2])('preserves native video seek keys with %i media items', (count) => {
    const videoMedia = [{ ...media[0], type: 'video/mp4' }, media[1]].slice(0, count);
    render(<PostMediaCarousel media={videoMedia} onOpenPreview={vi.fn()} isPreviewOpen={false} />);
    const video = screen.getByTestId('video');
    for (const key of ['ArrowRight', 'ArrowLeft']) {
      expect(fireEvent.keyDown(video, { key })).toBe(true);
      expect(embla.api.selectedScrollSnap()).toBe(0);
    }
    if (count > 1) {
      fireEvent.keyDown(screen.getByRole('region', { name: 'Post media' }), { key: 'ArrowRight' });
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    }
  });

  it('pauses when the media frame leaves view even if its caption and controls remain visible', () => {
    let intersect: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof intersect) {
          intersect = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const videoMedia = [{ ...media[0], type: 'video/mp4' }, media[1]];
    const { unmount } = render(
      <div>
        <PostMediaCarousel media={videoMedia} onOpenPreview={vi.fn()} isPreviewOpen={false} />
        <p>A long caption stays visible after scrolling past the video.</p>
      </div>,
    );
    const observed = observe.mock.calls[0][0];
    expect(observed).toContainElement(screen.getByTestId('video'));
    expect(observed).not.toContainElement(screen.getByText(/A long caption/));
    expect(observed).not.toContainElement(screen.getByRole('button', { name: 'Next slide' }));
    intersect?.([{ isIntersecting: true }]);
    expect(pause).not.toHaveBeenCalled();
    intersect?.([{ isIntersecting: false }]);
    expect(pause).toHaveBeenCalledOnce();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('uses loaded dimensions when metadata is absent and keeps failures usable', async () => {
    render(
      <PostMediaCarousel
        media={[{ ...media[0], width: undefined, height: undefined }]}
        onOpenPreview={vi.fn()}
        isPreviewOpen={false}
      />,
    );
    const image = screen.getByAltText('Portrait');
    Object.defineProperties(image, { naturalWidth: { value: 400 }, naturalHeight: { value: 1200 } });
    fireEvent.load(image);
    await waitFor(() => expect(image.parentElement?.parentElement).toHaveStyle({ aspectRatio: '0.3333333333333333' }));
    fireEvent.error(image);
    expect(screen.getByRole('status')).toHaveTextContent('Media unavailable');
    expect(screen.getByRole('button', { name: 'Open original' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next slide' })).not.toBeInTheDocument();
  });
});

describe('PostMediaCarousel - Snapshots', () => {
  it('renders a portrait carousel with all navigation controls', () => {
    const { container } = render(<PostMediaCarousel media={media} onOpenPreview={vi.fn()} isPreviewOpen={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
