import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostMediaCarousel } from './PostMediaCarousel';

// jsdom has no slide geometry; exercise our event bridge against Embla's public API.
const embla = vi.hoisted(() => {
  let index = 0;
  const listeners = new Map<string, Set<() => void>>();
  const emit = (event: string) => listeners.get(event)?.forEach((listener) => listener());
  const select = (next: number) => {
    index = next;
    emit('select');
  };
  const api = {
    selectedScrollSnap: () => index,
    rootNode: () => document.querySelector<HTMLElement>('[data-slot="carousel-content"]')!,
    slideNodes: () => Array.from(document.querySelectorAll<HTMLElement>('[data-slot="carousel-item"]')),
    canScrollNext: () => true,
    canScrollPrev: () => true,
    scrollNext: () => select(1),
    scrollPrev: () => select(0),
    on: (event: string, listener: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off: (event: string, listener: () => void) => listeners.get(event)?.delete(listener),
  };
  return {
    api,
    emit,
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

  it('keeps keyboard focus in the carousel when the focused image becomes inactive', () => {
    render(<PostMediaCarousel media={media} onOpenPreview={vi.fn()} isPreviewOpen={false} />);
    const carousel = screen.getByRole('group', { name: 'Post media' });
    const trigger = screen.getByRole('button', { name: 'Open image 1 of 2: Portrait' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(carousel).toHaveFocus();
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(carousel).toHaveFocus();
  });

  it('rescues focus for a swipe but does not steal focus from navigation buttons or on resize', () => {
    render(<PostMediaCarousel media={media} onOpenPreview={vi.fn()} isPreviewOpen={false} />);
    const root = screen.getByRole('group', { name: 'Post media' });
    const image = screen.getByRole('button', { name: /Open image 1/ });
    image.focus();
    act(() => embla.emit('reInit'));
    expect(image).toHaveFocus();
    act(() => embla.api.scrollNext());
    expect(root).toHaveFocus();
    const previous = screen.getByRole('button', { name: 'Previous slide' });
    previous.focus();
    fireEvent.click(previous);
    expect(previous).toHaveFocus();
  });

  it.each(['j', 'k', 'ArrowUp', 'ArrowDown', 'Home', 'End'])(
    'lets %s reach the feed from the root but isolates native media',
    (key) => {
      const parent = vi.fn();
      render(
        <div onKeyDown={parent}>
          <PostMediaCarousel
            media={[{ ...media[0], type: 'video/mp4' }, media[1]]}
            onOpenPreview={vi.fn()}
            isPreviewOpen={false}
          />
        </div>,
      );
      fireEvent.keyDown(screen.getByRole('group', { name: 'Post media' }), { key });
      expect(parent).toHaveBeenCalledOnce();
      parent.mockClear();
      fireEvent.keyDown(screen.getByTestId('video'), { key });
      expect(parent).not.toHaveBeenCalled();
    },
  );

  it('keeps a single image trigger without a redundant carousel tab stop', () => {
    render(<PostMediaCarousel media={[media[0]]} onOpenPreview={vi.fn()} isPreviewOpen={false} />);
    expect(screen.getByRole('group', { name: 'Post media' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: /Open image 1/ })).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('button', { name: 'Next slide' })).not.toBeInTheDocument();
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
      fireEvent.keyDown(screen.getByRole('group', { name: 'Post media' }), { key: 'ArrowRight' });
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
