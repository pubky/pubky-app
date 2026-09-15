import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
