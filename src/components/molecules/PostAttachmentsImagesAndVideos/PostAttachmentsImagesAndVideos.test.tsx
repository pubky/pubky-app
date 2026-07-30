import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
      onClick,
      'aria-describedby': ariaDescribedBy,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      hiddenTitle?: string;
      showCloseButton?: boolean;
      overrideDefaults?: boolean;
      centered?: boolean;
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

// Mock useToast
const mockToast = vi.fn();
vi.mock('@/molecules/PostAttachmentsCarouselImage/PostAttachmentsCarouselImage', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/molecules/PostAttachmentsCarouselImage/PostAttachmentsCarouselImage')>();
  return {
    ...actual,
    PostAttachmentsCarouselImage: ({
      id,
      image,
      'data-testid': dataTestId,
    }: {
      id: string;
      image: AttachmentConstructed;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId || 'carousel-image'} id={id}>
        <img src={image.urls.main} alt={image.name} />
      </div>
    ),
  };
});

vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    useToast: () => ({ toast: mockToast }),
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

vi.mock('@/atoms/Carousel/Carousel', () => {
  return {
    Carousel: ({
      children,
      opts,
      setApi,
      className,
    }: {
      children: React.ReactNode;
      opts?: { startIndex?: number; loop?: boolean; duration?: number; watchDrag?: boolean };
      setApi?: (api: unknown) => void;
      className?: string;
    }) => {
      // Simulate setting the API in useEffect to avoid infinite re-renders
      useEffect(() => {
        if (setApi) {
          setApi({
            selectedScrollSnap: () => 0,
            on: vi.fn(),
          });
        }
      }, [setApi]);
      return (
        <div
          data-testid="carousel"
          data-start-index={opts?.startIndex}
          data-loop={opts?.loop}
          data-duration={opts?.duration}
          data-watch-drag={opts?.watchDrag}
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
    // Mock fullscreenEnabled
    Object.defineProperty(document, 'fullscreenEnabled', {
      value: true,
      writable: true,
    });
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

    it('renders dialog close button when open', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(screen.getByTestId('dialog-close')).toBeInTheDocument();
    });

    it('renders X icon in close button when open', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const close = screen.getByTestId('dialog-close');
      expect(close.querySelector('.lucide-x')).toBeInTheDocument();
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
  });

  describe('Fullscreen functionality', () => {
    it('renders fullscreen button when dialog is open', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const buttons = screen.getAllByTestId('button');
      const fullscreenButton = buttons.find((btn) => btn.textContent?.includes('Fullscreen'));
      expect(fullscreenButton).toBeInTheDocument();
    });

    it('renders maximize icon in fullscreen button', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const fullscreenButton = screen
        .getAllByTestId('button')
        .find((btn) => btn.textContent?.includes('Fullscreen')) as HTMLButtonElement;
      expect(fullscreenButton.querySelector('.lucide-maximize')).toBeInTheDocument();
    });

    it('fullscreen button is enabled when fullscreenEnabled is true', () => {
      setDialogOpen(true);
      Object.defineProperty(document, 'fullscreenEnabled', { value: true });
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const buttons = screen.getAllByTestId('button');
      const fullscreenButton = buttons.find((btn) => btn.textContent?.includes('Fullscreen'));
      expect(fullscreenButton).not.toBeDisabled();
    });

    it('fullscreen button is disabled when fullscreenEnabled is false', () => {
      setDialogOpen(true);
      Object.defineProperty(document, 'fullscreenEnabled', { value: false });
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const buttons = screen.getAllByTestId('button');
      const fullscreenButton = buttons.find((btn) => btn.textContent?.includes('Fullscreen'));
      expect(fullscreenButton).toBeDisabled();
    });

    it('calls requestFullscreen when fullscreen button is clicked', () => {
      setDialogOpen(true);
      const mockRequestFullscreen = vi.fn().mockResolvedValue(undefined);
      const mockElement = document.createElement('div');
      mockElement.requestFullscreen = mockRequestFullscreen;
      mockElement.id = 'media-item-0';
      document.body.appendChild(mockElement);

      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const buttons = screen.getAllByTestId('button');
      const fullscreenButton = buttons.find((btn) => btn.textContent?.includes('Fullscreen'));
      fireEvent.click(fullscreenButton!);

      expect(mockRequestFullscreen).toHaveBeenCalled();

      document.body.removeChild(mockElement);
    });

    it('shows toast error when fullscreen fails', async () => {
      setDialogOpen(true);
      const mockError = new Error('Fullscreen not allowed');
      const mockRequestFullscreen = vi.fn().mockRejectedValue(mockError);
      const mockElement = document.createElement('div');
      mockElement.requestFullscreen = mockRequestFullscreen;
      mockElement.id = 'media-item-0';
      document.body.appendChild(mockElement);

      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const buttons = screen.getAllByTestId('button');
      const fullscreenButton = buttons.find((btn) => btn.textContent?.includes('Fullscreen'));
      fireEvent.click(fullscreenButton!);

      // Wait for the promise rejection to be handled
      await vi.waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          variant: 'error',
          description: mockError.message,
        });
      });

      document.body.removeChild(mockElement);
    });
  });

  describe('Fullscreen swipe disable', () => {
    it('sets watchDrag to true when exiting fullscreen', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      // Simulate entering fullscreen first
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.createElement('div'),
        configurable: true,
      });
      fireEvent(document, new Event('fullscreenchange'));

      // Simulate exiting fullscreen
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      fireEvent(document, new Event('fullscreenchange'));

      const carousel = screen.getByTestId('carousel');
      expect(carousel).toHaveAttribute('data-watch-drag', 'true');
    });

    it('sets watchDrag to false when entering fullscreen', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      // Simulate entering fullscreen
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.createElement('div'),
        configurable: true,
      });
      fireEvent(document, new Event('fullscreenchange'));

      const carousel = screen.getByTestId('carousel');
      expect(carousel).toHaveAttribute('data-watch-drag', 'false');
    });

    it('adds fullscreenchange event listener on mount', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      expect(addEventListenerSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('removes fullscreenchange event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      const imagesAndVideos = [createMockImage()];
      const { unmount } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
      removeEventListenerSpy.mockRestore();
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

    it('fullscreen button has secondary variant', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const buttons = screen.getAllByTestId('button');
      const fullscreenButton = buttons.find((btn) => btn.textContent?.includes('Fullscreen'));
      expect(fullscreenButton).toHaveAttribute('data-variant', 'secondary');
    });

    it('fullscreen button has sm size', () => {
      setDialogOpen(true);
      const imagesAndVideos = [createMockImage()];
      render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);

      const buttons = screen.getAllByTestId('button');
      const fullscreenButton = buttons.find((btn) => btn.textContent?.includes('Fullscreen'));
      expect(fullscreenButton).toHaveAttribute('data-size', 'sm');
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

describe('PostAttachmentsImagesAndVideos - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogOpenState = false;
    dialogOpenStateSetByTest = false;
    Object.defineProperty(document, 'fullscreenEnabled', {
      value: true,
      writable: true,
    });
  });

  it('matches snapshot with single image', () => {
    const imagesAndVideos = [
      createMockImage({
        name: 'snapshot-image.jpg',
        urls: {
          main: 'https://example.com/snapshot-main.jpg',
          feed: 'https://example.com/snapshot-feed.jpg',
        },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple images', () => {
    const imagesAndVideos = [
      createMockImage({
        name: 'image1.jpg',
        urls: { main: 'https://example.com/image1.jpg', feed: 'https://example.com/image1-feed.jpg' },
      }),
      createMockImage({
        name: 'image2.jpg',
        urls: { main: 'https://example.com/image2.jpg', feed: 'https://example.com/image2-feed.jpg' },
      }),
      createMockImage({
        name: 'image3.jpg',
        urls: { main: 'https://example.com/image3.jpg', feed: 'https://example.com/image3-feed.jpg' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with single video', () => {
    const imagesAndVideos = [
      createMockVideo({
        name: 'snapshot-video.mp4',
        urls: { main: 'https://example.com/snapshot-video.mp4' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with mixed images and videos', () => {
    const imagesAndVideos = [
      createMockImage({
        name: 'mixed-image.jpg',
        urls: { main: 'https://example.com/mixed-main.jpg', feed: 'https://example.com/mixed-feed.jpg' },
      }),
      createMockVideo({
        name: 'mixed-video.mp4',
        urls: { main: 'https://example.com/mixed-video.mp4' },
      }),
      createMockGif({
        name: 'mixed-gif.gif',
        urls: { main: 'https://example.com/mixed-gif.gif', feed: 'https://example.com/mixed-gif-feed.jpg' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty array', () => {
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={[]} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with GIF image', () => {
    const imagesAndVideos = [
      createMockGif({
        name: 'animated.gif',
        urls: { main: 'https://example.com/animated.gif', feed: 'https://example.com/animated-thumb.jpg' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with four images (2x2 grid)', () => {
    const imagesAndVideos = [
      createMockImage({
        name: 'grid1.jpg',
        urls: { main: 'https://example.com/grid1.jpg', feed: 'https://example.com/grid1-feed.jpg' },
      }),
      createMockImage({
        name: 'grid2.jpg',
        urls: { main: 'https://example.com/grid2.jpg', feed: 'https://example.com/grid2-feed.jpg' },
      }),
      createMockImage({
        name: 'grid3.jpg',
        urls: { main: 'https://example.com/grid3.jpg', feed: 'https://example.com/grid3-feed.jpg' },
      }),
      createMockImage({
        name: 'grid4.jpg',
        urls: { main: 'https://example.com/grid4.jpg', feed: 'https://example.com/grid4-feed.jpg' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple videos', () => {
    const imagesAndVideos = [
      createMockVideo({
        name: 'video1.mp4',
        urls: { main: 'https://example.com/video1.mp4' },
      }),
      createMockVideo({
        name: 'video2.mp4',
        urls: { main: 'https://example.com/video2.mp4' },
      }),
      createMockVideo({
        name: 'video3.mp4',
        urls: { main: 'https://example.com/video3.mp4' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with dialog open showing single image carousel', () => {
    setDialogOpen(true);
    const imagesAndVideos = [
      createMockImage({
        name: 'dialog-image.jpg',
        urls: { main: 'https://example.com/dialog-main.jpg', feed: 'https://example.com/dialog-feed.jpg' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with dialog open showing multiple images carousel', () => {
    setDialogOpen(true);
    const imagesAndVideos = [
      createMockImage({
        name: 'carousel1.jpg',
        urls: { main: 'https://example.com/carousel1.jpg', feed: 'https://example.com/carousel1-feed.jpg' },
      }),
      createMockImage({
        name: 'carousel2.jpg',
        urls: { main: 'https://example.com/carousel2.jpg', feed: 'https://example.com/carousel2-feed.jpg' },
      }),
      createMockImage({
        name: 'carousel3.jpg',
        urls: { main: 'https://example.com/carousel3.jpg', feed: 'https://example.com/carousel3-feed.jpg' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with dialog open showing mixed media carousel', () => {
    setDialogOpen(true);
    const imagesAndVideos = [
      createMockImage({
        name: 'mixed-image.jpg',
        urls: { main: 'https://example.com/mixed-main.jpg', feed: 'https://example.com/mixed-feed.jpg' },
      }),
      createMockVideo({
        name: 'mixed-video.mp4',
        urls: { main: 'https://example.com/mixed-video.mp4' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with dialog open showing videos carousel', () => {
    setDialogOpen(true);
    const imagesAndVideos = [
      createMockVideo({
        name: 'carousel-video1.mp4',
        urls: { main: 'https://example.com/carousel-video1.mp4' },
      }),
      createMockVideo({
        name: 'carousel-video2.mp4',
        urls: { main: 'https://example.com/carousel-video2.mp4' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with dialog open showing single video carousel', () => {
    setDialogOpen(true);
    const imagesAndVideos = [
      createMockVideo({
        name: 'single-carousel-video.mp4',
        urls: { main: 'https://example.com/single-carousel-video.mp4' },
      }),
    ];
    const { container } = render(<PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
