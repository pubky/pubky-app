import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostAttachmentsImagesAndVideos } from './PostAttachmentsImagesAndVideos';

/**
 * The collapsed media row (#2868): real Button and Dialog, Embla stubbed only because jsdom lacks
 * the matchMedia APIs it needs. jsdom applies no CSS, so the breakpoint split is asserted on the
 * classes that carry it: one tile under `sm`, two from `sm` up.
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

const image = (n: number): AttachmentConstructed => ({
  type: 'image/jpeg',
  name: `house-${n}.jpg`,
  urls: { main: `blob:house-${n}`, feed: `blob:house-${n}` },
});
const images = (count: number) => Array.from({ length: count }, (_, i) => image(i + 1));

/** The grid's tiles, in order: each image sits in its own preview trigger. */
const tiles = () => screen.getAllByRole('img').map((img) => img.closest('button') as HTMLElement);

describe('PostAttachmentsImagesAndVideos - collapsed media row (#2868)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, writable: true, configurable: true });
  });

  it('shows one tile on mobile and two from the sm breakpoint, hiding the rest behind Show more', () => {
    render(<PostAttachmentsImagesAndVideos imagesAndVideos={images(4)} collapsible />);

    const [first, second, third, fourth] = tiles();
    expect(first).not.toHaveClass('hidden');
    expect(first).not.toHaveClass('max-sm:hidden');
    expect(second).toHaveClass('max-sm:hidden');
    expect(second).not.toHaveClass('hidden');
    expect(third).toHaveClass('hidden');
    expect(fourth).toHaveClass('hidden');

    const toggle = screen.getByRole('button', { name: 'Show more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Something is hidden at every width, so the toggle shows at every width.
    expect(toggle.parentElement).not.toHaveClass('sm:hidden');
  });

  it('uses the app Show more button, centred under the row with no icon', () => {
    render(<PostAttachmentsImagesAndVideos imagesAndVideos={images(3)} collapsible />);

    const toggle = screen.getByRole('button', { name: 'Show more' });
    // The default variant's brand fill, as the collections lists' Show more.
    expect(toggle).toHaveClass('bg-brand/16');
    expect(toggle).not.toHaveClass('self-start');
    expect(toggle.querySelector('svg')).toBeNull();
    expect(toggle.parentElement).toHaveClass('flex', 'w-full', 'justify-center');
  });

  it('reveals every tile and offers Show less once expanded, then collapses again', async () => {
    const user = userEvent.setup();
    render(<PostAttachmentsImagesAndVideos imagesAndVideos={images(4)} collapsible />);

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    for (const tile of tiles()) {
      expect(tile).not.toHaveClass('hidden');
      expect(tile).not.toHaveClass('max-sm:hidden');
    }
    const toggle = screen.getByRole('button', { name: 'Show less' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(tiles()[2]).toHaveClass('hidden');
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  it('with exactly two tiles, collapses on mobile only: the toggle is hidden from sm up', () => {
    render(<PostAttachmentsImagesAndVideos imagesAndVideos={images(2)} collapsible />);

    expect(tiles()[1]).toHaveClass('max-sm:hidden');
    expect(screen.getByRole('button', { name: 'Show more' }).parentElement).toHaveClass('sm:hidden');
  });

  it('does not let the toggle click reach the post card, which navigates on click', async () => {
    const user = userEvent.setup();
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <PostAttachmentsImagesAndVideos imagesAndVideos={images(3)} collapsible />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Show more' }));

    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('shows no toggle for a single tile', () => {
    render(<PostAttachmentsImagesAndVideos imagesAndVideos={images(1)} collapsible />);

    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('opens the lightbox on the full set, hidden tiles included', async () => {
    const user = userEvent.setup();
    render(<PostAttachmentsImagesAndVideos imagesAndVideos={images(4)} collapsible />);

    await user.click(tiles()[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1/4')).toBeInTheDocument();
  });

  it('leaves a grid that is not collapsible exactly as it was', () => {
    render(<PostAttachmentsImagesAndVideos imagesAndVideos={images(4)} />);

    for (const tile of tiles()) {
      expect(tile).not.toHaveClass('hidden');
      expect(tile).not.toHaveClass('max-sm:hidden');
    }
    expect(screen.queryByRole('button', { name: /Show (more|less)/ })).not.toBeInTheDocument();
  });
});
