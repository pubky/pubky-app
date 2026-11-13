import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { isPinakesConfigured, PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { PostLinkEmbeds } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { ResourceItem } from './ResourceItem';

const mocks = vi.hoisted(() => ({
  card: vi.fn(),
  pauseBoxes: [] as HTMLElement[],
  tweet: vi.fn<(id: string) => { data: unknown; error: unknown; isLoading: boolean }>(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Without Pinakes unless a test configures it, as in the app with no Pinakes origin.
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: vi.fn(() => false),
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: mocks.card }));
// On screen (jsdom has no layout).
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: true }),
}));
// The box whose media pauses off screen and stops other media when it starts (its own tests).
vi.mock('@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport', () => ({
  usePauseMediaOutsideViewport: () => (box: HTMLElement | null) => {
    if (box) mocks.pauseBoxes.push(box);
  },
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
vi.mock('@/molecules/ResourcePlayer/ResourcePlayerFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/molecules/ResourcePlayer/ResourcePlayerFrame')>()),
  AnimatedHeight: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// The footer has its own tests: here only that it is there, on the item's surface, with its pill.
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: function ResourceActions({ uri, playOn }: { uri: string; playOn?: React.ReactNode }) {
    return (
      <div data-testid="resource-actions" data-uri={uri} data-surface={useResourceSurface()}>
        {playOn}
      </div>
    );
  },
}));
// X's embed loads through react-tweet (X's syndication): `useTweet` is that request.
vi.mock('react-tweet', () => ({
  useTweet: mocks.tweet,
  EmbeddedTweet: ({ tweet }: { tweet: { id_str: string } }) => (
    <div data-testid="twitter-tweet" data-tweet-id={tweet.id_str} />
  ),
  TweetSkeleton: () => <div data-testid="twitter-tweet-skeleton" />,
  TweetNotFound: () => <div data-testid="twitter-tweet-not-found" />,
}));
// The card a post shows for a link has its own tests: here only which item gets one matters.
vi.mock('@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview', async () => {
  const { useResourceSurface } = await import('@/molecules/ResourceCard/ResourceSurfaceContext');
  function GenericResourcePreview({ url }: { url: string }) {
    return <div data-testid="preview" data-url={url} data-surface={useResourceSurface()} />;
  }
  return { GenericResourcePreview };
});

const DECK =
  'pubky://1kzgu8sshfqyaqqbm8hkxww18juw6mms8rszs1e8hrg8sy4uasio/pub/loopky/decks/english3000-ha/manifest.json';
const NOTHING = { data: null, isLoading: false, isError: false };

describe('ResourceItem', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  beforeEach(() => {
    mocks.card.mockReset();
    mocks.card.mockReturnValue(NOTHING);
  });

  it('shows a web link as the card a post shows for it, with no read of its own', () => {
    render(<ResourceItem uri="https://example.com/a" data-testid="item" />);

    expect(screen.getByTestId('preview')).toHaveAttribute('data-url', 'https://example.com/a');
    expect(screen.getByTestId('preview')).toHaveAttribute('data-surface', 'card');
    expect(screen.getByTestId('item')).not.toHaveClass('bg-card');
    expect(mocks.card).toHaveBeenCalledWith(null);
  });

  it('shows a Pubky object Pinakes has a card for as that card, never as its path', () => {
    mocks.card.mockReturnValue({
      data: { uri: DECK, name: 'Turanci: kalmomi da jimloli 3,000 mafi amfani', site: 'loopky' },
      isLoading: false,
      isError: false,
    });
    render(<ResourceItem uri={DECK} data-testid="item" />);

    expect(mocks.card).toHaveBeenCalledWith(DECK);
    expect(screen.getByTestId('preview')).toHaveAttribute('data-url', DECK);
    expect(screen.getByTestId('item')).not.toHaveClass('bg-card');
    expect(screen.queryByText(/manifest\.json/i)).not.toBeInTheDocument();
  });

  it('holds the card’s place while Pinakes is read, and gives way to the row when the read is slow', () => {
    vi.useFakeTimers();
    mocks.card.mockReturnValue({ data: null, isLoading: true, isError: false });
    render(<ResourceItem uri={DECK} data-testid="item" />);

    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(PINAKES_SLOW_READ_MS));
    expect(screen.getByRole('link').textContent).toBe('loopky');
  });

  it('keeps the row for a failed read and for a card with no name', () => {
    mocks.card.mockReturnValue({ data: null, isLoading: false, isError: true });
    const { rerender } = render(<ResourceItem uri={DECK} data-testid="item" />);
    expect(screen.getByRole('link').textContent).toBe('loopky');

    mocks.card.mockReturnValue({ data: { uri: DECK, name: ' ', site: 'loopky' }, isLoading: false, isError: false });
    rerender(<ResourceItem uri={DECK} data-testid="item" />);
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(screen.getByRole('link').textContent).toBe('loopky');
  });

  it('shows no row while Pinakes is read', () => {
    mocks.card.mockReturnValue({ data: null, isLoading: true, isError: false });
    render(<ResourceItem uri={DECK} data-testid="item" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('item')).not.toHaveClass('bg-card');
  });

  it('names a Pubky object Pinakes does not know by its app, in a row opening its page', () => {
    render(<ResourceItem uri={DECK} data-testid="item" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', getResourceRoute(DECK));
    expect(link.textContent).toBe('loopky');
    expect(screen.getByTestId('item')).toHaveClass('bg-card', 'rounded-md', 'p-4');
  });

  it('shows an identifier once in its row, not again as a note', () => {
    render(<ResourceItem uri="isbn:9780140328721" />);

    expect(mocks.card).toHaveBeenCalledWith('isbn:9780140328721');
    expect(screen.getByRole('link').textContent).toBe('9780140328721');
  });

  it('never asks Pinakes about a URI no post may name', () => {
    render(<ResourceItem uri="javascript:alert(1)" />);

    expect(mocks.card).toHaveBeenCalledWith(null);
    expect(screen.getByRole('link')).toHaveAttribute('href', getResourceRoute('javascript:alert(1)'));
  });

  describe('a link with a platform embed, as its page and a post show it', () => {
    const POST_URL = 'https://x.com/lnbits/status/1987654321098765432';
    const VIDEO_URL = videoFixture.uri;
    const VIMEO_URL = 'https://vimeo.com/76979871';
    const POST_CARD: TPinakesResourceDetail = {
      ...videoFixture,
      uri: POST_URL,
      name: 'LNbits: a post',
      description: 'LNbits: a post',
      site: 'x.com',
      type: 'SocialMediaPosting',
      type_path: ['Thing', 'CreativeWork', 'SocialMediaPosting'],
      image: null,
      also_on: [],
    };
    const setMedia = (media: Partial<typeof defaultMediaPreferences>) =>
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, ...media } });
    const read = (data: TPinakesResourceDetail | null) =>
      mocks.card.mockImplementation((uri: string | null) => ({
        data: uri ? data : null,
        isLoading: false,
        isError: false,
      }));

    beforeEach(() => {
      vi.mocked(isPinakesConfigured).mockReturnValue(true);
      mocks.pauseBoxes.length = 0;
      mocks.tweet.mockReset();
      mocks.tweet.mockImplementation((id: string) => ({ data: { id_str: id }, error: null, isLoading: false }));
    });
    afterEach(() => {
      vi.mocked(isPinakesConfigured).mockReturnValue(false);
      setMedia({});
    });

    it('shows an X post with no Also on as X’s own embed up front, on the item’s card surface', () => {
      read(POST_CARD);
      render(<ResourceItem uri={POST_URL} data-testid="item" />);

      const resource = screen.getByTestId('native-embed-resource');
      expect(resource).toHaveAttribute('data-kind', 'post');
      expect(within(screen.getByTestId('native-embed-body')).getByTestId('twitter-tweet')).toHaveAttribute(
        'data-tweet-id',
        '1987654321098765432',
      );
      // X's embed fills the card's width, as on a post.
      expect(screen.getByTestId('twitter-container')).not.toHaveClass('max-w-70');
      expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
      // The item's frame: its type opens the resource page, its source the link, the footer on the card surface.
      const frame = screen.getByTestId('resource-embed-frame');
      expect(
        within(frame)
          .getAllByRole('link')
          .map((link) => link.getAttribute('href')),
      ).toEqual(expect.arrayContaining([getResourceRoute(POST_URL), POST_URL]));
      expect(within(frame).getByTestId('resource-actions')).toHaveAttribute('data-surface', 'card');
      expect(screen.getByTestId('item')).toHaveClass('@container/grid');
      expect(screen.getByTestId('item')).not.toHaveClass('bg-card');
    });

    it('keeps our card with Show on, loading nothing from X, when platform embeds up front are off', () => {
      setMedia({ embedsUpFront: false });
      read(POST_CARD);
      render(<ResourceItem uri={POST_URL} />);

      expect(screen.getByTestId('resource-card')).toHaveTextContent('LNbits: a post');
      expect(screen.queryByTestId('native-embed-body')).not.toBeInTheDocument();
      expect(mocks.tweet).not.toHaveBeenCalled();
      expect(document.querySelectorAll('iframe')).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: /^Show on / }));
      expect(within(screen.getByTestId('native-embed-body')).getByTestId('twitter-tweet')).toBeInTheDocument();
    });

    it('pauses the platform’s embed off screen as a post does, and leaves any other link’s card as it was', () => {
      read(null);
      const { unmount } = render(<ResourceItem uri={VIDEO_URL} />);
      expect(mocks.pauseBoxes).toHaveLength(1);
      expect(mocks.pauseBoxes[0]).toContainElement(screen.getByTestId('native-embed-resource'));
      unmount();

      mocks.pauseBoxes.length = 0;
      render(<ResourceItem uri="https://example.com/a" />);
      expect(mocks.pauseBoxes).toHaveLength(0);
    });

    it('gives way to our card when X cannot show the post', () => {
      mocks.tweet.mockReturnValue({ data: null, error: new Error('gone'), isLoading: false });
      read(POST_CARD);
      render(<ResourceItem uri={POST_URL} />);

      expect(screen.getByTestId('resource-card')).toHaveTextContent('LNbits: a post');
      expect(screen.queryByTestId('native-embed-body')).not.toBeInTheDocument();
      expect(screen.queryByTestId('twitter-tweet-not-found')).not.toBeInTheDocument();
    });

    it('shows a YouTube video Pinakes has read as a post shows it: its player up front', () => {
      read({ ...videoFixture, also_on: [] });
      const { unmount } = render(<PostLinkEmbeds url={VIDEO_URL} />);
      const inPost = screen.getByTestId('resource-player-frame').getAttribute('src');
      unmount();

      render(<ResourceItem uri={VIDEO_URL} />);
      expect(screen.getByTestId('native-embed-resource')).toHaveAttribute('data-kind', 'video');
      expect(screen.getByTestId('resource-player-frame')).toHaveAttribute('src', inPost);
      expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    });

    it.each([
      ['YouTube', VIDEO_URL],
      ['Vimeo', VIMEO_URL],
    ])('shows a %s video Pinakes does not know as the platform’s embed, as a post does', (_, url) => {
      read(null);
      render(<ResourceItem uri={url} />);

      expect(screen.getByTestId('native-embed-resource')).toHaveAttribute('data-kind', 'video');
      expect(within(screen.getByTestId('native-embed-body')).getByTitle(/video/i).tagName).toBe('IFRAME');
      expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    });

    it('keeps no live frame of a video Pinakes does not know while the feed is hidden behind an open post', () => {
      // The box tells its size through a size observer; hidden (`display: none` above it), it is laid out nowhere.
      const observed: { callback: ResizeObserverCallback; observer: ResizeObserver; target: Element }[] = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(private callback: ResizeObserverCallback) {}
          observe(target: Element) {
            observed.push({ callback: this.callback, observer: asOpaque<ResizeObserver>(this), target });
          }
          unobserve() {}
          disconnect() {}
        },
      );
      let hidden = false;
      const rects = vi
        .spyOn(Element.prototype, 'getClientRects')
        .mockImplementation(() => asOpaque<DOMRectList>(hidden ? [] : [{}]));
      onTestFinished(() => {
        rects.mockRestore();
        vi.unstubAllGlobals();
      });
      const setHidden = (value: boolean) =>
        act(() => {
          hidden = value;
          const box = screen.getByTestId('native-embed-resource');
          observed.filter(({ target }) => target === box).forEach(({ callback, observer }) => callback([], observer));
        });
      read(null);
      render(<ResourceItem uri={VIMEO_URL} />);
      expect(document.querySelectorAll('iframe')).toHaveLength(1);

      setHidden(true);
      expect(document.querySelectorAll('iframe')).toHaveLength(0);
      expect(screen.getByTestId('resource-embed-frame')).toBeInTheDocument();

      setHidden(false);
      expect(document.querySelectorAll('iframe')).toHaveLength(1);
    });

    it('shows the video of a platform the viewer removed from Players as any link, with no embed from it', () => {
      setMedia({ hiddenPlayers: ['youtube'] });
      read({ ...videoFixture, also_on: [] });
      render(<ResourceItem uri={VIDEO_URL} />);

      expect(screen.queryByTestId('native-embed-resource')).not.toBeInTheDocument();
      expect(screen.getByTestId('preview')).toHaveAttribute('data-url', VIDEO_URL);
      expect(document.querySelectorAll('iframe')).toHaveLength(0);
    });

    it('keeps X’s embed when every player is removed: an X post is no player', () => {
      setMedia({ hiddenPlayers: ['youtube', 'vimeo', 'spotify', 'soundcloud', 'mixcloud', 'tidal', 'deezer'] });
      read(POST_CARD);
      render(<ResourceItem uri={POST_URL} />);

      expect(within(screen.getByTestId('native-embed-body')).getByTestId('twitter-tweet')).toBeInTheDocument();
    });

    it.each([
      ['a generic link', 'https://example.com/a'],
      ['a music link', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'],
    ])('keeps %s as the card a post shows for it', (_, url) => {
      render(<ResourceItem uri={url} />);

      expect(screen.getByTestId('preview')).toHaveAttribute('data-url', url);
      expect(screen.getByTestId('preview')).toHaveAttribute('data-surface', 'card');
      expect(screen.queryByTestId('native-embed-resource')).not.toBeInTheDocument();
    });

    it('keeps the card without Pinakes, as a post keeps its plain embed', () => {
      vi.mocked(isPinakesConfigured).mockReturnValue(false);
      render(<ResourceItem uri={POST_URL} />);

      expect(screen.getByTestId('preview')).toHaveAttribute('data-url', POST_URL);
      expect(screen.queryByTestId('native-embed-resource')).not.toBeInTheDocument();
    });
  });
});
