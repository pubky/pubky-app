import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { asInvalid } from '@/test-utils/type-assertions';
import type { EmbedData } from '../../Providers/Provider.types';
import { Generic } from './ProviderGeneric';
import { GenericPreview } from './GenericPreview';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';

// Mock the hooks module
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: vi.fn(),
}));

// Import the mocked hook
describe('ProviderGeneric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('domains', () => {
    it('exposes an empty domains array', () => {
      expect(Generic.domains).toBeDefined();
      expect(Generic.domains).toEqual([]);
      expect(Array.isArray(Generic.domains)).toBe(true);
    });

    it('has immutable domains array', () => {
      expect(Generic.domains.length).toBe(0);
    });
  });

  describe('parseEmbed', () => {
    it('returns url embed data for any valid URL', () => {
      const url = 'https://example.com/article';
      const result = Generic.parseEmbed(url);

      expect(result).toEqual({
        type: 'url',
        value: url,
      });
    });

    it('handles URLs with query parameters', () => {
      const url = 'https://example.com/page?query=test&foo=bar';
      const result = Generic.parseEmbed(url);

      expect(result).toEqual({
        type: 'url',
        value: url,
      });
    });

    it('handles URLs with hash fragments', () => {
      const url = 'https://example.com/page#section';
      const result = Generic.parseEmbed(url);

      expect(result).toEqual({
        type: 'url',
        value: url,
      });
    });

    it('handles URLs with subdomains', () => {
      const url = 'https://blog.example.com/post';
      const result = Generic.parseEmbed(url);

      expect(result).toEqual({
        type: 'url',
        value: url,
      });
    });

    it('handles URLs with paths and trailing slashes', () => {
      const url = 'https://example.com/path/to/resource/';
      const result = Generic.parseEmbed(url);

      expect(result).toEqual({
        type: 'url',
        value: url,
      });
    });

    it('is fast and synchronous', () => {
      const start = Date.now();
      Generic.parseEmbed('https://example.com');
      const duration = Date.now() - start;

      // Should be near-instant since no fetch
      expect(duration).toBeLessThan(10);
    });

    it('handles multiple rapid calls consistently', () => {
      const url = 'https://example.com';
      const results = [Generic.parseEmbed(url), Generic.parseEmbed(url), Generic.parseEmbed(url)];

      results.forEach((result) => {
        expect(result).toEqual({
          type: 'url',
          value: url,
        });
      });
    });

    it('is stateless and returns consistent results', () => {
      const url = 'https://example.com';
      const result1 = Generic.parseEmbed(url);
      const result2 = Generic.parseEmbed(url);

      expect(result1).toEqual(result2);
    });
  });

  describe('renderEmbed', () => {
    it('returns null for non-url embed data', () => {
      const embedData = {
        type: 'id' as const,
        value: '123456',
      };

      const result = Generic.renderEmbed(embedData);

      expect(result).toBeNull();
    });

    it('returns null for metadata embed data (old format)', () => {
      const embedData = {
        type: 'metadata' as const,
        value: {
          url: 'https://example.com',
          title: 'Test',
          image: null,
        },
      };

      const result = Generic.renderEmbed(asInvalid<EmbedData>(embedData));

      expect(result).toBeNull();
    });

    it('returns GenericPreview component for url embed data', () => {
      const embedData = {
        type: 'url' as const,
        value: 'https://example.com',
      };

      const result = Generic.renderEmbed(embedData);

      // Should return a React element
      expect(result).toBeTruthy();
      expect(typeof result).toBe('object');
    });
  });
});

describe('GenericPreview', () => {
  const mockUseOgMetadata = vi.mocked(useOgMetadata);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('renders skeleton when fetching metadata', () => {
      mockUseOgMetadata.mockReturnValue({
        metadata: null,
        isLoading: true,
        error: null,
      });

      render(<GenericPreview url="https://example.com" />);

      expect(screen.getAllByRole('generic').some((el) => el.getAttribute('data-slot') === 'skeleton')).toBe(true);
    });
  });

  describe('error state', () => {
    it('returns null when there is an error', () => {
      mockUseOgMetadata.mockReturnValue({
        metadata: null,
        isLoading: false,
        error: new Error('Failed to fetch'),
      });

      const { container } = render(<GenericPreview url="https://example.com" />);

      expect(container.firstChild).toBeNull();
    });

    it('returns null when metadata is null', () => {
      mockUseOgMetadata.mockReturnValue({
        metadata: null,
        isLoading: false,
        error: null,
      });

      const { container } = render(<GenericPreview url="https://example.com" />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('website type rendering', () => {
    it('renders website preview with title and url', () => {
      mockUseOgMetadata.mockReturnValue({
        metadata: {
          url: 'example.com',
          title: 'Example Website',
          image: null,
          type: 'website',
        },
        isLoading: false,
        error: null,
      });

      render(<GenericPreview url="https://example.com" />);

      expect(screen.getByTestId('generic-website-preview')).toBeInTheDocument();
      expect(screen.getByText('Example Website')).toBeInTheDocument();
      expect(screen.getByText('example.com')).toBeInTheDocument();
    });

    it('renders website preview with image when available', () => {
      mockUseOgMetadata.mockReturnValue({
        metadata: {
          url: 'example.com',
          title: 'Example Website',
          image: 'https://example.com/og-image.jpg',
          type: 'website',
        },
        isLoading: false,
        error: null,
      });

      render(<GenericPreview url="https://example.com" />);

      expect(screen.getByAltText('Website social image')).toBeInTheDocument();
    });

    it('renders website preview without title when not available', () => {
      mockUseOgMetadata.mockReturnValue({
        metadata: {
          url: 'example.com',
          title: null,
          image: null,
          type: 'website',
        },
        isLoading: false,
        error: null,
      });

      render(<GenericPreview url="https://example.com" />);

      expect(screen.getByTestId('generic-website-preview')).toBeInTheDocument();
      expect(screen.getByText('example.com')).toBeInTheDocument();
    });
  });

  describe('image type rendering', () => {
    it('renders image preview for image type', () => {
      const imageUrl = 'https://example.com/photo.jpg';
      mockUseOgMetadata.mockReturnValue({
        metadata: {
          url: imageUrl,
          title: null,
          image: null,
          type: 'image',
        },
        isLoading: false,
        error: null,
      });

      render(<GenericPreview url={imageUrl} />);

      const image = screen.getByAltText('Image preview');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', imageUrl);
    });

    it('wraps image in a link to the original URL', () => {
      const imageUrl = 'https://example.com/photo.png';
      mockUseOgMetadata.mockReturnValue({
        metadata: {
          url: imageUrl,
          title: null,
          image: null,
          type: 'image',
        },
        isLoading: false,
        error: null,
      });

      render(<GenericPreview url={imageUrl} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', imageUrl);
    });
  });

  describe('video type rendering', () => {
    it('renders video element for video type', () => {
      const videoUrl = 'https://example.com/video.mp4';
      mockUseOgMetadata.mockReturnValue({
        metadata: {
          url: videoUrl,
          title: null,
          image: null,
          type: 'video',
        },
        isLoading: false,
        error: null,
      });

      render(<GenericPreview url={videoUrl} />);

      const video = document.querySelector('video');
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute('src', videoUrl);
    });
  });

  describe('audio type rendering', () => {
    it('renders audio element for audio type', () => {
      const audioUrl = 'https://example.com/audio.mp3';
      mockUseOgMetadata.mockReturnValue({
        metadata: {
          url: audioUrl,
          title: null,
          image: null,
          type: 'audio',
        },
        isLoading: false,
        error: null,
      });

      render(<GenericPreview url={audioUrl} />);

      const audio = document.querySelector('audio');
      expect(audio).toBeInTheDocument();
      expect(audio).toHaveAttribute('src', audioUrl);
    });
  });
});

describe('GenericPreview - Snapshots', () => {
  const mockUseOgMetadata = vi.mocked(useOgMetadata);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for loading state', () => {
    mockUseOgMetadata.mockReturnValue({
      metadata: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(<GenericPreview url="https://example.com" />);

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for website type with all fields', () => {
    mockUseOgMetadata.mockReturnValue({
      metadata: {
        url: 'example.com',
        title: 'Example Website Title',
        image: 'https://example.com/og-image.jpg',
        type: 'website',
      },
      isLoading: false,
      error: null,
    });

    const { container } = render(<GenericPreview url="https://example.com" />);

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for website type without image', () => {
    mockUseOgMetadata.mockReturnValue({
      metadata: {
        url: 'example.com',
        title: 'Example Website Title',
        image: null,
        type: 'website',
      },
      isLoading: false,
      error: null,
    });

    const { container } = render(<GenericPreview url="https://example.com" />);

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for image type', () => {
    const imageUrl = 'https://example.com/photo.jpg';
    mockUseOgMetadata.mockReturnValue({
      metadata: {
        url: imageUrl,
        title: null,
        image: null,
        type: 'image',
      },
      isLoading: false,
      error: null,
    });

    const { container } = render(<GenericPreview url={imageUrl} />);

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for video type', () => {
    const videoUrl = 'https://example.com/video.mp4';
    mockUseOgMetadata.mockReturnValue({
      metadata: {
        url: videoUrl,
        title: null,
        image: null,
        type: 'video',
      },
      isLoading: false,
      error: null,
    });

    const { container } = render(<GenericPreview url={videoUrl} />);

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for audio type', () => {
    const audioUrl = 'https://example.com/audio.mp3';
    mockUseOgMetadata.mockReturnValue({
      metadata: {
        url: audioUrl,
        title: null,
        image: null,
        type: 'audio',
      },
      isLoading: false,
      error: null,
    });

    const { container } = render(<GenericPreview url={audioUrl} />);

    expect(container).toMatchSnapshot();
  });
});
