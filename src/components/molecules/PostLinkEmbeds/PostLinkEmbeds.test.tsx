import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPinakesConfigured } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { expectNoThirdPartyLoads } from '@/test-utils/third-party';
import { PostLinkEmbeds } from './PostLinkEmbeds';
import { withAutoplay } from './Providers/Provider.utils';

beforeEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
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

// ProviderTwitter no longer uses `<Tweet>` directly — it composes `useTweet` +
// `EmbeddedTweet` to normalize entities (TEMPORARY WORKAROUND for
// https://github.com/vercel/react-tweet/issues/218). Mock those parts instead.
vi.mock('react-tweet', () => ({
  useTweet: (id: string) => ({
    data: { id_str: id },
    error: null,
    isLoading: false,
  }),
  EmbeddedTweet: ({ tweet }: { tweet: { id_str: string } }) => (
    <div data-testid="twitter-tweet" data-tweet-id={tweet.id_str}>
      Mocked Tweet {tweet.id_str}
    </div>
  ),
  TweetSkeleton: () => <div data-testid="twitter-tweet-skeleton">Loading tweet</div>,
  TweetNotFound: () => <div data-testid="twitter-tweet-not-found">Tweet not found</div>,
}));

// Mock GenericPreview to avoid act() warnings from async SWR updates
vi.mock('./Providers/Generic/GenericPreview', () => ({
  GenericPreview: ({ url }: { url: string }) => (
    <div data-testid="generic-preview" data-url={url}>
      Mocked Generic Preview
    </div>
  ),
}));

// No Pinakes card unless a test gives one, as with Pinakes not configured
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: vi.fn(() => false),
}));
const xPostRead = vi.hoisted(() => ({
  prefetched: [] as string[],
  post: null as import('@/pipes/x-post/x-post').TXPost | null,
  pending: false,
  ids: [] as (string | null)[],
}));
vi.mock('@/hooks/useXPost/useXPost', () => ({
  prefetchXPost: (link: string) => xPostRead.prefetched.push(link),
  useXPost: (id: string | null) => {
    xPostRead.ids.push(id);
    return id ? { post: xPostRead.post, pending: xPostRead.pending } : { post: null, pending: false };
  },
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({
  usePinakesCard: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
}));
// The link preview reads nothing unless a test gives it an answer.
const og = vi.hoisted(() => ({
  metadata: null as null | { url: string; type: 'website'; title: string; image: string },
  /** The links whose preview was asked for. */
  asked: [] as string[],
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: (url: string | null) => {
    if (url) og.asked.push(url);
    return { metadata: url ? og.metadata : null, isLoading: false, error: null };
  },
}));
// Off screen unless a test brings the embed near (jsdom has no layout).
const viewport = vi.hoisted(() => ({ isVisible: false }));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: viewport.isVisible }),
}));
// The card's action row and tag bar have their own tests; here only whether they render matters.
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: () => <div data-testid="resource-actions" />,
}));

// Mock PostPreviewCard to avoid pulling in local-first data hooks
vi.mock('@/molecules/PostPreviewCard/PostPreviewCard', () => ({
  PostPreviewCard: ({ postId, className }: { postId: string; className?: string }) => (
    <div data-testid="post-preview-card" data-post-id={postId} className={className}>
      Mocked Post Preview Card
    </div>
  ),
}));

/**
 * Renders `ui` on screen and presses its platform's Play on / Show on, where it has one: a platform's
 * embed loads only on the viewer's press, so the embed a link gives is the one that press loads.
 */
const renderLoaded = (ui: React.ReactElement) => {
  viewport.isVisible = true;
  const result = render(ui);
  const press = screen.queryAllByRole('button', { name: /^(Play|Show) on / });
  if (press.length === 1) fireEvent.click(press[0]);
  return result;
};

describe('PostLinkEmbeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewport.isVisible = false;
    // No Pinakes and no card unless a test gives one (`clearAllMocks` keeps an earlier test's).
    vi.mocked(isPinakesConfigured).mockReturnValue(false);
    vi.mocked(usePinakesCard).mockReturnValue({ data: null, isLoading: false, isError: false });
  });

  describe('with the default settings (a new viewer, nothing saved)', () => {
    beforeEach(() => {
      // On screen: a platform link's box reads its card, or the X post, once near the screen.
      viewport.isVisible = true;
    });

    it.each([
      ['YouTube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'YouTube video player'],
      ['Vimeo', 'https://vimeo.com/76979871', 'Vimeo video player'],
    ])('loads a %s link in the text only on Play on, started by that press', (site, link, testId) => {
      render(<PostLinkEmbeds content={`Watch ${link}`} />);

      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: `Play on ${site}` }));

      expect(screen.getByTestId(testId).getAttribute('src')).toContain('autoplay=1');
      expect(screen.getByRole('button', { name: `Close the ${site} video` })).toBeInTheDocument();
    });

    it('shows an X post in the text only on Show on', () => {
      render(<PostLinkEmbeds content="See https://x.com/user/status/1234567890" />);

      expect(document.querySelector('[data-testid^="twitter-tweet"]')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Show on x.com' }));
      expect(document.querySelector('[data-testid^="twitter-tweet"]')).not.toBeNull();
    });

    it('loads a post’s own YouTube embed only on Play on where Pinakes is not configured', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(false);
      render(<PostLinkEmbeds url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

      expect(document.querySelector('iframe')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));
      expect(screen.getByTestId('YouTube video player').getAttribute('src')).toContain('autoplay=1');
    });
  });

  describe('a link in the text Pinakes has a card for', () => {
    const VIDEO: TPinakesResourceDetail = { ...videoFixture, also_on: [] };
    const X_LINK = 'https://x.com/user/status/1234567890';
    const X_POST: TPinakesResourceDetail = {
      ...videoFixture,
      uri: X_LINK,
      name: 'A post on X',
      description: null,
      site: 'x.com',
      type: 'SocialMediaPosting',
      type_path: ['Thing', 'CreativeWork', 'SocialMediaPosting'],
      image: null,
      also_on: [],
    };
    const givenCard = (data: TPinakesResourceDetail | null, isLoading = false) =>
      vi.mocked(usePinakesCard).mockReturnValue({ data, isLoading, isError: false });

    beforeEach(() => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      viewport.isVisible = true;
    });

    it('draws a YouTube link’s player from its card, loading nothing from YouTube, and plays it in place on a press', () => {
      givenCard(VIDEO);
      render(<PostLinkEmbeds content={`Listen ${VIDEO.uri}`} />);

      // Re-read while on screen, and sent to be read once near the screen when Pinakes does not know it.
      expect(usePinakesCard).toHaveBeenCalledWith(VIDEO.uri, { recheck: true, resolveOnView: true });
      const facade = within(screen.getByTestId('resource-embed-frame')).getByTestId('player-facade');
      expect(facade).toHaveTextContent(VIDEO.name!);
      expect(document.querySelector('iframe')).toBeNull();
      expectNoThirdPartyLoads();
      // The link is the post's text, not its resource: no footer of its own.
      expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: `Play ${VIDEO.name} on YouTube` }));

      expect(document.querySelectorAll('iframe')).toHaveLength(1);
      expect(screen.getByTestId('resource-player-frame').getAttribute('src')).toContain('autoplay=1');
      expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
    });

    it('shows an X link’s post from its card’s data at once, nothing from X, no press', () => {
      givenCard(X_POST);
      render(<PostLinkEmbeds content={`See ${X_LINK}`} />);

      expect(screen.getByTestId('resource-card-post')).toHaveTextContent('A post on X');
      expect(screen.queryByRole('button', { name: 'Show on x.com' })).not.toBeInTheDocument();
      expect(document.querySelector('[data-testid^="twitter-tweet"]')).toBeNull();
      expectNoThirdPartyLoads();
    });

    it('shows the link preview’s image of a text X link’s card from the app’s image route only', () => {
      og.metadata = { url: X_LINK, type: 'website', title: 'A post', image: 'https://pbs.twimg.com/media/og.jpg' };
      try {
        // No group to borrow an image from: the card falls back on the link's own preview.
        givenCard({ ...X_POST, group: null });
        render(<PostLinkEmbeds content={`See ${X_LINK}`} />);

        expect(screen.getByTestId('resource-card-post')).toHaveTextContent('A post on X');
        expect(within(screen.getByTestId('resource-card-image')).getByRole('img').getAttribute('src')).toMatch(
          /^\/api\/image\?uri=.*&og=1&src=/,
        );
        expectNoThirdPartyLoads();
      } finally {
        og.metadata = null;
      }
    });

    it('draws a text X link whose card cannot tell the post as the press inside the card, no pill', () => {
      // The card of the link's shape alone, and the app's server could not read the post either.
      givenCard({ ...X_POST, name: 'Post on x.com', facts: {} });
      render(<PostLinkEmbeds content={`See ${X_LINK}`} />);

      expect(screen.queryByTestId('resource-card-post')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show on x.com' })).not.toBeInTheDocument();
      expect(document.querySelector('[data-testid^="twitter-tweet"]')).toBeNull();
      expectNoThirdPartyLoads();
      fireEvent.click(
        within(screen.getByTestId('resource-card-player')).getByRole('button', { name: 'Show post from x.com' }),
      );
      expect(within(screen.getByTestId('resource-card-player')).getByTestId('twitter-tweet')).toBeInTheDocument();
      expect(screen.getByTestId('resource-card-title')).toHaveTextContent('Post on x.com');
      fireEvent.click(screen.getByRole('button', { name: 'Close the x.com post' }));
      expect(document.querySelector('[data-testid^="twitter-tweet"]')).toBeNull();
    });

    it('never reads the link preview of a post whose site refused Pinakes’ read', () => {
      og.asked = [];
      // A refused read named by the wall's own title, not the link's shape: still no preview read.
      givenCard({ ...X_POST, name: 'Log in to X', facts: { blocked: 'true' }, group: null });
      render(<PostLinkEmbeds content={`See ${X_LINK}`} />);

      expect(screen.getByTestId('resource-card')).toBeInTheDocument();
      expect(og.asked).toEqual([]);
      // A refused read has no post text: the press, not the wall's title as a post.
      expect(screen.queryByTestId('resource-card-post')).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId('resource-card-player')).getByRole('button', { name: 'Show post from x.com' }),
      ).toBeInTheDocument();
    });

    it('keeps a Play for a video post, loading X’s embed inside the card from it', () => {
      givenCard({ ...X_POST, type: 'VideoObject', type_path: ['Thing', 'CreativeWork', 'MediaObject', 'VideoObject'] });
      render(<PostLinkEmbeds content={`See ${X_LINK}`} />);

      expect(document.querySelector('[data-testid^="twitter-tweet"]')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Play on x.com' }));
      expect(within(screen.getByTestId('resource-card-player')).getByTestId('twitter-tweet')).toBeInTheDocument();
      expect(screen.getByTestId('resource-card-title')).toHaveTextContent('A post on X');
    });

    it('shows a link Pinakes cannot read as its own preview card, the thumbnail from the app, the player inside it on Play', () => {
      givenCard(null);
      render(<PostLinkEmbeds content={`Watch ${VIDEO.uri}`} />);

      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('embed-on-press')).not.toBeInTheDocument();
      const card = screen.getByTestId('resource-link-card');
      expect(within(card).getByTestId('resource-card-image').querySelector('img')?.getAttribute('src')).toMatch(
        /^\/api\/image\?youtube=/,
      );
      expect(document.querySelector('iframe')).toBeNull();
      expectNoThirdPartyLoads();
      fireEvent.click(within(card).getByRole('button', { name: 'Play on YouTube' }));
      expect(
        within(screen.getByTestId('resource-link-card-player')).getByTestId('YouTube video player').getAttribute('src'),
      ).toContain('autoplay=1');
      expect(document.querySelectorAll('iframe')).toHaveLength(1);
    });

    it('shows the same card for a text X link with no card, X’s post only inside it from Show on', () => {
      givenCard(null);
      render(<PostLinkEmbeds content={`See ${X_LINK}`} />);

      const card = screen.getByTestId('resource-link-card');
      expect(within(card).getByText('Post')).toBeInTheDocument();
      expect(document.querySelector('[data-testid^="twitter-tweet"]')).toBeNull();
      expectNoThirdPartyLoads();
      fireEvent.click(within(card).getByRole('button', { name: 'Show on x.com' }));
      expect(within(screen.getByTestId('resource-link-card-player')).getByTestId('twitter-tweet')).toBeInTheDocument();
    });

    it('shows the preview card without Pinakes, asking it nothing', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(false);
      givenCard(null);
      render(<PostLinkEmbeds content={`Watch ${VIDEO.uri}`} />);

      expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
      expect(vi.mocked(usePinakesCard).mock.calls.every(([uri]) => uri === null)).toBe(true);
      expect(document.querySelector('iframe')).toBeNull();
    });

    it('holds the place with the card’s skeleton while Pinakes reads, loading nothing', () => {
      givenCard(null, true);
      render(<PostLinkEmbeds content={`Watch ${VIDEO.uri}`} />);

      expect(screen.queryByRole('button', { name: /Play/ })).not.toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
    });

    it('holds the skeleton while Pinakes is asked to read a link it did not know', () => {
      vi.mocked(usePinakesCard).mockReturnValue({ data: null, isLoading: false, isError: false, isResolving: true });
      render(<PostLinkEmbeds content={`Watch ${VIDEO.uri}`} />);

      expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-link-card')).not.toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
    });

    it('reads nothing before the box first comes near the screen', () => {
      viewport.isVisible = false;
      givenCard(VIDEO);
      render(<PostLinkEmbeds content={`Watch ${VIDEO.uri}`} />);

      expect(usePinakesCard).not.toHaveBeenCalled();
      expect(document.querySelector('iframe')).toBeNull();
    });
  });

  describe('YouTube URL parsing', () => {
    it('renders YouTube embed for standard youtube.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
      expect(iframe).not.toHaveAttribute('enablejsapi');
    });

    it('renders YouTube embed for a protocol-less URL', () => {
      renderLoaded(<PostLinkEmbeds content="Check out youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('renders YouTube embed for youtu.be URL', () => {
      renderLoaded(<PostLinkEmbeds content="Watch this: https://youtu.be/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('handles youtu.be URL with query parameters', () => {
      renderLoaded(<PostLinkEmbeds content="https://youtu.be/dQw4w9WgXcQ?t=123" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=123&enablejsapi=1'),
      );
    });

    it('renders YouTube embed for mobile youtube.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Mobile link: https://m.youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('renders YouTube embed for youtube-nocookie.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Privacy link: https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('renders YouTube embed for embed URL format', () => {
      renderLoaded(<PostLinkEmbeds content="Embed: https://www.youtube.com/embed/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('renders YouTube embed for shorts URL format', () => {
      renderLoaded(<PostLinkEmbeds content="Check out this short: https://www.youtube.com/shorts/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('renders YouTube embed for live stream URL format', () => {
      renderLoaded(<PostLinkEmbeds content="Live stream: https://www.youtube.com/live/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('renders YouTube embed for legacy /v URL format', () => {
      renderLoaded(<PostLinkEmbeds content="Legacy format: https://www.youtube.com/v/dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('renders YouTube embed for music.youtube.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Music video: https://music.youtube.com/watch?v=UTD5buLHoR4" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/UTD5buLHoR4?enablejsapi=1'),
      );
    });

    it('handles YouTube URL with trailing punctuation', () => {
      renderLoaded(<PostLinkEmbeds content="Check this out: https://www.youtube.com/watch?v=dQw4w9WgXcQ!" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('handles YouTube URL with timestamp in seconds format', () => {
      renderLoaded(<PostLinkEmbeds content="Timestamped: https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123s" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=123&enablejsapi=1'),
      );
    });

    it('handles YouTube URL with timestamp in h/m/s format', () => {
      renderLoaded(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=3723&enablejsapi=1'),
      );
    });

    it('handles YouTube URL with timestamp as plain number', () => {
      renderLoaded(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90&enablejsapi=1'),
      );
    });

    it('handles YouTube URL with partial h/m/s format (minutes and seconds only)', () => {
      renderLoaded(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2m30s" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=150&enablejsapi=1'),
      );
    });

    it('does not render embed for YouTube video ID shorter than 11 characters', () => {
      renderLoaded(<PostLinkEmbeds content="Invalid length: https://www.youtube.com/watch?v=dQw4w9WgXc" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('does not render embed for YouTube video ID longer than 11 characters', () => {
      renderLoaded(<PostLinkEmbeds content="Invalid length: https://www.youtube.com/watch?v=dQw4w9WgXcQQ" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('does not render embed for YouTube video ID with invalid characters', () => {
      renderLoaded(<PostLinkEmbeds content="Invalid chars: https://www.youtube.com/watch?v=dQw4w9WgX@!" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('renders embed for valid 11-character YouTube ID with valid characters', () => {
      renderLoaded(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
    });

    it('does not render embed for YouTube URL without video ID', () => {
      renderLoaded(<PostLinkEmbeds content="No ID: https://www.youtube.com/channel/UC123" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });
  });

  describe('YouTube iframe attributes', () => {
    it('sets correct iframe attributes for YouTube embed', () => {
      renderLoaded(<PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

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
      renderLoaded(<PostLinkEmbeds content="Check out this video: https://vimeo.com/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789'));
    });

    it('renders Vimeo embed for www.vimeo.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Watch this: https://www.vimeo.com/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789'));
    });

    it('renders Vimeo embed for player.vimeo.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Player link: https://player.vimeo.com/video/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789'));
    });

    it('renders Vimeo embed for channels URL', () => {
      renderLoaded(<PostLinkEmbeds content="Channel video: https://vimeo.com/channels/staffpicks/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789'));
    });

    it('renders Vimeo embed for groups URL', () => {
      renderLoaded(<PostLinkEmbeds content="Group video: https://vimeo.com/groups/shortfilms/videos/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789'));
    });

    it('renders Vimeo embed for album URL', () => {
      renderLoaded(<PostLinkEmbeds content="Album: https://vimeo.com/album/987654/video/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789'));
    });

    it('renders Vimeo embed for short video IDs', () => {
      renderLoaded(<PostLinkEmbeds content="Short ID: https://vimeo.com/123456" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456'));
    });

    it('renders Vimeo embed for long video IDs', () => {
      renderLoaded(<PostLinkEmbeds content="Long ID: https://vimeo.com/1234567890" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/1234567890'));
    });

    it('handles Vimeo URL with timestamp in seconds format', () => {
      renderLoaded(<PostLinkEmbeds content="Timestamped: https://vimeo.com/123456789#t=30s" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789#t=30s'));
    });

    it('handles Vimeo URL with timestamp in m/s format', () => {
      renderLoaded(<PostLinkEmbeds content="https://vimeo.com/123456789#t=2m30s" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789#t=150s'));
    });

    it('handles Vimeo URL with timestamp in h/m/s format', () => {
      renderLoaded(<PostLinkEmbeds content="https://vimeo.com/123456789#t=1h2m3s" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789#t=3723s'));
    });

    it('handles Vimeo URL with timestamp minutes only', () => {
      renderLoaded(<PostLinkEmbeds content="https://vimeo.com/123456789#t=5m" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789#t=300s'));
    });

    it('handles Vimeo URL with timestamp hours only', () => {
      renderLoaded(<PostLinkEmbeds content="https://vimeo.com/123456789#t=1h" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789#t=3600s'));
    });

    it('does not render embed for Vimeo video ID with non-numeric characters', () => {
      renderLoaded(<PostLinkEmbeds content="Invalid: https://vimeo.com/abc123def" />);

      expect(screen.queryByTestId('Vimeo video player')).not.toBeInTheDocument();
    });

    it('does not render embed for Vimeo URL without video ID', () => {
      renderLoaded(<PostLinkEmbeds content="No ID: https://vimeo.com/about" />);

      expect(screen.queryByTestId('Vimeo video player')).not.toBeInTheDocument();
    });

    it('handles Vimeo URL with trailing punctuation', () => {
      renderLoaded(<PostLinkEmbeds content="Check this out: https://vimeo.com/123456789!" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', withAutoplay('https://player.vimeo.com/video/123456789'));
    });
  });

  describe('Vimeo iframe attributes', () => {
    it('sets correct iframe attributes for Vimeo embed', () => {
      renderLoaded(<PostLinkEmbeds content="https://vimeo.com/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toHaveAttribute('allowFullScreen');
      expect(iframe).toHaveAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      );
      expect(iframe).toHaveClass('absolute', 'top-0', 'left-0', 'h-full', 'w-full', 'rounded-md');
    });

    it('wraps Vimeo iframe in aspect ratio container', () => {
      renderLoaded(<PostLinkEmbeds content="https://vimeo.com/123456789" />);

      const wrapper = screen.getByTestId('vimeo-aspect-ratio-wrapper');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveClass('relative', 'pt-[56.25%]');
    });
  });

  describe('Twitter/X URL parsing', () => {
    it('renders Twitter embed for standard twitter.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Check out this tweet: https://twitter.com/jack/status/20" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '20');
    });

    it('renders Twitter embed for x.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Look at this: https://x.com/elonmusk/status/1234567890123456789" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '1234567890123456789');
    });

    it('renders Twitter embed for www.twitter.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="https://www.twitter.com/user/status/98765432109876543" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '98765432109876543');
    });

    it('renders Twitter embed for www.x.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="https://www.x.com/someone/status/111111111111111111" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '111111111111111111');
    });

    it('renders Twitter embed for mobile.twitter.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="Mobile link: https://mobile.twitter.com/user/status/222222222222222222" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '222222222222222222');
    });

    it('renders Twitter embed for mobile.x.com URL', () => {
      renderLoaded(<PostLinkEmbeds content="https://mobile.x.com/user/status/333333333333333333" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '333333333333333333');
    });

    it('handles Twitter URL with query parameters', () => {
      renderLoaded(<PostLinkEmbeds content="https://twitter.com/user/status/444444444444444444?s=20&t=abc123" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '444444444444444444');
    });

    it('handles Twitter URL with hash fragment', () => {
      renderLoaded(<PostLinkEmbeds content="https://x.com/user/status/555555555555555555#reply" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '555555555555555555');
    });

    it('handles Twitter URL with trailing slash', () => {
      renderLoaded(<PostLinkEmbeds content="https://twitter.com/user/status/666666666666666666/" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '666666666666666666');
    });

    it('handles Twitter URL with trailing punctuation', () => {
      renderLoaded(<PostLinkEmbeds content="Check this: https://twitter.com/user/status/777777777777777777!" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '777777777777777777');
    });

    it('handles Twitter URL with trailing whitespace', () => {
      renderLoaded(<PostLinkEmbeds content="https://x.com/user/status/888888888888888888 " />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '888888888888888888');
    });

    it('handles very short numeric tweet IDs', () => {
      renderLoaded(<PostLinkEmbeds content="https://twitter.com/jack/status/1" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '1');
    });

    it('handles very long numeric tweet IDs', () => {
      renderLoaded(<PostLinkEmbeds content="https://x.com/user/status/1234567890123456789012" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '1234567890123456789012');
    });

    it('does not render embed for Twitter status URL without ID', () => {
      renderLoaded(<PostLinkEmbeds content="https://twitter.com/user/status/" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('does not render embed for Twitter URL with non-numeric ID', () => {
      renderLoaded(<PostLinkEmbeds content="https://twitter.com/user/status/abc123def" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('does not render embed for Twitter URL with alphanumeric ID', () => {
      renderLoaded(<PostLinkEmbeds content="https://x.com/user/status/123abc456" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('does not render embed for Twitter profile URL (no status)', () => {
      renderLoaded(<PostLinkEmbeds content="https://twitter.com/jack" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('does not render embed for Twitter home URL', () => {
      renderLoaded(<PostLinkEmbeds content="https://twitter.com/home" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('handles URLs without protocol', () => {
      renderLoaded(<PostLinkEmbeds content="No protocol: twitter.com/user/status/999999999999999999" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '999999999999999999');
    });
  });

  describe('Twitter/X embed rendering', () => {
    it('wraps Twitter embed in dark theme container', () => {
      renderLoaded(<PostLinkEmbeds content="https://twitter.com/user/status/123456789" />);

      const twitterContainer = screen.getByTestId('twitter-container');
      expect(twitterContainer).toBeInTheDocument();
      expect(twitterContainer).toHaveAttribute('data-theme', 'dark');
    });

    it('renders Tweet component with correct ID prop', () => {
      renderLoaded(<PostLinkEmbeds content="https://x.com/user/status/987654321" />);

      const tweet = screen.getByTestId('twitter-tweet');
      expect(tweet).toBeInTheDocument();
      expect(tweet).toHaveAttribute('data-tweet-id', '987654321');
      expect(tweet).toHaveTextContent('Mocked Tweet 987654321');
    });

    it('intercepts video click and opens tweet on X', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      renderLoaded(<PostLinkEmbeds content="https://x.com/user/status/123456789" />);

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

      renderLoaded(<PostLinkEmbeds content="https://x.com/user/status/123456789" />);

      const tweet = screen.getByTestId('twitter-tweet');
      fireEvent.click(tweet);

      expect(windowOpenSpy).not.toHaveBeenCalled();

      windowOpenSpy.mockRestore();
    });
  });

  describe('Markdown link stripping', () => {
    it('does not render embed for URL wrapped in Markdown link syntax', () => {
      renderLoaded(<PostLinkEmbeds content="Check out [this video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('renders embed for plain URL when Markdown link is also present', () => {
      renderLoaded(
        <PostLinkEmbeds content="[click here](https://example.com) but also https://www.youtube.com/watch?v=dQw4w9WgXcQ" />,
      );

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('does not render embed when only URL is inside Markdown link', () => {
      renderLoaded(<PostLinkEmbeds content="Visit [Twitter](https://twitter.com/user/status/123456789)" />);

      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('handles empty brackets in Markdown link syntax', () => {
      renderLoaded(<PostLinkEmbeds content="Empty text [](https://www.youtube.com/watch?v=dQw4w9WgXcQ)" />);

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
    });

    it('handles empty parentheses in Markdown link syntax', () => {
      renderLoaded(<PostLinkEmbeds content="Empty URL [click here]() and https://vimeo.com/123456789" />);

      const iframe = screen.getByTestId('Vimeo video player');
      expect(iframe).toBeInTheDocument();
    });

    it('handles multiple Markdown links in content', () => {
      renderLoaded(
        <PostLinkEmbeds content="[link1](https://youtube.com/watch?v=abc) and [link2](https://twitter.com/user/status/123)" />,
      );

      expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
      expect(screen.queryByTestId('twitter-tweet')).not.toBeInTheDocument();
    });

    it('handles Markdown links with nested parentheses in URL (Wikipedia)', () => {
      renderLoaded(
        <PostLinkEmbeds content="[Wiki](https://en.wikipedia.org/wiki/Foo_(bar)) and https://youtube.com/watch?v=dQw4w9WgXcQ" />,
      );

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
    });
  });

  describe('In-app URL embeds', () => {
    const pubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
    const postId = '0034BBBDFK83G';
    // jsdom serves the tests from a localhost origin — in-app URLs are built from it
    const origin = window.location.origin;

    it('renders PostPreviewCard for a current-origin post URL', () => {
      renderLoaded(<PostLinkEmbeds content={`Look at this: ${origin}/post/${pubky}/${postId}`} />);

      const card = screen.getByTestId('post-preview-card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('data-post-id', `${pubky}:${postId}`);
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
    });

    it('renders PostPreviewCard for a current-origin post URL a new post embeds (the post it quotes)', () => {
      renderLoaded(<PostLinkEmbeds url={`${origin}/post/${pubky}/${postId}`} isComposing />);

      expect(screen.getByTestId('post-preview-card')).toHaveAttribute('data-post-id', `${pubky}:${postId}`);
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
    });

    it('renders PostPreviewCard for a current-origin collection URL', () => {
      renderLoaded(<PostLinkEmbeds content={`My collection: ${origin}/collections/${pubky}/${postId}`} />);

      const card = screen.getByTestId('post-preview-card');
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('data-post-id', `${pubky}:${postId}`);
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
    });

    it('routes a valid-pubky URL with a nonexistent post id to the preview card (which owns the not-found state)', () => {
      renderLoaded(<PostLinkEmbeds content={`${origin}/post/${pubky}/typo`} />);

      // Post ID shape is not validated; PostPreviewCard resolves the id and
      // renders PostMissing on 404, matching repost behavior.
      const card = screen.getByTestId('post-preview-card');
      expect(card).toHaveAttribute('data-post-id', `${pubky}:typo`);
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
    });

    it('falls back to generic preview for a route-shaped URL with an invalid pubky', () => {
      renderLoaded(<PostLinkEmbeds content={`${origin}/post/not-a-pubky/${postId}`} />);

      expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
      expect(screen.getByTestId('generic-preview')).toBeInTheDocument();
    });

    it('falls back to generic preview for the bookmarks pseudo-collection URL', () => {
      renderLoaded(<PostLinkEmbeds content={`${origin}/collections/bookmarks`} />);

      expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
      expect(screen.getByTestId('generic-preview')).toBeInTheDocument();
    });

    it('falls back to generic preview for a different-host post URL', () => {
      renderLoaded(<PostLinkEmbeds content={`https://pubky.app/post/${pubky}/${postId}`} />);

      expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
      expect(screen.getByTestId('generic-preview')).toBeInTheDocument();
    });

    it('renders nothing for an in-app URL inside an embedded post preview', () => {
      renderLoaded(
        <PostPreviewNestingProvider>
          <PostLinkEmbeds content={`${origin}/post/${pubky}/${postId}`} />
        </PostPreviewNestingProvider>,
      );

      expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
      expect(screen.queryByTestId('container')).not.toBeInTheDocument();
    });

    it('renders nothing for an in-app URL inside a non-navigating preview (reply/repost dialog)', () => {
      renderLoaded(
        <PostPreviewNestingProvider navigable={false}>
          <PostLinkEmbeds content={`${origin}/post/${pubky}/${postId}`} />
        </PostPreviewNestingProvider>,
      );

      expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
      expect(screen.queryByTestId('container')).not.toBeInTheDocument();
    });

    it('still renders external embeds inside an embedded post preview', () => {
      renderLoaded(
        <PostPreviewNestingProvider>
          <PostLinkEmbeds content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
        </PostPreviewNestingProvider>,
      );

      expect(screen.getByTestId('YouTube video player')).toBeInTheDocument();
    });
  });

  describe('Link in the text', () => {
    afterEach(() => {
      vi.mocked(isPinakesConfigured).mockReturnValue(false);
    });

    it('keeps the website preview of a link that is only in the text, also when Pinakes is configured', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);

      renderLoaded(<PostLinkEmbeds content="Read https://en.wikipedia.org/wiki/Bitcoin" />);

      expect(screen.getByTestId('generic-preview')).toHaveAttribute(
        'data-url',
        'https://en.wikipedia.org/wiki/Bitcoin',
      );
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByText(/^Tags on/)).not.toBeInTheDocument();
      expect(usePinakesCard).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('does not render embed for content without URLs', () => {
      renderLoaded(<PostLinkEmbeds content="Just some regular text without any links" />);

      expect(screen.queryByTestId('container')).not.toBeInTheDocument();
    });

    it('does not render embed for empty content', () => {
      renderLoaded(<PostLinkEmbeds content="" />);

      expect(screen.queryByTestId('container')).not.toBeInTheDocument();
    });

    it('handles content with multiple URLs, uses first one', () => {
      renderLoaded(
        <PostLinkEmbeds content="First: https://www.youtube.com/watch?v=dQw4w9WgXcQ Second: https://www.example.com" />,
      );

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('handles URLs without protocol', () => {
      renderLoaded(<PostLinkEmbeds content="No protocol: youtube.com/watch?v=dQw4w9WgXcQ" />);

      const iframe = screen.getByTestId('YouTube video player');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute(
        'src',
        withAutoplay('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1'),
      );
    });

    it('stops event propagation when clicking embed container', () => {
      const handleParentClick = vi.fn();

      render(
        <div onClick={handleParentClick}>
          <PostLinkEmbeds content="Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
        </div>,
      );

      // The embeds' outer container
      const [container] = screen.getAllByTestId('container');
      expect(container).toBeInTheDocument();

      // Click the embed container
      fireEvent.click(container);

      // Parent click handler should not be called due to stopPropagation
      expect(handleParentClick).not.toHaveBeenCalled();
    });
  });

  describe('url prop', () => {
    afterEach(() => {
      vi.mocked(isPinakesConfigured).mockReturnValue(false);
      vi.mocked(usePinakesCard).mockReturnValue({ data: null, isLoading: false, isError: false });
    });

    it('embeds the given link instead of the first link of the text', () => {
      render(<PostLinkEmbeds content="First https://example.com/first" url="https://example.com/embedded" />);

      expect(screen.getByTestId('generic-preview')).toHaveAttribute('data-url', 'https://example.com/embedded');
    });

    it('embeds the given link without any text', () => {
      renderLoaded(<PostLinkEmbeds url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

      expect(screen.getByTestId('YouTube video player')).toBeInTheDocument();
    });

    it.each(['ws://www.youtube.com/watch?v=dQw4w9WgXcQ', 'intent://x.com/i/status/1'])(
      'never reads a platform from the host of a URI that is not web: %s',
      (url) => {
        vi.mocked(isPinakesConfigured).mockReturnValue(true);
        render(<PostLinkEmbeds url={url} />);

        expect(screen.queryByTestId('YouTube video player')).not.toBeInTheDocument();
        expect(screen.queryByTestId('native-embed-resource')).not.toBeInTheDocument();
        expect(screen.getByTestId('resource-preview')).toBeInTheDocument();
      },
    );

    it('makes no preview request for a URI that is not web without Pinakes', () => {
      const { container } = render(<PostLinkEmbeds url="isbn:9780141036144" />);

      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
      expect(container.querySelector('a')).toBeNull();
    });

    it('shows the external resource card of the given link when Pinakes knows it', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      vi.mocked(usePinakesCard).mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

      render(<PostLinkEmbeds url="https://en.wikipedia.org/wiki/Bitcoin" />);

      expect(usePinakesCard).toHaveBeenCalledWith('https://en.wikipedia.org/wiki/Bitcoin', {
        recheck: false,
        resolve: false,
      });
      expect(screen.getByTestId('resource-card')).toHaveTextContent(articleFixture.name);
      expect(screen.getByTestId('resource-actions')).toBeInTheDocument();
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
    });

    it('keeps the action row and tag bar on the given link’s card while composing', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      vi.mocked(usePinakesCard).mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

      render(<PostLinkEmbeds url="https://en.wikipedia.org/wiki/Bitcoin" isComposing />);

      const card = screen.getByTestId('resource-card');
      expect(card).toHaveTextContent(articleFixture.name);
      expect(within(card).getByTestId('resource-actions')).toBeInTheDocument();
    });

    it('keeps the website preview of a link that is only in the text, also when Pinakes knows it', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      vi.mocked(usePinakesCard).mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

      render(<PostLinkEmbeds content="Read https://en.wikipedia.org/wiki/Bitcoin" url={null} />);

      expect(screen.getByTestId('generic-preview')).toHaveAttribute(
        'data-url',
        'https://en.wikipedia.org/wiki/Bitcoin',
      );
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
      expect(screen.queryByText(/^Tags on/)).not.toBeInTheDocument();
      expect(usePinakesCard).not.toHaveBeenCalledWith('https://en.wikipedia.org/wiki/Bitcoin');
    });

    it('keeps the website preview of a link typed in the composer that is not embedded', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      vi.mocked(usePinakesCard).mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

      render(<PostLinkEmbeds content="Read https://en.wikipedia.org/wiki/Bitcoin" isComposing />);

      expect(screen.getByTestId('generic-preview')).toHaveAttribute(
        'data-url',
        'https://en.wikipedia.org/wiki/Bitcoin',
      );
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
    });

    it('shows only the embedded link’s card when the text holds another link', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      vi.mocked(usePinakesCard).mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

      render(
        <PostLinkEmbeds
          content="See https://example.com/first and https://en.wikipedia.org/wiki/Bitcoin"
          url="https://en.wikipedia.org/wiki/Bitcoin"
        />,
      );

      expect(screen.getAllByTestId('resource-card')).toHaveLength(1);
      expect(screen.getByTestId('resource-card')).toHaveTextContent(articleFixture.name);
      expect(screen.getByTestId('resource-actions')).toBeInTheDocument();
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
      expect(usePinakesCard).not.toHaveBeenCalledWith('https://example.com/first');
    });

    it('keeps a provider player for an embedded link, loaded by its press', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);

      renderLoaded(<PostLinkEmbeds url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);

      expect(screen.getByTestId('YouTube video player')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
    });

    it('falls back to the first link of the text when the link is null', () => {
      render(<PostLinkEmbeds content="First https://example.com/first" url={null} />);

      expect(screen.getByTestId('generic-preview')).toHaveAttribute('data-url', 'https://example.com/first');
    });
  });

  describe('a platform embed as the post’s embed', () => {
    const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    // The embed reads Pinakes once its box comes near the screen: here it is there at once.
    beforeEach(() => {
      viewport.isVisible = true;
    });

    it('shows as the external resource when Pinakes is configured, the platform’s embed only on its press', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      render(<PostLinkEmbeds url={VIDEO} />);

      const resource = screen.getByTestId('native-embed-resource');
      expect(resource).toHaveAttribute('data-kind', 'video');
      // No card: the link's own preview as a card, nothing from the platform before the press.
      const card = within(resource).getByTestId('resource-link-card');
      expect(document.querySelector('iframe')).toBeNull();
      expectNoThirdPartyLoads();
      fireEvent.click(within(card).getByRole('button', { name: 'Play on YouTube' }));
      expect(within(card).getByTestId('YouTube video player').getAttribute('src')).toContain('autoplay=1');
    });

    it('previews it as the resource in the composer too, asking Pinakes to read it, with the footer', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      // A video in a mix, with list and radio parameters.
      const MIX = 'https://www.youtube.com/watch?v=CMX2lPum_pg&list=RDCMX2lPum_pg&start_radio=1';
      render(<PostLinkEmbeds url={MIX} isComposing />);

      expect(vi.mocked(usePinakesCard)).toHaveBeenCalledWith(MIX, { resolve: true });
      const resource = screen.getByTestId('native-embed-resource');
      expect(within(resource).getByTestId('resource-link-card')).toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
      fireEvent.click(within(resource).getByRole('button', { name: 'Play on YouTube' }));
      expect(within(resource).getByTestId('YouTube video player')).toHaveAttribute(
        'src',
        expect.stringContaining('/embed/CMX2lPum_pg'),
      );
      expect(within(resource).getByTestId('resource-actions')).toBeInTheDocument();
    });

    it.each([true, false])('keeps the resource frame and actions inside a quoted post (navigable=%s)', (navigable) => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      render(
        <PostPreviewNestingProvider navigable={navigable}>
          <PostLinkEmbeds url={VIDEO} />
        </PostPreviewNestingProvider>,
      );

      const resource = screen.getByTestId('native-embed-resource');
      expect(within(resource).getByTestId('resource-link-card')).toBeInTheDocument();
      expect(within(resource).getByTestId('resource-actions')).toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
      fireEvent.click(within(resource).getByRole('button', { name: 'Play on YouTube' }));
      expect(within(resource).getAllByTestId('YouTube video player')).toHaveLength(1);
      expect(screen.queryByTestId('post-preview-card')).not.toBeInTheDocument();
    });

    it('starts over for another link (state of the old embed does not carry over)', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      const { rerender } = render(<PostLinkEmbeds url={VIDEO} />);
      const first = screen.getByTestId('native-embed-resource');
      rerender(<PostLinkEmbeds url="https://www.youtube.com/watch?v=jNQXAC9IVRw" />);
      expect(screen.getByTestId('native-embed-resource')).not.toBe(first);
    });

    it('keeps the plain embed for a link only in the text, and without Pinakes', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);

      const { unmount: unmountText } = render(<PostLinkEmbeds content={`see ${VIDEO}`} />);
      expect(screen.queryByTestId('native-embed-resource')).not.toBeInTheDocument();
      unmountText();

      vi.mocked(isPinakesConfigured).mockReturnValue(false);
      render(<PostLinkEmbeds url={VIDEO} />);
      expect(screen.queryByTestId('native-embed-resource')).not.toBeInTheDocument();
    });
  });

  describe('a platform the viewer removed from Players', () => {
    const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const hide = (hiddenPlayers: string[]) =>
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, hiddenPlayers } });

    afterEach(() => {
      hide([]);
      vi.mocked(isPinakesConfigured).mockReturnValue(false);
      vi.mocked(usePinakesCard).mockReturnValue({ data: null, isLoading: false, isError: false });
    });

    it('shows the post’s embedded link as our card with its footer, loading nothing from the platform', () => {
      hide(['youtube']);
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      vi.mocked(usePinakesCard).mockReturnValue({
        data: { ...articleFixture, uri: VIDEO, also_on: [] },
        isLoading: false,
        isError: false,
      });
      render(<PostLinkEmbeds url={VIDEO} />);

      expect(screen.queryByTestId('native-embed-resource')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card')).toHaveTextContent(articleFixture.name);
      expect(screen.getByTestId('resource-actions')).toBeInTheDocument();
      expect(document.querySelectorAll('iframe')).toHaveLength(0);
    });

    it('shows a link in the text as the link’s own preview', () => {
      hide(['youtube', 'vimeo']);
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      render(<PostLinkEmbeds content={`see ${VIDEO}`} />);
      expect(screen.getByTestId('generic-preview')).toHaveAttribute('data-url', VIDEO);
      expect(document.querySelectorAll('iframe')).toHaveLength(0);
    });

    it('keeps every player without Pinakes, where Links & Media is hidden and could not undo it', () => {
      hide(['youtube']);
      renderLoaded(<PostLinkEmbeds url={VIDEO} />);
      expect(screen.getByTestId('YouTube video player')).toBeInTheDocument();
      expect(screen.queryByTestId('generic-preview')).not.toBeInTheDocument();
    });

    it('keeps the embeds of the platforms still listed, and X posts, which are no player', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      hide(['vimeo', 'youtube', 'spotify', 'soundcloud', 'mixcloud', 'tidal', 'deezer']);
      const { unmount } = renderLoaded(<PostLinkEmbeds content="see https://x.com/user/status/1234567890123456789" />);
      expect(screen.getByTestId('twitter-tweet')).toBeInTheDocument();
      unmount();

      hide(['vimeo']);
      renderLoaded(<PostLinkEmbeds content={`see ${VIDEO}`} />);
      expect(screen.getByTestId('YouTube video player')).toBeInTheDocument();
    });
  });
});
