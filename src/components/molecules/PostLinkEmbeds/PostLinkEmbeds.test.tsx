import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostLinkEmbeds } from './PostLinkEmbeds';

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: React.forwardRef(function MockContainer(
      {
        children,
        className,
        onClick,
        'data-testid': dataTestId,
        'data-theme': dataTheme,
      }: {
        children: React.ReactNode;
        className?: string;
        onClick?: (e: React.MouseEvent) => void;
        'data-testid'?: string;
        'data-theme'?: string;
      },
      ref: React.Ref<HTMLDivElement>,
    ) {
      return (
        <div
          ref={ref}
          data-testid={dataTestId || 'container'}
          data-theme={dataTheme}
          className={className}
          onClick={onClick}
        >
          {children}
        </div>
      );
    }),
  };
});

vi.mock('@/atoms/Iframe/Iframe', () => {
  return {
    Iframe: ({
      'data-testid': dataTestId,
      width = '100%',
      height = '315',
      className,
      ...props
    }: React.IframeHTMLAttributes<HTMLIFrameElement> & { 'data-testid'?: string }) => (
      <iframe
        data-testid={dataTestId}
        loading="lazy"
        allowFullScreen
        className={`rounded-md ${className || ''}`.trim()}
        width={width}
        height={height}
        {...props}
      />
    ),
  };
});

vi.mock('@/atoms/Image/Image', () => {
  return {
    Image: ({ src, alt, className }: React.ImgHTMLAttributes<HTMLImageElement>) => (
      <img src={src} alt={alt} className={className} />
    ),
  };
});

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({
      children,
      href,
      'data-testid': dataTestId,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { 'data-testid'?: string }) => (
      <a data-testid={dataTestId} href={href?.toString()} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, className }: { children: React.ReactNode; className?: string; size?: string }) => (
      <span className={className}>{children}</span>
    ),
  };
});

vi.mock('react-tweet', () => ({
  Tweet: ({ id }: { id: string }) => (
    <div data-testid="twitter-tweet" data-tweet-id={id}>
      Mocked Tweet {id}
    </div>
  ),
}));

// Mock GenericPreview to avoid act() warnings from async SWR updates
vi.mock('./Providers/Generic/GenericPreview', () => ({
  GenericPreview: ({ url }: { url: string }) => (
    <div data-testid="generic-preview" data-url={url}>
      Mocked Generic Preview
    </div>
  ),
}));

describe('PostLinkEmbeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('YouTube URL parsing', () => {
    it('renders YouTube embed for standard youtube.com URL', () => {
      render(<PostLinkEmbeds content="Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('renders YouTube embed for youtu.be URL', () => {
      render(<PostLinkEmbeds content="Watch this: https://youtu.be/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('handles youtu.be URL with query parameters', () => {
      render(<PostLinkEmbeds content="https://youtu.be/dQw4w9WgXcQ?t=123" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=123');
    });

    it('renders YouTube embed for mobile youtube.com URL', () => {
      render(<PostLinkEmbeds content="Mobile link: https://m.youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('renders YouTube embed for youtube-nocookie.com URL', () => {
      render(<PostLinkEmbeds content="Privacy link: https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('renders YouTube embed for embed URL format', () => {
      render(<PostLinkEmbeds content="Embed: https://www.youtube.com/embed/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('renders YouTube embed for shorts URL format', () => {
      render(<PostLinkEmbeds content="Check out this short: https://www.youtube.com/shorts/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('renders YouTube embed for live stream URL format', () => {
      render(<PostLinkEmbeds content="Live stream: https://www.youtube.com/live/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('renders YouTube embed for legacy /v URL format', () => {
      render(<PostLinkEmbeds content="Legacy format: https://www.youtube.com/v/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('renders YouTube embed for music.youtube.com URL', () => {
      render(<PostLinkEmbeds content="Music video: https://music.youtube.com/watch?v=UTD5buLHoR4" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/UTD5buLHoR4');
    });

    it('handles YouTube URL with trailing punctuation', () => {
      render(<PostLinkEmbeds content="Check this out: https://www.youtube.com/watch?v=dQw4w9WgXcQ!" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('handles YouTube URL with timestamp in seconds format', () => {
      render(<PostLinkEmbeds content="Timestamped: https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=123');
    });

    it('handles YouTube URL with timestamp in h/m/s format', () => {
      render(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=3723');
    });

    it('handles YouTube URL with timestamp as plain number', () => {
      render(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90');
    });

    it('handles YouTube URL with partial h/m/s format (minutes and seconds only)', () => {
      render(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2m30s" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=150');
    });

    it('does not render embed for YouTube video ID shorter than 11 characters', () => {
      render(<PostLinkEmbeds content="Invalid length: https://www.youtube.com/watch?v=dQw4w9WgXc" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('does not render embed for YouTube video ID longer than 11 characters', () => {
      render(<PostLinkEmbeds content="Invalid length: https://www.youtube.com/watch?v=dQw4w9WgXcQQ" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('does not render embed for YouTube video ID with invalid characters', () => {
      render(<PostLinkEmbeds content="Invalid chars: https://www.youtube.com/watch?v=dQw4w9WgX@!" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('renders embed for valid 11-character YouTube ID with valid characters', () => {
      render(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
    });

    it('does not render embed for YouTube URL without video ID', () => {
      render(<PostLinkEmbeds content="No ID: https://www.youtube.com/channel/UC123" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });
  });

  describe('YouTube iframe attributes', () => {
    it('sets correct iframe attributes for YouTube embed', () => {
      render(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

      // Check aspect ratio wrapper
      const wrapper = screen.getByTestId('youtube-aspect-ratio-wrapper');
      expect(wrapper).toHaveClass('relative', 'pt-[56.25%]');

      // Check iframe attributes
      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toHaveAttribute('width', '100%');
      expect(iframe).toHaveAttribute('height', 'auto');
      expect(iframe).toHaveAttribute('allowFullScreen');
      expect(iframe).toHaveAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      );
      expect(iframe).toHaveClass('rounded-md', 'absolute', 'top-0', 'left-0', 'h-full', 'w-full');
    });
  });

  describe('Vimeo URL parsing', () => {
    it('renders Vimeo embed for standard vimeo.com URL', () => {
      render(<PostLinkEmbeds content="Check out this video: https://vimeo.com/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });

    it('renders Vimeo embed for www.vimeo.com URL', () => {
      render(<PostLinkEmbeds content="Watch this: https://www.vimeo.com/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });

    it('renders Vimeo embed for player.vimeo.com URL', () => {
      render(<PostLinkEmbeds content="Player link: https://player.vimeo.com/video/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });

    it('renders Vimeo embed for channels URL', () => {
      render(<PostLinkEmbeds content="Channel video: https://vimeo.com/channels/staffpicks/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });

    it('renders Vimeo embed for groups URL', () => {
      render(<PostLinkEmbeds content="Group video: https://vimeo.com/groups/shortfilms/videos/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });

    it('renders Vimeo embed for album URL', () => {
      render(<PostLinkEmbeds content="Album: https://vimeo.com/album/987654/video/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });

    it('renders Vimeo embed for short video IDs', () => {
      render(<PostLinkEmbeds content="Short ID: https://vimeo.com/123456" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456');
    });

    it('renders Vimeo embed for long video IDs', () => {
      render(<PostLinkEmbeds content="Long ID: https://vimeo.com/1234567890" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/1234567890');
    });

    it('handles Vimeo URL with timestamp in seconds format', () => {
      render(<PostLinkEmbeds content="Timestamped: https://vimeo.com/123456789#t=30s" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789#t=30s');
    });

    it('handles Vimeo URL with timestamp in m/s format', () => {
      render(<PostLinkEmbeds content="https://vimeo.com/123456789#t=2m30s" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789#t=150s');
    });

    it('handles Vimeo URL with timestamp in h/m/s format', () => {
      render(<PostLinkEmbeds content="https://vimeo.com/123456789#t=1h2m3s" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789#t=3723s');
    });

    it('handles Vimeo URL with timestamp minutes only', () => {
      render(<PostLinkEmbeds content="https://vimeo.com/123456789#t=5m" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789#t=300s');
    });

    it('handles Vimeo URL with timestamp hours only', () => {
      render(<PostLinkEmbeds content="https://vimeo.com/123456789#t=1h" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789#t=3600s');
    });

    it('does not render embed for Vimeo video ID with non-numeric characters', () => {
      render(<PostLinkEmbeds content="Invalid: https://vimeo.com/abc123def" />);

      expect(screen.queryByTestId('Vimeo video player')).not.toBeInTheDocument();
    });

    it('does not render embed for Vimeo URL without video ID', () => {
      render(<PostLinkEmbeds content="No ID: https://vimeo.com/about" />);

      expect(screen.queryByTestId('Vimeo video player')).not.toBeInTheDocument();
    });

    it('handles Vimeo URL with trailing punctuation', () => {
      render(<PostLinkEmbeds content="Check this out: https://vimeo.com/123456789!" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/123456789');
    });
  });

  describe('Vimeo iframe attributes', () => {
    it('sets correct iframe attributes for Vimeo embed', () => {
      render(<PostLinkEmbeds content="https://vimeo.com/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toHaveAttribute('allowFullScreen');
      expect(iframe).toHaveAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      );
      expect(iframe).toHaveClass('absolute', 'top-0', 'left-0', 'h-full', 'w-full', 'rounded-md');
    });

    it('wraps Vimeo iframe in aspect ratio container', () => {
      render(<PostLinkEmbeds content="https://vimeo.com/123456789" />);

      const wrapper = screen.getByTestId('vimeo-aspect-ratio-wrapper');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveClass('relative', 'pt-[56.25%]');
    });
  });

  describe('Twitter/X URL parsing', () => {
    it('renders Twitter embed for standard twitter.com URL', () => {
      render(<PostLinkEmbeds content="Check out this tweet: https://twitter.com/jack/status/20" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '20');
    });

    it('renders Twitter embed for x.com URL', () => {
      render(<PostLinkEmbeds content="Look at this: https://x.com/elonmusk/status/1234567890123456789" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '1234567890123456789');
    });

    it('renders Twitter embed for www.twitter.com URL', () => {
      render(<PostLinkEmbeds content="https://www.twitter.com/user/status/98765432109876543" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '98765432109876543');
    });

    it('renders Twitter embed for www.x.com URL', () => {
      render(<PostLinkEmbeds content="https://www.x.com/someone/status/111111111111111111" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '111111111111111111');
    });

    it('renders Twitter embed for mobile.twitter.com URL', () => {
      render(<PostLinkEmbeds content="Mobile link: https://mobile.twitter.com/user/status/222222222222222222" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '222222222222222222');
    });

    it('renders Twitter embed for mobile.x.com URL', () => {
      render(<PostLinkEmbeds content="https://mobile.x.com/user/status/333333333333333333" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '333333333333333333');
    });

    it('handles Twitter URL with query parameters', () => {
      render(<PostLinkEmbeds content="https://twitter.com/user/status/444444444444444444?s=20&t=abc123" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '444444444444444444');
    });

    it('handles Twitter URL with hash fragment', () => {
      render(<PostLinkEmbeds content="https://x.com/user/status/555555555555555555#reply" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '555555555555555555');
    });

    it('handles Twitter URL with trailing slash', () => {
      render(<PostLinkEmbeds content="https://twitter.com/user/status/666666666666666666/" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '666666666666666666');
    });

    it('handles Twitter URL with trailing punctuation', () => {
      render(<PostLinkEmbeds content="Check this: https://twitter.com/user/status/777777777777777777!" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '777777777777777777');
    });

    it('handles Twitter URL with trailing whitespace', () => {
      render(<PostLinkEmbeds content="https://x.com/user/status/888888888888888888 " />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '888888888888888888');
    });

    it('handles very short numeric tweet IDs', () => {
      render(<PostLinkEmbeds content="https://twitter.com/jack/status/1" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '1');
    });

    it('handles very long numeric tweet IDs', () => {
      render(<PostLinkEmbeds content="https://x.com/user/status/1234567890123456789012" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '1234567890123456789012');
    });

    it('does not render embed for Twitter status URL without ID', () => {
      render(<PostLinkEmbeds content="https://twitter.com/user/status/" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('does not render embed for Twitter URL with non-numeric ID', () => {
      render(<PostLinkEmbeds content="https://twitter.com/user/status/abc123def" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('does not render embed for Twitter URL with alphanumeric ID', () => {
      render(<PostLinkEmbeds content="https://x.com/user/status/123abc456" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('does not render embed for Twitter profile URL (no status)', () => {
      render(<PostLinkEmbeds content="https://twitter.com/jack" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('does not render embed for Twitter home URL', () => {
      render(<PostLinkEmbeds content="https://twitter.com/home" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('handles URLs without protocol', () => {
      render(<PostLinkEmbeds content="No protocol: twitter.com/user/status/999999999999999999" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '999999999999999999');
    });
  });

  describe('Twitter/X embed rendering', () => {
    it('wraps Twitter embed in dark theme container', () => {
      render(<PostLinkEmbeds content="https://twitter.com/user/status/123456789" />);

      const twitterContainer = screen.getByTestId('twitter-container');
      expect(twitterContainer).toBeInTheDocument();
      expect(twitterContainer).toHaveAttribute('data-theme', 'dark');
    });

    it('renders Tweet component with correct ID prop', () => {
      render(<PostLinkEmbeds content="https://x.com/user/status/987654321" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '987654321');
      expect(tweet).toHaveTextContent('Mocked Tweet 987654321');
    });

    it('intercepts video click and opens tweet on X', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<PostLinkEmbeds content="https://x.com/user/status/123456789" />);

      const container = screen.getByTestId('twitter-container');

      // Simulate a click on a video element inside the container
      const video = document.createElement('video');
      container.querySelector('[data-testid="twitter-tweet"]')!.appendChild(video);
      fireEvent.click(video);

      expect(windowOpenSpy).toHaveBeenCalledWith('https://x.com/i/status/123456789', '_blank', 'noopener,noreferrer');

      windowOpenSpy.mockRestore();
    });

    // Verifies that our video click interception handler does NOT trigger
    // for non-video elements (e.g. tweet text, profile links).
    // Note: This uses a mocked Tweet component (plain <div>), so it only tests
    // our handler logic — not the real react-tweet link behavior.
    it('video click handler does not intercept clicks on non-video elements', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<PostLinkEmbeds content="https://x.com/user/status/123456789" />);

      const tweet = screen.getByTestId('twitter-tweet');
      fireEvent.click(tweet);

      expect(windowOpenSpy).not.toHaveBeenCalled();

      windowOpenSpy.mockRestore();
    });
  });

  describe('Markdown link stripping', () => {
    it('does not render embed for URL wrapped in Markdown link syntax', () => {
      render(<PostLinkEmbeds content="Check out [this video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('renders embed for plain URL when Markdown link is also present', () => {
      render(
        <PostLinkEmbeds content="[click here](https://example.com) but also https://www.youtube.com/watch?v=dQw4w9WgXcQ" />,
      );

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('does not render embed when only URL is inside Markdown link', () => {
      render(<PostLinkEmbeds content="Visit [Twitter](https://twitter.com/user/status/123456789)" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('handles empty brackets in Markdown link syntax', () => {
      render(<PostLinkEmbeds content="Empty text [](https://www.youtube.com/watch?v=dQw4w9WgXcQ)" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('handles empty parentheses in Markdown link syntax', () => {
      render(<PostLinkEmbeds content="Empty URL [click here]() and https://vimeo.com/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
    });

    it('handles multiple Markdown links in content', () => {
      render(
        <PostLinkEmbeds content="[link1](https://youtube.com/watch?v=abc) and [link2](https://twitter.com/user/status/123)" />,
      );

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('handles Markdown links with nested parentheses in URL (Wikipedia)', () => {
      render(
        <PostLinkEmbeds content="[Wiki](https://en.wikipedia.org/wiki/Foo_(bar)) and https://youtube.com/watch?v=dQw4w9WgXcQ" />,
      );

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('does not render embed for content without URLs', () => {
      render(<PostLinkEmbeds content="Just some regular text without any links" />);

      expect(screen.queryByTestId('container')).not.toBeInTheDocument();
    });

    it('does not render embed for empty content', () => {
      render(<PostLinkEmbeds content="" />);

      expect(screen.queryByTestId('container')).not.toBeInTheDocument();
    });

    it('handles content with multiple URLs, uses first one', () => {
      render(
        <PostLinkEmbeds content="First: https://www.youtube.com/watch?v=dQw4w9WgXcQ Second: https://www.example.com" />,
      );

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('handles URLs without protocol', () => {
      render(<PostLinkEmbeds content="No protocol: youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('stops event propagation when clicking embed container', () => {
      const handleParentClick = vi.fn();

      render(
        <div onClick={handleParentClick}>
          <PostLinkEmbeds content="Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
        </div>,
      );

      const container = screen.getByTestId('container');
      expect(container).toBeInTheDocument();

      // Click the embed container
      fireEvent.click(container);

      // Parent click handler should not be called due to stopPropagation
      expect(handleParentClick).not.toHaveBeenCalled();
    });
  });
});

describe('PostLinkEmbeds - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot for YouTube embed', () => {
    const { container } = render(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
    screen.getByTestId('YouTube video player');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Vimeo embed', () => {
    const { container } = render(<PostLinkEmbeds content="https://vimeo.com/123456789" />);
    screen.getByTestId('Vimeo video player');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for no embed (no URL)', () => {
    const { container } = render(<PostLinkEmbeds content="Just some text without links" />);
    expect(screen.queryByTestId('container')).not.toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Twitter embed', () => {
    const { container } = render(<PostLinkEmbeds content="https://twitter.com/jack/status/20" />);
    screen.getByTestId('twitter-tweet');
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for X.com embed', () => {
    const { container } = render(<PostLinkEmbeds content="https://x.com/user/status/1234567890123456789" />);
    screen.getByTestId('twitter-tweet');
    expect(container.firstChild).toMatchSnapshot();
  });

  // Note: Generic preview snapshot test removed as it now uses SWR
  // which requires mocking fetch and is tested separately in GenericPreview.test.tsx
});
