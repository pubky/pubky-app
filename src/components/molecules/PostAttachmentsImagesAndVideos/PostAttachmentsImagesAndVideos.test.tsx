import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';
import { PostAttachmentsImagesAndVideos } from './PostAttachmentsImagesAndVideos';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => {
      // Only update dialogOpenState if it wasn't explicitly set by a test
      if (!dialogOpenStateSetByTest) {
        dialogOpenState = open;
      }
      return (
        <div data-testid="dialog" data-open={dialogOpenState}>
          {children}
        </div>
      );
    },
    DialogTrigger: ({
      children,
      asChild,
      className,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
      className?: string;
    }) => (
      <div data-testid="dialog-trigger" data-aschild={asChild} className={className}>
        {children}
      </div>
    ),
    DialogContent: ({
      children,
      hiddenTitle,
      showCloseButton,
      overrideDefaults,
      centered,
      className,
      onClick,
      'aria-describedby': ariaDescribedBy,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      hiddenTitle?: string;
      showCloseButton?: boolean;
      overrideDefaults?: boolean;
      centered?: boolean;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
      'aria-describedby'?: string;
      'data-testid'?: string;
    }) => {
      // Only render content when dialog is open (mimics real DialogContent behavior)
      if (!dialogOpenState) {
        return null;
      }
      return (
        <div
          data-testid={dataTestId || 'dialog-content'}
          data-hidden-title={hiddenTitle}
          data-show-close-button={showCloseButton}
          data-override-defaults={overrideDefaults}
          data-centered={centered}
          className={className}
          aria-describedby={ariaDescribedBy}
          onClick={onClick}
        >
          {children}
        </div>
      );
    },
    DialogClose: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <button data-testid="dialog-close" className={className}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/molecules/PostAttachmentsCarouselImage/PostAttachmentsCarouselImage', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/molecules/PostAttachmentsCarouselImage/PostAttachmentsCarouselImage')>();
  return {
    ...actual,
    // Keeps its own zoom and shows it on `data-zoomed`, as the real frame does
    PostAttachmentsCarouselImage: function MockCarouselImage({
      image,
      isActive,
      'data-testid': dataTestId,
    }: {
      image: AttachmentConstructed;
      isActive?: boolean;
      'data-testid'?: string;
    }) {
      const [isZoomed, setIsZoomed] = useState(false);
      return (
        <div data-testid={dataTestId || 'carousel-image'} data-active={isActive} data-zoomed={isZoomed}>
          <img src={image.urls.main} alt={image.name} />
          <button data-testid={`zoom-in-${image.name}`} onClick={() => setIsZoomed(true)} />
          <button data-testid={`zoom-out-${image.name}`} onClick={() => setIsZoomed(false)} />
        </div>
      );
    },
  };
});

// Track dialog open state for conditional rendering
// When set to true by a test, it won't be overridden by the component
let dialogOpenState = false;
let dialogOpenStateSetByTest = false;

// Mock @/atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      disabled,
      variant,
      size,
      className,
      overrideDefaults,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      variant?: string;
      size?: string;
      className?: string;
      overrideDefaults?: boolean;
      'data-testid'?: string;
    }) => (
      <button
        data-testid={dataTestId || 'button'}
        onClick={onClick}
        disabled={disabled}
        data-variant={variant}
        data-size={size}
        className={className}
        data-override-defaults={overrideDefaults}
      >
        {children}
      </button>
    ),
  };
});

// Controllable carousel API state so tests can drive embla events ('select',
// 'reInit') and the selected snap position
type WatchDrag = boolean | ((api: unknown, event: MouseEvent | TouchEvent) => boolean | void);
const carouselApiState: {
  handlers: Record<string, () => void>;
  selectedSnap: number;
  opts?: { watchDrag?: WatchDrag };
} = {
  handlers: {},
  selectedSnap: 0,
};

/** The picture inside a lightbox slide; the grid thumbnail carries the same alt text. */
const slidePicture = (name: string) =>
  screen.getAllByTestId('carousel-image').flatMap((slide) => [...slide.querySelectorAll(`img[alt="${name}"]`)])[0];

/** What embla would decide for a drag starting now on `target`: watchDrag is read per pointer down, as embla does. */
const canSwipe = (target?: Element, event: MouseEvent | TouchEvent = new MouseEvent('mousedown')) => {
  if (target) Object.defineProperty(event, 'target', { value: target });
  const watchDrag = carouselApiState.opts?.watchDrag ?? true;
  return typeof watchDrag === 'function' ? watchDrag(undefined, event) !== false : watchDrag;
};

vi.mock('@/atoms/Carousel/Carousel', () => {
  return {
    Carousel: ({
      children,
      opts,
      setApi,
      className,
      ref,
      tabIndex = 0,
    }: {
      children: React.ReactNode;
      opts?: { startIndex?: number; loop?: boolean; duration?: number; watchDrag?: WatchDrag };
      setApi?: (api: unknown) => void;
      className?: string;
      ref?: React.Ref<HTMLDivElement>;
      tabIndex?: number;
    }) => {
      carouselApiState.opts = opts;
      // Simulate setting the API in useEffect to avoid infinite re-renders
      useEffect(() => {
        if (setApi) {
          setApi({
            selectedScrollSnap: () => carouselApiState.selectedSnap,
            on: (event: string, handler: () => void) => {
              carouselApiState.handlers[event] = handler;
            },
            off: vi.fn(),
          });
        }
      }, [setApi]);
      return (
        <div
          ref={ref}
          tabIndex={tabIndex}
          data-testid="carousel"
          data-start-index={opts?.startIndex}
          data-loop={opts?.loop}
          data-duration={opts?.duration}
          className={className}
        >
          {children}
        </div>
      );
    },
    CarouselContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="carousel-content" className={className}>
        {children}
      </div>
    ),
    CarouselItem: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="carousel-item" className={className}>
        {children}
      </div>
    ),
    CarouselPrevious: ({ className }: { className?: string }) => (
      <button data-testid="carousel-previous" className={className}>
        Previous
      </button>
    ),
    CarouselNext: ({ className }: { className?: string }) => (
      <button data-testid="carousel-next" className={className}>
        Next
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      display,
      onClick,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      className?: string;
      display?: string;
      onClick?: (e: React.MouseEvent) => void;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId || 'container'} className={className} data-display={display} onClick={onClick}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Image/Image', () => {
  return {
    Image: ({
      src,
      alt,
      fill,
      className,
      'data-testid': dataTestId,
    }: {
      src: string;
      alt: string;
      fill?: boolean;
      className?: string;
      'data-testid'?: string;
    }) => <img data-testid={dataTestId || 'image'} src={src} alt={alt} data-fill={fill} className={className} />,
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
      <span data-testid="typography" data-size={size} className={className}>
        {children}
      </span>
    ),
  };
});

vi.mock('@/atoms/Video/Video', () => {
  return {
    Video: ({
      src,
      pauseVideo,
      className,
      id,
      onClick,
      'data-testid': dataTestId,
    }: {
      src: string;
      pauseVideo?: boolean;
      className?: string;
      id?: string;
      onClick?: (e: React.MouseEvent) => void;
      'data-testid'?: string;
    }) => (
      <video
        data-testid={dataTestId || 'video'}
        src={src}
        data-pause-video={pauseVideo}
        className={className}
        id={id}
        onClick={onClick}
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

const createMockVideo = (overrides: Partial<AttachmentConstructed> = {}): AttachmentConstructed => ({
  type: 'video/mp4',
  name: 'test-video.mp4',
  urls: {
    main: 'https://example.com/video.mp4',
  },
  ...overrides,
});

// Helper to set dialog open state from tests
const setDialogOpen = (open: boolean) => {
  dialogOpenState = open;
  dialogOpenStateSetByTest = true;
};

describe('PostAttachmentsImagesAndVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogOpenState = false;
    dialogOpenStateSetByTest = false;
    carouselApiState.handlers = {};
    carouselApiState.selectedSnap = 0;
    carouselApiState.opts = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders without crashing', () => {
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('dialog')).toBeInTheDocument();
    });

    it('renders a single image', () => {
      const imagesAndVideos = [
        createMockImage({
          urls: { main: 'https://example.com/photo.jpg', feed: 'https://example.com/photo-feed.jpg' },
        }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const images = screen.getAllByTestId('image');
      expect(images).toHaveLength(1);
      expect(images[0]).toHaveAttribute('src', 'https://example.com/photo-feed.jpg');
    });

    it('renders multiple images', () => {
      const imagesAndVideos = [
        createMockImage({
          urls: { main: 'https://example.com/image1.jpg', feed: 'https://example.com/image1-feed.jpg' },
        }),
        createMockImage({
          urls: { main: 'https://example.com/image2.jpg', feed: 'https://example.com/image2-feed.jpg' },
        }),
        createMockImage({
          urls: { main: 'https://example.com/image3.jpg', feed: 'https://example.com/image3-feed.jpg' },
        }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const images = screen.getAllByTestId('image');
      expect(images).toHaveLength(3);
    });

    it('uses a constrained smaller grid for inline media', () => {
      const imagesAndVideos = [createMockImage(), createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} variant="list" />);

      const grid = screen.getAllByTestId('container').find((element) => element.classList.contains('grid'));
      expect(grid).toHaveClass('grid');
      expect(grid).toHaveClass('grid-cols-[minmax(0,theme(spacing.48))]');
      expect(grid).toHaveClass('sm:grid-cols-[repeat(2,theme(spacing.48))]');
      expect(grid).toHaveClass('self-start');
      expect(grid).toHaveClass('justify-self-start');
      expect(grid).not.toHaveClass('mx-auto');

      const firstTrigger = screen.getAllByTestId('dialog-trigger')[0];
      expect(firstTrigger).toHaveClass('aspect-video');
      expect(firstTrigger).toHaveClass('h-[theme(spacing.27)]');
      expect(firstTrigger).not.toHaveClass('w-full');
      expect(firstTrigger).not.toHaveClass('md:h-44');
      expect(firstTrigger).not.toHaveClass('h-52');
    });

    it('shows only four inline media items and overlays the remaining count on the last visible item', () => {
      const imagesAndVideos = [
        createMockImage({ name: 'image1.jpg' }),
        createMockImage({ name: 'image2.jpg' }),
        createMockImage({ name: 'image3.jpg' }),
        createMockImage({ name: 'image4.jpg' }),
        createMockImage({ name: 'image5.jpg' }),
        createMockImage({ name: 'image6.jpg' }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} variant="list" />);

      expect(screen.getAllByTestId('image')).toHaveLength(4);
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('renders a single video', () => {
      const imagesAndVideos = [createMockVideo({ urls: { main: 'https://example.com/clip.mp4' } })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const videos = screen.getAllByTestId('video');
      expect(videos).toHaveLength(1);
      expect(videos[0]).toHaveAttribute('src', 'https://example.com/clip.mp4');
    });

    it('renders mixed images and videos', () => {
      const imagesAndVideos = [
        createMockImage({
          urls: { main: 'https://example.com/image.jpg', feed: 'https://example.com/image-feed.jpg' },
        }),
        createMockVideo({ urls: { main: 'https://example.com/video.mp4' } }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const images = screen.getAllByTestId('image');
      const videos = screen.getAllByTestId('video');
      expect(images).toHaveLength(1);
      expect(videos).toHaveLength(1);
    });

    it('renders empty container when no media provided', () => {
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={[]} />);

      const dialog = screen.getByTestId('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });

  describe('Image rendering', () => {
    it('renders feed URL for regular images', () => {
      const imagesAndVideos = [
        createMockImage({
          urls: {
            main: 'https://example.com/main-hd.jpg',
            feed: 'https://example.com/feed-thumb.jpg',
          },
        }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const image = screen.getByTestId('image');
      expect(image).toHaveAttribute('src', 'https://example.com/feed-thumb.jpg');
    });

    it('renders main URL for GIF images', () => {
      const imagesAndVideos = [
        createMockGif({
          urls: {
            main: 'https://example.com/animation.gif',
            feed: 'https://example.com/animation-thumb.jpg',
          },
        }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const image = screen.getByTestId('image');
      expect(image).toHaveAttribute('src', 'https://example.com/animation.gif');
    });

    it('renders correct alt text for images', () => {
      const imagesAndVideos = [createMockImage({ name: 'my-photo.jpg' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const image = screen.getByTestId('image');
      expect(image).toHaveAttribute('alt', 'my-photo.jpg');
    });

    it('wraps images in dialog trigger', () => {
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const dialogTrigger = screen.getByTestId('dialog-trigger');
      expect(dialogTrigger).toBeInTheDocument();
    });
  });

  describe('Video rendering', () => {
    it('renders video with correct src', () => {
      const imagesAndVideos = [createMockVideo({ urls: { main: 'https://example.com/movie.mp4' } })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const video = screen.getByTestId('video');
      expect(video).toHaveAttribute('src', 'https://example.com/movie.mp4');
    });

    it('does not wrap videos in dialog trigger', () => {
      const imagesAndVideos = [createMockVideo()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      // Should only have video, no dialog trigger for videos in grid
      const dialogTriggers = screen.queryAllByTestId('dialog-trigger');
      expect(dialogTriggers).toHaveLength(0);
    });
  });

  describe('Dialog functionality', () => {
    it('renders dialog content with carousel when open', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('carousel')).toBeInTheDocument();
    });

    it('renders no close button, so the lightbox is dismissed by tapping outside it', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('dialog-content')).toHaveAttribute('data-show-close-button', 'false');
      expect(screen.queryByTestId('dialog-close')).not.toBeInTheDocument();
    });

    it('spans the full mobile width with no horizontal gutter', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('dialog-content')).toHaveClass('mx-0', 'w-full', 'sm:mx-4', 'sm:w-auto');
      expect(screen.getByTestId('carousel')).toHaveClass('w-full', 'max-w-full');
      expect(screen.getByTestId('carousel')).not.toHaveClass('max-w-80');
    });

    it('renders dialog content with hidden title for accessibility', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const dialogContent = screen.getByTestId('dialog-content');
      expect(dialogContent).toHaveAttribute('data-hidden-title', 'Post Attachments Media Carousel');
    });

    it('opts the media preview out of the mobile drawer so it stays centered', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('dialog-content')).toHaveAttribute('data-centered', 'true');
    });

    it('does not render dialog content when closed', () => {
      setDialogOpen(false);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument();
    });
  });

  describe('Carousel functionality', () => {
    it('renders carousel with loop option', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const carousel = screen.getByTestId('carousel');
      expect(carousel).toHaveAttribute('data-loop', 'true');
    });

    it('renders carousel with duration option', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const carousel = screen.getByTestId('carousel');
      expect(carousel).toHaveAttribute('data-duration', '15');
    });

    it('renders carousel items for each media', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage(), createMockVideo()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const carouselItems = screen.getAllByTestId('carousel-item');
      expect(carouselItems).toHaveLength(3);
    });

    it('renders carousel navigation buttons for multiple items', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('carousel-previous')).toBeInTheDocument();
      expect(screen.getByTestId('carousel-next')).toBeInTheDocument();
    });

    it('does not render navigation buttons for single item', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.queryByTestId('carousel-previous')).not.toBeInTheDocument();
      expect(screen.queryByTestId('carousel-next')).not.toBeInTheDocument();
    });

    it('renders counter for multiple items', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage(), createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByText('1/3')).toBeInTheDocument();
    });

    it('does not render counter for single item', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.queryByText('1/1')).not.toBeInTheDocument();
    });

    it('resyncs the current index when the carousel re-initializes after the slide list shrinks', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage(), createMockImage()];
      const { rerender } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      // User swipes to the last slide
      carouselApiState.selectedSnap = 2;
      act(() => carouselApiState.handlers['select']?.());
      expect(screen.getByText('3/3')).toBeInTheDocument();

      // An edit removes an attachment while the lightbox is open — embla clamps
      // its internal index and emits only 'reInit', never 'select'
      rerender(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos.slice(0, 2)} />);
      carouselApiState.selectedSnap = 1;
      act(() => carouselApiState.handlers['reInit']?.());

      expect(screen.getByText('2/2')).toBeInTheDocument();
    });
  });

  describe('Zoom swipe disable', () => {
    it('turns swiping off while the visible image is zoomed, so a drag pans it', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage({ name: 'image-0.jpg' }), createMockImage({ name: 'image-1.jpg' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
      const picture = slidePicture('image-0.jpg');

      expect(canSwipe(picture)).toBe(true);

      fireEvent.click(screen.getByTestId('zoom-in-image-0.jpg'));
      expect(canSwipe(picture)).toBe(false);

      fireEvent.click(screen.getByTestId('zoom-out-image-0.jpg'));
      expect(canSwipe(picture)).toBe(true);
    });

    it('keeps swiping off on the zoomed image when another slide is removed', () => {
      setDialogOpen(true);
      const images = [
        createMockImage({ name: 'image-0.jpg', urls: { main: 'https://example.com/0.jpg' } }),
        createMockImage({ name: 'image-1.jpg', urls: { main: 'https://example.com/1.jpg' } }),
        createMockImage({ name: 'image-2.jpg', urls: { main: 'https://example.com/2.jpg' } }),
      ];
      const { rerender } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={images} />);

      fireEvent.click(screen.getByTestId('zoom-in-image-0.jpg'));
      expect(canSwipe(slidePicture('image-0.jpg'))).toBe(false);

      rerender(<PostAttachmentsImagesAndVideos imagesAndVideos={images.slice(0, 2)} />);
      expect(canSwipe(slidePicture('image-0.jpg'))).toBe(false);
    });

    it('decides swiping per drag, so zooming in or out never re-initialises the carousel', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage({ name: 'image-0.jpg' }), createMockImage({ name: 'image-1.jpg' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
      const before = carouselApiState.opts?.watchDrag;

      fireEvent.click(screen.getByTestId('zoom-in-image-0.jpg'));
      const after = carouselApiState.opts?.watchDrag;
      expect(canSwipe(slidePicture('image-0.jpg'))).toBe(false);
      // embla re-initialises when an option changes, and compares a function option by its source text
      expect(typeof after).toBe('function');
      expect(String(after)).toBe(String(before));
    });

    it('does not start a swipe on the second finger of a pinch at the fitted size', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
      // jsdom has TouchEvent but no Touch constructor, so the finger list is set on the event directly
      const touchStart = (fingers: number) => {
        const event = new TouchEvent('touchstart');
        Object.defineProperty(event, 'touches', { value: { length: fingers } });
        return event;
      };

      expect(canSwipe(undefined, touchStart(1))).toBe(true);
      expect(canSwipe(undefined, touchStart(2))).toBe(false);
    });

    it('gives a slide a fresh image component when another attachment takes its place, so no zoom carries over', () => {
      setDialogOpen(true);
      const first = createMockImage({ urls: { main: 'https://example.com/first.jpg' } });
      const second = createMockImage({ urls: { main: 'https://example.com/second.jpg' } });
      const { rerender } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={[first, second]} />);
      const before = screen.getAllByTestId('carousel-image')[0];

      rerender(<PostAttachmentsImagesAndVideos imagesAndVideos={[second]} />);
      const after = screen.getAllByTestId('carousel-image')[0];
      expect(after.querySelector('img')).toHaveAttribute('src', 'https://example.com/second.jpg');
      expect(after).not.toBe(before);
    });

    it('lets only the visible slide zoom', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage(), createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const slides = screen.getAllByTestId('carousel-image');
      expect(slides[0]).toHaveAttribute('data-active', 'true');
      expect(slides[1]).toHaveAttribute('data-active', 'false');
    });
  });

  describe('Click behavior', () => {
    it('stops event propagation when image button is clicked', () => {
      const parentClickHandler = vi.fn();
      const imagesAndVideos = [createMockImage()];

      render(
        <div onClick={parentClickHandler}>
          <PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />
        </div>,
      );

      // Click on the image button (which has stopPropagation)
      const button = screen.getByTestId('button');
      fireEvent.click(button);
      expect(parentClickHandler).not.toHaveBeenCalled();
    });

    it('stops event propagation when video is clicked', () => {
      const parentClickHandler = vi.fn();
      const imagesAndVideos = [createMockVideo()];

      render(
        <div onClick={parentClickHandler}>
          <PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />
        </div>,
      );

      // Click on the video element (which has stopPropagation)
      const video = screen.getByTestId('video');
      fireEvent.click(video);
      expect(parentClickHandler).not.toHaveBeenCalled();
    });

    it('stops event propagation when dialog content is clicked', () => {
      setDialogOpen(true);
      const parentClickHandler = vi.fn();
      const imagesAndVideos = [createMockImage()];

      render(
        <div onClick={parentClickHandler}>
          <PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />
        </div>,
      );

      const dialogContent = screen.getByTestId('dialog-content');
      fireEvent.click(dialogContent);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Image types', () => {
    it('handles JPEG images correctly', () => {
      const imagesAndVideos = [createMockImage({ type: 'image/jpeg' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
      expect(screen.getByTestId('dialog-trigger')).toBeInTheDocument();
    });

    it('handles PNG images correctly', () => {
      const imagesAndVideos = [createMockImage({ type: 'image/png' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
    });

    it('handles WebP images correctly', () => {
      const imagesAndVideos = [createMockImage({ type: 'image/webp' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
    });

    it('handles SVG images correctly', () => {
      const imagesAndVideos = [createMockImage({ type: 'image/svg+xml' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('image')).toBeInTheDocument();
    });
  });

  describe('Video types', () => {
    it('handles MP4 videos correctly', () => {
      const imagesAndVideos = [createMockVideo({ type: 'video/mp4' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('video')).toBeInTheDocument();
    });

    it('handles WebM videos correctly', () => {
      const imagesAndVideos = [createMockVideo({ type: 'video/webm' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('video')).toBeInTheDocument();
    });

    it('handles OGG videos correctly', () => {
      const imagesAndVideos = [createMockVideo({ type: 'video/ogg' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('video')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles media with special characters in name', () => {
      const imagesAndVideos = [createMockImage({ name: 'my photo (1) - final.jpg' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const image = screen.getByTestId('image');
      expect(image).toHaveAttribute('alt', 'my photo (1) - final.jpg');
    });

    it('handles media with query parameters in URL', () => {
      const imagesAndVideos = [
        createMockImage({
          urls: {
            main: 'https://example.com/image.jpg?token=abc123',
            feed: 'https://example.com/image-feed.jpg?token=abc123',
          },
        }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const image = screen.getByTestId('image');
      expect(image).toHaveAttribute('src', 'https://example.com/image-feed.jpg?token=abc123');
    });

    it('handles media with encoded URL characters', () => {
      const imagesAndVideos = [
        createMockImage({
          urls: {
            main: 'https://example.com/my%20image.jpg',
            feed: 'https://example.com/my%20image-feed.jpg',
          },
        }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const image = screen.getByTestId('image');
      expect(image).toHaveAttribute('src', 'https://example.com/my%20image-feed.jpg');
    });

    it('handles unicode characters in media name', () => {
      const imagesAndVideos = [createMockImage({ name: '图片-фото-📷.jpg' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const image = screen.getByTestId('image');
      expect(image).toHaveAttribute('alt', '图片-фото-📷.jpg');
    });

    it('handles large number of media items', () => {
      setDialogOpen(true);
      const imagesAndVideos = Array.from({ length: 10 }, (_, i) =>
        createMockImage({
          name: `image${i}.jpg`,
          urls: { main: `https://example.com/image${i}.jpg`, feed: `https://example.com/image${i}-feed.jpg` },
        }),
      );
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const carouselItems = screen.getAllByTestId('carousel-item');
      expect(carouselItems).toHaveLength(10);
    });

    it('handles empty media name', () => {
      const imagesAndVideos = [createMockImage({ name: '' })];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const image = screen.getByTestId('image');
      expect(image).toHaveAttribute('alt', '');
    });
  });

  describe('Styling', () => {
    it('applies grid layout to container', () => {
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const containers = screen.getAllByTestId('container');
      const gridContainer = containers.find((c) => c.getAttribute('data-display') === 'grid');
      expect(gridContainer).toBeInTheDocument();
    });

    it('applies gap-3 class to grid container', () => {
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const containers = screen.getAllByTestId('container');
      const gridContainer = containers.find((c) => c.getAttribute('data-display') === 'grid');
      expect(gridContainer).toHaveClass('gap-3');
    });
  });

  describe('Video pause behavior', () => {
    it('does not pause video in grid when dialog is closed', () => {
      setDialogOpen(false);
      const imagesAndVideos = [createMockVideo()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      // Get the video in the grid
      const video = screen.getByTestId('video');
      expect(video).toHaveAttribute('data-pause-video', 'false');
    });

    it('pauses carousel videos that are not at current index', () => {
      setDialogOpen(true);
      const imagesAndVideos = [
        createMockVideo({ urls: { main: 'https://example.com/video1.mp4' } }),
        createMockVideo({ urls: { main: 'https://example.com/video2.mp4' } }),
        createMockVideo({ urls: { main: 'https://example.com/video3.mp4' } }),
      ];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      // In the carousel, videos not at currentIndex (0) should have pauseVideo=true
      // Videos at currentIndex (0) should have pauseVideo=false
      const videos = screen.getAllByTestId('video');
      // Grid videos (first 3) + Carousel videos (next 3)
      // Carousel videos are at indices 3, 4, 5
      // currentIndex is 0, so carousel video at index 0 (videos[3]) should NOT be paused
      // carousel videos at index 1 and 2 (videos[4], videos[5]) should be paused
      expect(videos[3]).toHaveAttribute('data-pause-video', 'false'); // currentIndex === 0
      expect(videos[4]).toHaveAttribute('data-pause-video', 'true'); // currentIndex !== 1
      expect(videos[5]).toHaveAttribute('data-pause-video', 'true'); // currentIndex !== 2
    });
  });
});
