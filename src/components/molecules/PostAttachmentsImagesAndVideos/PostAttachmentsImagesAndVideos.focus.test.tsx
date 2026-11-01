import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostAttachments } from '@/organisms/PostAttachments/PostAttachments';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostAttachmentsImagesAndVideos } from './PostAttachmentsImagesAndVideos';

/**
 * Focus / keyboard-open coverage uses the real Radix Dialog (not mocked).
 * See docs/component-testing.md — "Radix UI Components: Always Real".
 *
 * Embla is stubbed only because jsdom lacks matchMedia APIs Embla requires;
 * Dialog autofocus / focus trapping remain the real Radix implementation.
 */

const mockEmblaApi = {
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
  canScrollPrev: vi.fn(() => true),
  canScrollNext: vi.fn(() => true),
  selectedScrollSnap: vi.fn(() => 0),
  on: vi.fn(),
  off: vi.fn(),
  scrollTo: vi.fn(),
};

vi.mock('embla-carousel-react', () => ({
  default: vi.fn(() => [vi.fn(), mockEmblaApi]),
}));

vi.mock('@/molecules/Toaster/toast');
vi.mock('@/hooks/useAttachmentsMetadata/useAttachmentsMetadata', () => ({
  useAttachmentsMetadata: () => ({ files: [] }),
}));
afterEach(() => vi.restoreAllMocks());

const createMockImage = (overrides: Partial<AttachmentConstructed> = {}): AttachmentConstructed => ({
  type: 'image/jpeg',
  name: 'test-image.jpg',
  urls: {
    main: 'https://example.com/main-image.jpg',
    feed: 'https://example.com/feed-image.jpg',
  },
  ...overrides,
});

describe('PostAttachmentsImagesAndVideos - focus (real Dialog)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('focuses the carousel via Radix onOpenAutoFocus when the lightbox opens', async () => {
    const user = userEvent.setup();
    const imagesAndVideos = [
      createMockImage({
        name: 'first.jpg',
        urls: { main: 'https://example.com/1.jpg', feed: 'https://example.com/1-feed.jpg' },
      }),
      createMockImage({
        name: 'second.jpg',
        urls: { main: 'https://example.com/2.jpg', feed: 'https://example.com/2-feed.jpg' },
      }),
    ];

    render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

    await user.click(screen.getByAltText('first.jpg'));

    const carouselRegion = await screen.findByRole('region');
    expect(carouselRegion).toHaveAttribute('aria-roledescription', 'carousel');
    expect(carouselRegion).toHaveAttribute('tabIndex', '0');

    await waitFor(() => {
      expect(carouselRegion).toHaveFocus();
    });
  });
  it('pauses inline Cards video while the lightbox is open and restores its trigger focus', async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);
    const { container } = render(
      <PostAttachments
        attachments={null}
        mediaVariant="cards"
        localAttachments={[createMockImage({ type: 'video/mp4' })]}
      />,
    );
    const inlineVideo = container.querySelector('video')!;
    const pause = vi.spyOn(inlineVideo, 'pause').mockImplementation(() => {});
    const trigger = screen.getByRole('button', { name: 'Open video 1 of 1' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await waitFor(() => expect(pause).toHaveBeenCalled());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('restores trigger focus on close without scrolling the feed', async () => {
    const user = userEvent.setup();
    render(<PostAttachments attachments={null} mediaVariant="cards" localAttachments={[createMockImage()]} />);
    const trigger = screen.getByRole('button', { name: /Open image 1/ });
    const focus = vi.spyOn(trigger, 'focus');
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
  });

  it('returns focus to the grid tile that opened the lightbox without scrolling', async () => {
    const user = userEvent.setup();
    render(
      <PostAttachmentsImagesAndVideos
        imagesAndVideos={['first', 'second', 'third'].map((name) =>
          createMockImage({
            name,
            urls: { main: `https://example.com/${name}.jpg`, feed: `https://example.com/${name}-feed.jpg` },
          }),
        )}
      />,
    );
    const tiles = screen.getAllByRole('button');
    const focusSpies = tiles.map((tile) => vi.spyOn(tile, 'focus'));
    await user.click(tiles[0]);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(tiles[0]).toHaveFocus();
    expect(focusSpies[0]).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(focusSpies[2]).not.toHaveBeenCalled();
  });

  describe('tap outside the media', () => {
    const FITTED_BOX = DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 400 });
    // A slight zoom: the picture draws 240x480 from x 80 to 320, so see-through bands remain either side
    const SLIGHT_ZOOM_BOX = DOMRect.fromRect({ x: -40, y: -40, width: 480, height: 480 });
    // A deep zoom: the picture draws 500x1000 from x -50, covering the whole 400px frame
    const DEEP_ZOOM_BOX = DOMRect.fromRect({ x: -300, y: -300, width: 1000, height: 1000 });

    // A 100x200 portrait picture fitted into a 400x400 box draws 200x400, leaving 100px see-through bands either side.
    // jsdom applies no transform, so the image's box follows the zoom state the way the browser's would.
    const openPortraitLightbox = async (zoomedBox = SLIGHT_ZOOM_BOX) => {
      const user = userEvent.setup();
      render(
        <PostAttachmentsImagesAndVideos
          imagesAndVideos={[createMockImage({ type: 'image/gif', name: 'portrait.gif' })]}
        />,
      );
      await user.click(screen.getByAltText('portrait.gif'));
      const dialog = await screen.findByRole('dialog');
      const img = dialog.querySelector('img')!;
      const frame = screen.getByTestId('carousel-image-zoom-frame');
      vi.spyOn(img, 'naturalWidth', 'get').mockReturnValue(100);
      vi.spyOn(img, 'naturalHeight', 'get').mockReturnValue(200);
      vi.spyOn(img, 'getBoundingClientRect').mockImplementation(() =>
        frame.dataset.zoomed === 'true' ? zoomedBox : FITTED_BOX,
      );
      vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(FITTED_BOX);
      return { user, img, frame };
    };
    const tap = (user: ReturnType<typeof userEvent.setup>, target: Element, clientX: number, clientY: number) =>
      user.pointer({ keys: '[MouseLeft]', target, coords: { clientX, clientY } });
    const zoomIn = async (user: ReturnType<typeof userEvent.setup>, img: Element, frame: HTMLElement) => {
      await tap(user, img, 200, 200);
      await tap(user, img, 200, 200);
      await waitFor(() => expect(frame).toHaveAttribute('data-zoomed', 'true'));
    };

    it('closes on a tap in the see-through band beside the picture', async () => {
      const { user, img } = await openPortraitLightbox();
      await tap(user, img, 20, 200);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('stays open on a tap on the picture itself', async () => {
      const { user, img } = await openPortraitLightbox();
      await tap(user, img, 200, 200);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('closes on a tap in the empty slide space around the media', async () => {
      const { user } = await openPortraitLightbox();
      await tap(user, screen.getByTestId('carousel-image-zoom-frame'), 200, 200);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('closes on a tap in the band left beside a slightly zoomed picture', async () => {
      const { user, img, frame } = await openPortraitLightbox(SLIGHT_ZOOM_BOX);
      await zoomIn(user, img, frame);
      await tap(user, img, 20, 200);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('stays open on a tap on the zoomed picture where the fitted picture leaves a band', async () => {
      const { user, img, frame } = await openPortraitLightbox(DEEP_ZOOM_BOX);
      await zoomIn(user, img, frame);
      await tap(user, img, 20, 200);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('stays open when a double tap on the zoomed picture zooms out into what becomes the band', async () => {
      const { user, img, frame } = await openPortraitLightbox(DEEP_ZOOM_BOX);
      await zoomIn(user, img, frame);
      await tap(user, img, 20, 200);
      await tap(user, img, 20, 200);
      await waitFor(() => expect(frame).toHaveAttribute('data-zoomed', 'false'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('stays open when a press in the band travels as a pan', async () => {
      const { user, img } = await openPortraitLightbox();
      await user.pointer([
        { keys: '[MouseLeft>]', target: img, coords: { clientX: 20, clientY: 200 } },
        { target: img, coords: { clientX: 60, clientY: 200 } },
        { keys: '[/MouseLeft]', target: img, coords: { clientX: 60, clientY: 200 } },
      ]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('renders Cards media before its caption and audio/files after it', async () => {
    const { container } = render(
      <PostAttachments
        attachments={null}
        mediaVariant="cards"
        localAttachments={[
          createMockImage(),
          createMockImage({ type: 'audio/mpeg', name: 'audio.mp3' }),
          createMockImage({ type: 'application/pdf', name: 'document.pdf' }),
        ]}
      >
        <p>Caption between attachments</p>
      </PostAttachments>,
    );
    const image = screen.getByRole('button', { name: /Open image 1/ });
    const caption = screen.getByText('Caption between attachments');
    const audio = container.querySelector('audio')!;
    expect(image.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      audio.compareDocumentPosition(screen.getByText('document.pdf')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
