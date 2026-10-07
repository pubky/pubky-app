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
    Object.defineProperty(document, 'fullscreenEnabled', {
      value: true,
      writable: true,
      configurable: true,
    });
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
