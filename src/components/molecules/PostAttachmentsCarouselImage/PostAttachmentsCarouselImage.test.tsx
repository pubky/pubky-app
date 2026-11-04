import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostAttachmentsCarouselImage } from './PostAttachmentsCarouselImage';

// Mock @/atoms
vi.mock('@/atoms/Image/Image', () => {
  return {
    Image: ({
      src,
      alt,
      className,
      onLoad,
      'data-testid': dataTestId,
    }: {
      src: string;
      alt: string;
      className?: string;
      onLoad?: () => void;
      'data-testid'?: string;
    }) => (
      <img
        data-testid={dataTestId || `image-${src.includes('feed') ? 'feed' : 'main'}`}
        src={src}
        alt={alt}
        className={className}
        onLoad={onLoad}
      />
    ),
  };
});

const createMockImage = (overrides: Partial<AttachmentConstructed> = {}): AttachmentConstructed => ({
  type: 'image/jpeg',
  name: 'test-image.jpg',
  urls: {
    main: 'https://example.com/main-image.jpg',
    feed: 'https://example.com/feed-image.jpg',
  },
  ...overrides,
});

const createMockGif = (overrides: Partial<AttachmentConstructed> = {}): AttachmentConstructed => ({
  type: 'image/gif',
  name: 'test-animation.gif',
  urls: {
    main: 'https://example.com/main-animation.gif',
    feed: 'https://example.com/feed-animation.gif',
  },
  ...overrides,
});

describe('PostAttachmentsCarouselImage', () => {
  describe('Basic rendering', () => {
    it('renders without crashing', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} />);

      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('renders both feed and main images initially for non-GIF images', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} />);

      expect(screen.getByTestId('image-feed')).toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('renders only main image for GIF images', () => {
      const gif = createMockGif();
      render(<PostAttachmentsCarouselImage image={gif} />);

      expect(screen.queryByTestId('image-feed')).not.toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('renders with correct alt text', () => {
      const image = createMockImage({ name: 'my-photo.jpg' });
      render(<PostAttachmentsCarouselImage image={image} />);

      const feedImage = screen.getByTestId('image-feed');
      const mainImage = screen.getByTestId('image-main');

      expect(feedImage).toHaveAttribute('alt', 'my-photo.jpg');
      expect(mainImage).toHaveAttribute('alt', 'my-photo.jpg');
    });

    it('renders with correct src attributes', () => {
      const image = createMockImage({
        urls: {
          main: 'https://example.com/main-high-res.jpg',
          feed: 'https://example.com/feed-low-res.jpg',
        },
      });
      render(<PostAttachmentsCarouselImage image={image} />);

      const feedImage = screen.getByTestId('image-feed');
      const mainImage = screen.getByTestId('image-main');

      expect(feedImage).toHaveAttribute('src', 'https://example.com/feed-low-res.jpg');
      expect(mainImage).toHaveAttribute('src', 'https://example.com/main-high-res.jpg');
    });
  });

  describe('Loading states', () => {
    it('shows feed image as placeholder before main image loads', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} />);

      const feedImage = screen.getByTestId('image-feed');
      expect(feedImage).toBeInTheDocument();
      expect(feedImage).toHaveClass('max-h-full');
      expect(feedImage).toHaveClass('w-full');
      expect(feedImage).toHaveClass('rounded-md');
      expect(feedImage).toHaveClass('object-contain');
    });

    it('hides main image before it loads (size-0 class)', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveClass('size-0');
    });

    it('hides feed image after main image loads', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} />);

      const mainImage = screen.getByTestId('image-main');
      fireEvent.load(mainImage);

      expect(screen.queryByTestId('image-feed')).not.toBeInTheDocument();
    });

    it('shows main image with full styling after it loads', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} />);

      const mainImage = screen.getByTestId('image-main');
      fireEvent.load(mainImage);

      expect(mainImage).toHaveClass('max-h-full');
      expect(mainImage).toHaveClass('w-full');
      expect(mainImage).toHaveClass('rounded-md');
      expect(mainImage).toHaveClass('object-contain');
      expect(mainImage).not.toHaveClass('size-0');
    });
  });

  describe('GIF handling', () => {
    it('shows main image immediately for GIFs with full styling', () => {
      const gif = createMockGif();
      render(<PostAttachmentsCarouselImage image={gif} />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveClass('max-h-full');
      expect(mainImage).not.toHaveClass('size-0');
    });
  });

  describe('Image types', () => {
    it('handles PNG images correctly', () => {
      const png = createMockImage({ type: 'image/png' });
      render(<PostAttachmentsCarouselImage image={png} />);

      expect(screen.getByTestId('image-feed')).toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('handles WebP images correctly', () => {
      const webp = createMockImage({ type: 'image/webp' });
      render(<PostAttachmentsCarouselImage image={webp} />);

      expect(screen.getByTestId('image-feed')).toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('handles SVG images correctly', () => {
      const svg = createMockImage({ type: 'image/svg+xml' });
      render(<PostAttachmentsCarouselImage image={svg} />);

      expect(screen.getByTestId('image-feed')).toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles image with special characters in name', () => {
      const image = createMockImage({ name: 'my photo (1).jpg' });
      render(<PostAttachmentsCarouselImage image={image} />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveAttribute('alt', 'my photo (1).jpg');
    });

    it('handles image with query parameters in URL', () => {
      const image = createMockImage({
        urls: {
          main: 'https://example.com/main-image.jpg?token=abc123&size=large',
          feed: 'https://example.com/feed-image.jpg?token=abc123&size=small',
        },
      });
      render(<PostAttachmentsCarouselImage image={image} />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveAttribute('src', 'https://example.com/main-image.jpg?token=abc123&size=large');
    });

    it('handles image with encoded URL characters', () => {
      const image = createMockImage({
        urls: {
          main: 'https://example.com/my%20main-image.jpg',
          feed: 'https://example.com/my%20feed-image.jpg',
        },
      });
      render(<PostAttachmentsCarouselImage image={image} />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveAttribute('src', 'https://example.com/my%20main-image.jpg');
    });

    it('handles empty string name', () => {
      const image = createMockImage({ name: '' });
      render(<PostAttachmentsCarouselImage image={image} />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveAttribute('alt', '');
    });
  });
});
describe('local attachment fallback', () => {
  it('opens a local attachment that has no separate feed thumbnail', () => {
    render(
      <PostAttachmentsCarouselImage image={{ type: 'image/png', name: 'Local image', urls: { main: '/local.png' } }} />,
    );
    const images = screen.getAllByAltText('Local image');
    expect(images.every((image) => image.getAttribute('src') === '/local.png')).toBe(true);
  });
});

describe('PostAttachmentsCarouselImage zoom', () => {
  it('lets the frame own touch gestures, fills the available lightbox height, and starts fitted', () => {
    render(<PostAttachmentsCarouselImage image={createMockImage()} />);

    const frame = screen.getByTestId('carousel-image-zoom-frame');
    expect(frame).toHaveClass('touch-none', 'h-[75dvh]', 'overflow-hidden', 'rounded-md');
    expect(frame).toHaveAttribute('data-zoomed', 'false');
    expect(screen.getByTestId('carousel-image-zoom-content').style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('zooms on a double tap and shows it on data-zoomed, then resets when the slide stops being active', () => {
    const image = createMockImage();
    const { rerender } = render(<PostAttachmentsCarouselImage image={image} />);

    const frame = screen.getByTestId('carousel-image-zoom-frame');
    for (let i = 0; i < 2; i++) {
      fireEvent.pointerDown(frame, { pointerId: 1, clientX: 0, clientY: 0, pointerType: 'touch' });
      fireEvent.pointerUp(frame, { pointerId: 1, clientX: 0, clientY: 0, pointerType: 'touch' });
    }

    expect(frame).toHaveAttribute('data-zoomed', 'true');

    rerender(<PostAttachmentsCarouselImage image={image} isActive={false} />);
    expect(frame).toHaveAttribute('data-zoomed', 'false');
  });
});
