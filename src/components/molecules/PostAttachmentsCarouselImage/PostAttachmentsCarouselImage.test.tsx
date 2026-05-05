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
      id,
      onLoad,
      'data-testid': dataTestId,
    }: {
      src: string;
      alt: string;
      className?: string;
      id?: string;
      onLoad?: () => void;
      'data-testid'?: string;
    }) => (
      <img
        data-testid={dataTestId || `image-${src.includes('feed') ? 'feed' : 'main'}`}
        src={src}
        alt={alt}
        className={className}
        id={id}
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
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('renders both feed and main images initially for non-GIF images', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      expect(screen.getByTestId('image-feed')).toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('renders only main image for GIF images', () => {
      const gif = createMockGif();
      render(<PostAttachmentsCarouselImage image={gif} id="test-id" />);

      expect(screen.queryByTestId('image-feed')).not.toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('renders with correct alt text', () => {
      const image = createMockImage({ name: 'my-photo.jpg' });
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

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
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      const feedImage = screen.getByTestId('image-feed');
      const mainImage = screen.getByTestId('image-main');

      expect(feedImage).toHaveAttribute('src', 'https://example.com/feed-low-res.jpg');
      expect(mainImage).toHaveAttribute('src', 'https://example.com/main-high-res.jpg');
    });
  });

  describe('Loading states', () => {
    it('shows feed image as placeholder before main image loads', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      const feedImage = screen.getByTestId('image-feed');
      expect(feedImage).toBeInTheDocument();
      expect(feedImage).toHaveClass('max-h-[75dvh]');
      expect(feedImage).toHaveClass('w-full');
      expect(feedImage).toHaveClass('rounded-md');
      expect(feedImage).toHaveClass('object-contain');
    });

    it('hides main image before it loads (size-0 class)', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveClass('size-0');
    });

    it('does not have id on main image before it loads', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).not.toHaveAttribute('id');
    });

    it('hides feed image after main image loads', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      const mainImage = screen.getByTestId('image-main');
      fireEvent.load(mainImage);

      expect(screen.queryByTestId('image-feed')).not.toBeInTheDocument();
    });

    it('shows main image with full styling after it loads', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      const mainImage = screen.getByTestId('image-main');
      fireEvent.load(mainImage);

      expect(mainImage).toHaveClass('max-h-[75dvh]');
      expect(mainImage).toHaveClass('w-full');
      expect(mainImage).toHaveClass('rounded-md');
      expect(mainImage).toHaveClass('object-contain');
      expect(mainImage).not.toHaveClass('size-0');
    });

    it('sets id on main image after it loads', () => {
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} id="carousel-image-1" />);

      const mainImage = screen.getByTestId('image-main');
      fireEvent.load(mainImage);

      expect(mainImage).toHaveAttribute('id', 'carousel-image-1');
    });
  });

  describe('GIF handling', () => {
    it('shows main image immediately for GIFs with full styling', () => {
      const gif = createMockGif();
      render(<PostAttachmentsCarouselImage image={gif} id="test-id" />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveClass('max-h-[75dvh]');
      expect(mainImage).not.toHaveClass('size-0');
    });

    it('has id set immediately for GIFs', () => {
      const gif = createMockGif();
      render(<PostAttachmentsCarouselImage image={gif} id="gif-carousel-1" />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveAttribute('id', 'gif-carousel-1');
    });
  });

  describe('Image types', () => {
    it('handles PNG images correctly', () => {
      const png = createMockImage({ type: 'image/png' });
      render(<PostAttachmentsCarouselImage image={png} id="test-id" />);

      expect(screen.getByTestId('image-feed')).toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('handles WebP images correctly', () => {
      const webp = createMockImage({ type: 'image/webp' });
      render(<PostAttachmentsCarouselImage image={webp} id="test-id" />);

      expect(screen.getByTestId('image-feed')).toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });

    it('handles SVG images correctly', () => {
      const svg = createMockImage({ type: 'image/svg+xml' });
      render(<PostAttachmentsCarouselImage image={svg} id="test-id" />);

      expect(screen.getByTestId('image-feed')).toBeInTheDocument();
      expect(screen.getByTestId('image-main')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles image with special characters in name', () => {
      const image = createMockImage({ name: 'my photo (1).jpg' });
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

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
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

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
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveAttribute('src', 'https://example.com/my%20main-image.jpg');
    });

    it('handles empty string name', () => {
      const image = createMockImage({ name: '' });
      render(<PostAttachmentsCarouselImage image={image} id="test-id" />);

      const mainImage = screen.getByTestId('image-main');
      expect(mainImage).toHaveAttribute('alt', '');
    });

    it('handles very long id', () => {
      const longId = 'carousel-image-' + 'a'.repeat(100);
      const image = createMockImage();
      render(<PostAttachmentsCarouselImage image={image} id={longId} />);

      const mainImage = screen.getByTestId('image-main');
      fireEvent.load(mainImage);

      expect(mainImage).toHaveAttribute('id', longId);
    });
  });
});

describe('PostAttachmentsCarouselImage - Snapshots', () => {
  it('matches snapshot before main image loads (showing placeholder)', () => {
    const image = createMockImage({
      name: 'snapshot-test.jpg',
      urls: {
        main: 'https://example.com/main.jpg',
        feed: 'https://example.com/feed.jpg',
      },
    });
    const { container } = render(<PostAttachmentsCarouselImage image={image} id="snapshot-id" />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot after main image loads', () => {
    const image = createMockImage({
      name: 'snapshot-loaded.jpg',
      urls: {
        main: 'https://example.com/main-loaded.jpg',
        feed: 'https://example.com/feed-loaded.jpg',
      },
    });
    const { container } = render(<PostAttachmentsCarouselImage image={image} id="snapshot-loaded-id" />);

    const mainImage = screen.getByTestId('image-main');
    fireEvent.load(mainImage);

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for GIF image (no placeholder)', () => {
    const gif = createMockGif({
      name: 'snapshot-animation.gif',
      urls: {
        main: 'https://example.com/main-animation.gif',
        feed: 'https://example.com/feed-animation.gif',
      },
    });
    const { container } = render(<PostAttachmentsCarouselImage image={gif} id="snapshot-gif-id" />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for PNG image before loading', () => {
    const png = createMockImage({
      type: 'image/png',
      name: 'snapshot-png.png',
      urls: {
        main: 'https://example.com/main-image.png',
        feed: 'https://example.com/feed-image.png',
      },
    });
    const { container } = render(<PostAttachmentsCarouselImage image={png} id="snapshot-png-id" />);
    expect(container).toMatchSnapshot();
  });
});
