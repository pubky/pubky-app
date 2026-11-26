import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, onTestFinished, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { expectNoThirdPartyLoads } from '@/test-utils/third-party';
import { asOpaque } from '@/test-utils/type-assertions';
import { NativeEmbedResource, type RenderNativeEmbed } from './NativeEmbedResource';

beforeEach(() => {
  useSettingsStore.setState({ media: defaultMediaPreferences });
  xPostRead.post = null;
  xPostRead.pending = false;
  xPostRead.ids = [];
});

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
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
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: vi.fn() }));
const viewport = vi.hoisted(() => ({ isVisible: true }));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: viewport.isVisible }),
}));
const og = vi.hoisted(() => ({
  metadata: null as null | { url: string; type: 'website'; title: string; image: string },
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: (url: string | null) => ({ metadata: url ? og.metadata : null, isLoading: false, error: null }),
}));
vi.mock('@/molecules/ResourcePlayer/ResourcePlayerFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/molecules/ResourcePlayer/ResourcePlayerFrame')>()),
  AnimatedHeight: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// The footer has its own tests: here only what it is given (Play on / Show on, Also on in ⋯).
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: ({
    uri,
    playOn,
    extraMenuContent,
    card,
  }: {
    uri: string;
    playOn?: React.ReactNode;
    extraMenuContent?: unknown;
    card?: { id: string } | null;
  }) => (
    <div
      data-testid="resource-actions"
      data-uri={uri}
      data-has-also-on={String(Boolean(extraMenuContent))}
      data-card-id={card?.id ?? 'none'}
    >
      {playOn}
    </div>
  ),
}));

const VIDEO_URL = videoFixture.uri;
const POST_URL = 'https://x.com/someone/status/2118393153103470770';

const VIDEO_ALONE: TPinakesResourceDetail = { ...videoFixture, also_on: [] };
/** The video without its tracks on Spotify, Deezer and TIDAL: on YouTube and Apple Music. */
const VIDEO_WITH_ALSO_ON: TPinakesResourceDetail = {
  ...videoFixture,
  also_on: videoFixture.also_on.filter((entry) => !['Spotify', 'Deezer', 'TIDAL'].includes(entry.site ?? '')),
};
const POST_CARD: TPinakesResourceDetail = {
  ...videoFixture,
  uri: POST_URL,
  name: 'BREAKING: a post',
  description: 'BREAKING: a post',
  site: 'x.com',
  type: 'SocialMediaPosting',
  type_path: ['Thing', 'CreativeWork', 'SocialMediaPosting'],
  image: null,
  also_on: [],
};
/** An X post Pinakes types as a video, on YouTube too. */
const POST_AS_VIDEO: TPinakesResourceDetail = {
  ...POST_CARD,
  type: 'VideoObject',
  type_path: ['Thing', 'CreativeWork', 'MediaObject', 'VideoObject'],
  also_on: videoFixture.also_on.filter((entry) => entry.site === 'YouTube'),
};
const POST_WITH_ALSO_ON: TPinakesResourceDetail = {
  ...POST_CARD,
  also_on: [{ ...videoFixture.also_on[0], uri: 'https://bsky.app/profile/someone/post/3abc', site: 'Bluesky' }],
};

const embed = vi.fn<RenderNativeEmbed>(() => <div data-testid="platform-embed" />);
const mockCard = (data: TPinakesResourceDetail | null | undefined, isLoading = false) =>
  vi.mocked(usePinakesCard).mockReturnValue({ data: data ?? undefined, isLoading, isError: false });

describe('NativeEmbedResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewport.isVisible = true;
  });

  it('gives the footer the card, on our card and with the drawn player, for its other links’ tags', () => {
    const withAlsoOn = { ...videoFixture, id: 'with-also-on' };
    mockCard(withAlsoOn);
    const { unmount } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card-id', 'with-also-on');
    unmount();

    // An X post Pinakes knows nowhere else: our card, the post from its data, and the card for the footer.
    mockCard({ ...POST_CARD, id: 'post-alone' });
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-card')).toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card-id', 'post-alone');
  });

  it('reads the card for the link as written, re-reads it while on screen, and asks Pinakes to read a link it does not know', () => {
    mockCard(VIDEO_ALONE);
    render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

    expect(usePinakesCard).toHaveBeenCalledWith(VIDEO_URL, { recheck: true, resolveOnView: true });
  });

  it('holds the skeleton while Pinakes reads a link it did not know on view, loading nothing', () => {
    vi.mocked(usePinakesCard).mockReturnValue({ data: null, isLoading: false, isError: false, isResolving: true });
    render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();
    expectNoThirdPartyLoads();
  });

  it('reads nothing and mounts no footer before it first comes near the screen, then keeps it', () => {
    viewport.isVisible = false;
    mockCard(null);
    const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

    expect(usePinakesCard).not.toHaveBeenCalled();
    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();

    viewport.isVisible = true;
    rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();

    // Scrolled away again: what was read stays, only the re-reads stop.
    viewport.isVisible = false;
    rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
    expect(usePinakesCard).toHaveBeenLastCalledWith(VIDEO_URL, { recheck: false, resolveOnView: true });
    expect(embed).not.toHaveBeenCalled();
  });

  it('reads the composer’s link at once, wherever the box is', () => {
    viewport.isVisible = false;
    mockCard(VIDEO_ALONE);
    render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);

    expect(usePinakesCard).toHaveBeenCalledWith(VIDEO_URL, { resolve: true });
  });

  describe('a link with Also on', () => {
    it('draws the video’s player in the resource frame, its other services in the header’s switch', () => {
      mockCard(VIDEO_WITH_ALSO_ON);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('player-facade')).toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
      expect(embed).not.toHaveBeenCalled();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      const header = screen.getByTestId('resource-card-source').parentElement!;
      expect(within(header).getByRole('button', { name: 'YouTube: choose another service' })).toBeInTheDocument();
      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-has-also-on', 'true');
    });

    it('opens the resource page from the frame’s header, never from the player or its switch', () => {
      mockCard(VIDEO_WITH_ALSO_ON);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      fireEvent.click(screen.getByTestId('player-facade'));
      fireEvent.click(screen.getByTestId('resource-player'));
      fireEvent.click(screen.getByRole('button', { name: 'YouTube: choose another service' }));
      expect(mockPush).not.toHaveBeenCalled();
      // The header's surface (the type is a link of its own).
      fireEvent.click(screen.getByTestId('resource-card-type').parentElement!);
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(videoFixture.uri));
    });

    it('keeps X’s embed for an X post Pinakes types as a video: no player in its place', () => {
      mockCard(POST_AS_VIDEO);
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      expect(screen.queryByTestId('resource-player-frame')).not.toBeInTheDocument();
      expect(screen.queryByTestId('embed-player')).not.toBeInTheDocument();
    });

    it('shows an X post from its card’s data at once: author, handle, text, date, no press', () => {
      mockCard({
        ...POST_WITH_ALSO_ON,
        facts: { author: 'someone', author_name: 'Some One', published: '2026-11-20' },
      });
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      const post = screen.getByTestId('resource-card-post');
      expect(within(post).getByTestId('resource-card-post-author')).toHaveTextContent('Some One@someone');
      expect(within(post).getByTestId('resource-card-title')).toHaveTextContent('BREAKING: a post');
      expect(within(post).getByTestId('resource-card-post-date')).toHaveTextContent('Nov 20, 2026');
      // Nothing to press, nothing from X.
      expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
      expectNoThirdPartyLoads();
      // The card still opens the resource page.
      fireEvent.click(screen.getByTestId('resource-card-type'));
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(POST_WITH_ALSO_ON.uri));
    });

    it('shows the link preview’s image of an X post with no Pinakes image from the app’s image route only', () => {
      og.metadata = { url: POST_URL, type: 'website', title: 'A post', image: 'https://pbs.twimg.com/media/og.jpg' };
      onTestFinished(() => {
        og.metadata = null;
      });
      mockCard(POST_CARD);
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      // The link preview has been read: its image is named by the card on the app's route (its own link's preview), never loaded from X.
      expect(within(screen.getByTestId('resource-card-image')).getByRole('img').getAttribute('src')).toMatch(
        /^\/api\/image\?uri=.*&og=1&src=/,
      );
      expectNoThirdPartyLoads();
      expect(embed).not.toHaveBeenCalled();
    });

    it('draws an X post Pinakes could not reach as the press in its card: the card says so, the post is one press away', () => {
      mockCard({ ...POST_CARD, status: 'unreachable' });
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      expect(screen.queryByTestId('resource-card-post')).not.toBeInTheDocument();
      // No pill: the press is inside the card, and nothing loads from X before it.
      expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
      expectNoThirdPartyLoads();
      fireEvent.click(within(screen.getByTestId('resource-card-player')).getByTestId('post-press'));
      expect(within(screen.getByTestId('resource-card-player')).getByTestId('platform-embed')).toBeInTheDocument();
      expect(screen.getByTestId('resource-card')).toBeInTheDocument();

      // Close: the card as it was, the press again.
      fireEvent.click(screen.getByTestId('post-press-close'));
      expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
      expect(screen.getByTestId('post-press')).toBeInTheDocument();
    });

    it('shows a video post’s text at once from its card and keeps a Play for its video', () => {
      // The candidate's X card shape, with a video it carries.
      mockCard({
        ...POST_CARD,
        facts: { author: 'someone', author_name: 'Some One', published: '2026-11-20' },
        stream: { url: 'https://video.twimg.com/a.mp4', type: 'video/mp4', preview: false },
      });
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      expect(screen.getByTestId('resource-card-post')).toHaveTextContent('BREAKING: a post');
      expect(embed).not.toHaveBeenCalled();
      expectNoThirdPartyLoads();
      fireEvent.click(screen.getByRole('button', { name: 'Play on x.com' }));
      // Its MP4 on X's video host plays in the app's player inside the post.
      expect(within(screen.getByTestId('resource-card-player')).getByTestId('x-post-video')).toHaveAttribute(
        'data-src',
        'https://video.twimg.com/a.mp4',
      );
      expect(embed).not.toHaveBeenCalled();
      expect(screen.getByTestId('resource-card-post')).toBeInTheDocument();
    });

    it.each([
      ['its link preview’s image', null, 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still.jpg'],
      ['its own image', 'https://pbs.twimg.com/amplify_video_thumb/2/img/still.jpg', null],
    ])(
      'keeps "Play on x.com" for a real X card whose video still is %s, loading X only on the press',
      (_case, image, ogImage) => {
        og.metadata = ogImage ? { url: POST_URL, type: 'website', title: 'A post', image: ogImage } : null;
        onTestFinished(() => {
          og.metadata = null;
        });
        // The candidate's X card shape: SocialMediaPosting, embed kind post, no stream.
        mockCard({
          ...POST_CARD,
          image,
          group: null,
          embed: {
            provider: 'x',
            kind: 'post',
            src: 'https://platform.twitter.com/embed/Tweet.html?id=1&dnt=true',
            height: null,
            aspect: null,
            allow: [],
            autoplay_param: null,
          },
        });
        render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

        expect(screen.getByTestId('resource-card-post')).toHaveTextContent('BREAKING: a post');
        // The video's still stands large under the text, where the video loads on the press.
        expect(screen.getByTestId('resource-card-image-fit')).toBeInTheDocument();
        expect(embed).not.toHaveBeenCalled();
        expectNoThirdPartyLoads();
        fireEvent.click(screen.getByRole('button', { name: 'Play on x.com' }));
        expect(within(screen.getByTestId('resource-card-player')).getByTestId('platform-embed')).toBeInTheDocument();
        // The player takes the still's place: no second image beside the text.
        expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
      },
    );

    it('holds the pill’s place, invisible, while the X post’s link preview is read, and drops it for a photo', () => {
      onTestFinished(() => {
        og.metadata = null;
      });
      mockCard({ ...POST_CARD, group: null });
      const { rerender } = render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      // Not known yet whether the post has a video: the place is there, nothing to press or hear.
      const placeholder = screen.getByTestId('show-embed-placeholder');
      expect(placeholder).toHaveClass('invisible');
      expect(placeholder).toHaveAttribute('aria-hidden', 'true');
      expect(placeholder).toHaveAttribute('tabindex', '-1');
      expect(screen.queryByRole('button', { name: /on x\.com/ })).not.toBeInTheDocument();
      expectNoThirdPartyLoads();

      og.metadata = { url: POST_URL, type: 'website', title: 'A post', image: 'https://pbs.twimg.com/media/photo.jpg' };
      rerender(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
      expect(screen.queryByTestId('show-embed-placeholder')).not.toBeInTheDocument();
      expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
    });

    it('holds no pill’s place in the composer, where no Show on comes', () => {
      mockCard({ ...POST_CARD, group: null });
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} isComposing />);

      expect(screen.getByTestId('resource-card-post')).toBeInTheDocument();
      expect(screen.queryByTestId('show-embed-placeholder')).not.toBeInTheDocument();
      expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
    });

    it('shows an X post’s image from the app’s image route only', () => {
      mockCard({ ...POST_CARD, image: 'https://pbs.twimg.com/media/abc.jpg' });
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      expect(within(screen.getByTestId('resource-card-image')).getByRole('img').getAttribute('src')).toMatch(
        /^\/api\/image\?/,
      );
      expectNoThirdPartyLoads();
      expect(embed).not.toHaveBeenCalled();
    });

    it('loads a post the card cannot tell (a video post) inside it from Show on, and the same pill closes it', () => {
      mockCard(POST_AS_VIDEO);
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      expect(embed).not.toHaveBeenCalled();
      expectNoThirdPartyLoads();
      const pill = screen.getByTestId('show-embed');
      expect(within(pill).getByTestId('resource-source-brand')).toBeInTheDocument();

      fireEvent.click(pill);
      // The post loads inside the card, under its text: the card stays.
      expect(within(screen.getByTestId('resource-card-player')).getByTestId('platform-embed')).toBeInTheDocument();
      expect(screen.getByTestId('resource-card-title')).toHaveTextContent('BREAKING: a post');
      expect(embed).toHaveBeenCalledTimes(1);
      expect(pill).toHaveAttribute('aria-expanded', 'true');
      // A click on the open post stays there; the card's header still opens the page.
      fireEvent.click(screen.getByTestId('native-embed-body'));
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByTestId('resource-card')).toHaveAttribute('data-click-through', 'true');
      fireEvent.click(screen.getByTestId('resource-card-type'));
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(POST_AS_VIDEO.uri));
      fireEvent.click(pill);
      expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card')).toHaveAttribute('data-click-through', 'true');
    });

    it('gives Show on the post’s own pill on the post card’s surface (a quoted post, a collection’s item)', () => {
      mockCard(POST_AS_VIDEO);
      const { unmount } = render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
      expect(screen.getByTestId('show-embed')).toHaveClass('bg-card');
      unmount();

      render(
        <ResourceSurfaceProvider surface="card">
          <NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />
        </ResourceSurfaceProvider>,
      );
      expect(screen.getByTestId('show-embed')).toHaveClass('bg-action-pill');
      expect(screen.getByTestId('show-embed')).not.toHaveClass('bg-card');
    });

    it('shows a video gone upstream as our card, its other services in the switch, never its embed', () => {
      mockCard({ ...VIDEO_WITH_ALSO_ON, status: 'missing' });
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      expect(embed).not.toHaveBeenCalled();
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByTestId('resource-card')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    });
  });

  describe('a link without Also on', () => {
    it('draws the video’s player in the resource frame, with the resource’s footer, no switch and no Play on', () => {
      mockCard(VIDEO_ALONE);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('resource-card-type')).toHaveTextContent('Video');
      expect(within(frame).getByTestId('player-facade')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /choose another service$/ })).not.toBeInTheDocument();
      expect(within(frame).getByTestId('resource-actions')).toHaveAttribute('data-uri', VIDEO_URL);
      expect(screen.queryByRole('button', { name: /Play on/ })).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
    });

    it('links the type to the resource page and the site to the link in a new tab', () => {
      mockCard(VIDEO_ALONE);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      expect(screen.getByTestId('resource-card-type')).toHaveAttribute('href', getResourceRoute(VIDEO_URL));
      expect(screen.getByTestId('resource-card-type')).toHaveTextContent('Video');
      const source = screen.getByTestId('resource-card-source');
      expect(source).toHaveAttribute('href', VIDEO_URL);
      expect(source).toHaveAttribute('target', '_blank');
      expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('shows a link Pinakes does not know, or has not read yet, as its own preview, the embed only on its press', () => {
      for (const data of [null, { ...POST_CARD, status: 'pending' as const }, { ...POST_CARD, name: null }]) {
        embed.mockClear();
        mockCard(data);
        const { unmount } = render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
        const card = screen.getByTestId('resource-link-card');
        // Without a card the type still says what it is.
        expect(within(card).getByText('Post')).toBeInTheDocument();
        expect(embed).not.toHaveBeenCalled();
        fireEvent.click(within(card).getByRole('button', { name: 'Show on x.com' }));
        expect(within(card).getByTestId('platform-embed')).toBeInTheDocument();
        unmount();
      }
    });

    describe('with Card (no player) above YouTube in Players', () => {
      beforeEach(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder: ['card'] } }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('keeps the link’s own preview of a link Pinakes does not know, its embed only from Play on', () => {
        mockCard(null);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        const card = screen.getByTestId('resource-link-card');
        expect(embed).not.toHaveBeenCalled();
        expect(document.querySelector('iframe')).toBeNull();
        fireEvent.click(within(card).getByRole('button', { name: 'Play on YouTube' }));
        expect(within(card).getByTestId('resource-link-card-player')).toContainElement(
          screen.getByTestId('platform-embed'),
        );
      });
    });

    describe('nothing third-party before a press', () => {
      beforeEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      const play = () => screen.getByRole('button', { name: `Play ${videoFixture.name} on YouTube` });

      it('draws the video’s player in the resource frame from its card, no Play in the header, nothing from the platform', () => {
        mockCard(VIDEO_ALONE);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        const frame = screen.getByTestId('resource-embed-frame');
        expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
        const facade = within(frame).getByTestId('player-facade');
        expect(facade).toBe(play());
        expect(facade).toHaveTextContent(videoFixture.name!);
        // The drawing is the one Play: none in the header.
        expect(screen.getAllByRole('button', { name: /^Play / })).toEqual([facade]);
        expect(document.querySelector('iframe')).toBeNull();
        expect(embed).not.toHaveBeenCalled();
        expectNoThirdPartyLoads();
      });

      it('loads exactly one player in the drawing’s place on a press, started, with no dialog', () => {
        mockCard(VIDEO_ALONE);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        fireEvent.click(play());

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.querySelectorAll('iframe')).toHaveLength(1);
        const frame = within(screen.getByTestId('resource-embed-frame')).getByTestId('resource-player-frame');
        expect(frame.getAttribute('src')).toContain('autoplay=1');
        expect(screen.queryByTestId('player-facade')).not.toBeInTheDocument();
        expect(embed).not.toHaveBeenCalled();
      });

      it('shows our card for a video the card player cannot play, its embed only from Play on', () => {
        mockCard({ ...VIDEO_ALONE, status: 'missing' });
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        expect(embed).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('show-embed'));
        expect(within(screen.getByTestId('resource-card')).getByTestId('platform-embed')).toBeInTheDocument();
        expect(screen.getByTestId('show-embed')).toHaveAccessibleName('Close the YouTube video');
      });

      it('shows a link Pinakes does not know as a finished card from the app, its embed inside it on Play', () => {
        mockCard(null);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        const card = screen.getByTestId('resource-link-card');
        expect(within(card).getByTestId('resource-actions')).toHaveAttribute('data-uri', VIDEO_URL);
        expect(within(card).getByTestId('resource-card-type')).toHaveTextContent('Video');
        // The video's thumbnail from the app's image route, no pill standing in for content.
        expect(within(card).getByTestId('resource-card-image').querySelector('img')).toHaveAttribute(
          'src',
          '/api/image?youtube=dQw4w9WgXcQ&variant=hq720',
        );
        expect(embed).not.toHaveBeenCalled();
        expectNoThirdPartyLoads();
        expect(screen.queryByTestId('resource-embed-frame')).not.toBeInTheDocument();

        fireEvent.click(within(card).getByRole('button', { name: 'Play on YouTube' }));
        expect(embed).toHaveBeenLastCalledWith(expect.objectContaining({ autoplay: true }));
        expect(within(card).getByTestId('resource-link-card-player')).toContainElement(
          screen.getByTestId('platform-embed'),
        );
        // The player takes the thumbnail's place.
        expect(within(card).queryByTestId('resource-card-image')).not.toBeInTheDocument();
        fireEvent.click(within(card).getByRole('button', { name: 'Close the YouTube video' }));
        expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
        expect(within(card).getByTestId('resource-card-image')).toBeInTheDocument();
      });

      it('keeps an embed opened before Pinakes knew the link when its card is read later', () => {
        mockCard(null);
        const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
        fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));

        const player = screen.getByTestId('platform-embed');
        mockCard(VIDEO_ALONE);
        rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        // The same embed, never loaded again.
        expect(screen.getByTestId('platform-embed')).toBe(player);
        expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();

        // Closed, the card's drawing of the player takes its place, loading nothing until pressed.
        fireEvent.click(screen.getByRole('button', { name: 'Close the YouTube video' }));
        expect(screen.getByTestId('player-facade')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: `Play ${videoFixture.name} on YouTube` })).toBeInTheDocument();
        expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
      });

      it('closes an embed opened and pressed in before its card was read', () => {
        vi.useFakeTimers();
        try {
          mockCard(null);
          const withFrame = vi.fn<RenderNativeEmbed>(() => <iframe title="player" data-testid="platform-embed" />);
          const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={withFrame} />);
          fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));
          const player = screen.getByTestId('platform-embed');
          act(() => {
            fireEvent.mouseOver(player);
            player.focus();
            window.dispatchEvent(new Event('blur'));
            vi.advanceTimersByTime(1);
          });

          mockCard(VIDEO_ALONE);
          rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={withFrame} />);
          expect(screen.getByTestId('platform-embed')).toBe(player);

          fireEvent.click(screen.getByRole('button', { name: 'Close the YouTube video' }));
          expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
          expect(screen.getByRole('button', { name: `Play ${videoFixture.name} on YouTube` })).toBeInTheDocument();
        } finally {
          vi.useRealTimers();
        }
      });

      it('closes an opened embed the platform cannot show, Play on back in its place', () => {
        mockCard(null);
        let fail: () => void = () => {};
        const failing = vi.fn<RenderNativeEmbed>(({ onError }) => {
          fail = onError;
          return <div data-testid="platform-embed" />;
        });
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={failing} />);

        fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));
        expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
        act(() => fail());
        expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Play on YouTube' })).toBeInTheDocument();
      });

      it('shows an X post on our card from its own data, never X’s embed', () => {
        mockCard(POST_CARD);
        render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

        expect(screen.getByTestId('resource-card-post')).toHaveTextContent('BREAKING: a post');
        expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
        expect(embed).not.toHaveBeenCalled();
      });

      it('loads nothing from X for a card Pinakes is still reading: the frame and Show on as before', () => {
        mockCard({ ...POST_CARD, status: 'pending', name: null, description: null });
        render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

        expect(embed).not.toHaveBeenCalled();
        expectNoThirdPartyLoads();
        expect(screen.getByTestId('show-embed')).toHaveAccessibleName('Show on x.com');
      });
    });

    it('gives way to the card when the platform cannot show the post', () => {
      mockCard(null);
      let fail: () => void = () => {};
      const failing = vi.fn<RenderNativeEmbed>(({ onError }) => {
        fail = onError;
        return <div data-testid="platform-embed" />;
      });
      const { rerender } = render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={failing} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show on x.com' }));
      expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
      mockCard(POST_CARD);
      rerender(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={failing} />);

      act(() => fail());
      expect(screen.getByTestId('resource-card')).toBeInTheDocument();
      expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
      // No Show on for a post the platform cannot show.
      expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
    });
  });

  describe('a video with Also on the card player cannot play', () => {
    // Gone upstream, and Also on only on services without a player: the card player has nothing to play.
    const gone = () =>
      mockCard({
        ...videoFixture,
        status: 'missing',
        also_on: videoFixture.also_on.filter((entry) => entry.site === 'MusicBrainz'),
      });

    it('offers the platform embed from Play on', () => {
      try {
        gone();
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        expect(screen.queryByTestId('play-on-main')).not.toBeInTheDocument();
        expect(embed).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));
        expect(within(screen.getByTestId('resource-card')).getByTestId('platform-embed')).toBeInTheDocument();
      } finally {
        useSettingsStore.setState({ media: defaultMediaPreferences });
      }
    });
  });

  it('offers the platform embed of a video whose other services are all removed from Players', () => {
    try {
      // Gone upstream, and Also on only on services the viewer removed from Players (or without a
      // player): the card player has nothing to play.
      useSettingsStore.setState({
        media: {
          ...defaultMediaPreferences,
          hiddenPlayers: ['tidal', 'deezer', 'spotify', 'apple-music'],
        },
      });
      mockCard({
        ...videoFixture,
        status: 'missing',
        also_on: videoFixture.also_on.filter((entry) => entry.site !== 'YouTube'),
      });
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      expect(screen.getByTestId('resource-card')).toBeInTheDocument();
      expect(screen.queryByTestId('play-on-main')).not.toBeInTheDocument();
      expect(screen.getByTestId('show-embed')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
    } finally {
      useSettingsStore.setState({ media: defaultMediaPreferences });
    }
  });

  it('previews a dialog’s quoted video as the composer does: its player, paused on the press, and its footer, no Play on', () => {
    mockCard(VIDEO_WITH_ALSO_ON);
    render(
      <PostPreviewNavigableProvider navigable={false}>
        <NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />
      </PostPreviewNavigableProvider>,
    );

    const frame = screen.getByTestId('resource-embed-frame');
    expect(within(frame).getByTestId('resource-actions')).toBeInTheDocument();
    fireEvent.click(within(frame).getByTestId('player-facade'));
    expect(within(frame).getByTestId('resource-player-frame').getAttribute('src')).not.toMatch(/autoplay/);
    expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();
  });

  it('holds the place with the card’s skeleton while Pinakes reads, then shows the link’s own preview after 5 s', () => {
    vi.useFakeTimers();
    try {
      mockCard(undefined, true);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
      expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(PINAKES_SLOW_READ_MS));
      expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('a YouTube link Pinakes knows as a song', () => {
    // The same song on YouTube, as Pinakes types it: a `MusicRecording`, also on Spotify.
    const SONG: TPinakesResourceDetail = {
      ...videoFixture,
      type: 'MusicRecording',
      type_path: ['Thing', 'CreativeWork', 'MusicRecording'],
    };

    it('draws the song’s player in the resource frame instead of the platform embed', () => {
      mockCard(SONG);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('player-facade')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      expect(within(frame).getByRole('button', { name: /choose another service$/ })).toBeInTheDocument();
      expect(within(frame).getByTestId('resource-actions')).toHaveAttribute('data-has-also-on', 'true');
    });

    it.each([
      { surface: 'a post', navigable: true, docks: true },
      { surface: 'a dialog (a post being written)', navigable: false, docks: false },
    ])('lets a playing song player in $surface dock: $docks', ({ navigable, docks }) => {
      vi.useFakeTimers();
      try {
        mockCard(SONG);
        render(
          <PostPreviewNavigableProvider navigable={navigable}>
            <NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />
          </PostPreviewNavigableProvider>,
        );

        fireEvent.click(screen.getByTestId('player-facade'));
        const frame = screen.getByTestId('resource-player-frame') as HTMLIFrameElement;
        // YouTube says it plays (`useOnePlayer`): that makes it the page's player, not a press.
        act(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              origin: 'https://www.youtube-nocookie.com',
              source: frame.contentWindow,
              data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } }),
            }),
          );
        });
        expect(document.querySelector('[data-keep-playing]') !== null).toBe(docks);
      } finally {
        vi.useRealTimers();
      }
    });

    it('previews the same in the composer, with the footer', () => {
      mockCard(SONG);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);

      expect(screen.getByTestId('player-facade')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
      expect(within(screen.getByTestId('resource-embed-frame')).getByTestId('resource-actions')).toHaveAttribute(
        'data-uri',
        SONG.uri,
      );
    });

    describe('nothing third-party before a press', () => {
      beforeEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('loads nothing from any service, and draws the song’s YouTube player from its card', () => {
        mockCard(SONG);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        expectNoThirdPartyLoads();
        expect(embed).not.toHaveBeenCalled();
        expect(document.querySelector('iframe')).toBeNull();
        expect(screen.getByTestId('player-facade')).toBe(
          screen.getByRole('button', { name: `Play ${SONG.name} on YouTube` }),
        );
      });
    });
  });

  describe('YouTube’s Get Lucky, a video Pinakes knows as a track on other services', () => {
    // As Pinakes reads it: a `VideoObject`, on Spotify, Deezer and TIDAL as tracks.
    const GET_LUCKY_URL = 'https://www.youtube.com/watch?v=5NV6Rdv1a3I';
    const GET_LUCKY: TPinakesResourceDetail = {
      ...videoFixture,
      uri: GET_LUCKY_URL,
      name: 'Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers',
      refs: [GET_LUCKY_URL],
      facts: null,
      also_on: [
        { uri: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq', site: 'Spotify' },
        { uri: 'https://www.deezer.com/track/67238735', site: 'Deezer' },
        { uri: 'https://tidal.com/track/20115564', site: 'TIDAL' },
        { uri: 'https://music.apple.com/song/617154366', site: 'Apple Music' },
      ],
    };

    it('draws the song’s player with a switch, instead of our card with Play on', () => {
      expect(GET_LUCKY.type).toBe('VideoObject');
      mockCard(GET_LUCKY);
      render(<NativeEmbedResource url={GET_LUCKY_URL} kind="video" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('player-facade')).toHaveAccessibleName(`Play ${GET_LUCKY.name} on YouTube`);
      expect(within(frame).getByRole('button', { name: 'YouTube: choose another service' })).toBeInTheDocument();
      // Its header keeps Pinakes' type, as its card does.
      expect(within(frame).getByTestId('resource-card-type')).toHaveTextContent('Video');
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
    });

    it('shows our card, loading nothing, with Card (no player) first in Players', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder: ['card'] } });
      onTestFinished(() => {});
      mockCard(GET_LUCKY);
      render(<NativeEmbedResource url={GET_LUCKY_URL} kind="video" renderEmbed={embed} />);

      const card = screen.getByTestId('resource-card');
      expect(within(card).getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
      expect(embed).not.toHaveBeenCalled();
    });

    it('shows an ordinary video Pinakes knows nowhere else as our card, its switch offering YouTube, with Card (no player) above YouTube', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder: ['card'] } });
      onTestFinished(() => {});
      mockCard({ ...GET_LUCKY, also_on: [] });
      render(<NativeEmbedResource url={GET_LUCKY_URL} kind="video" renderEmbed={embed} />);

      const card = screen.getByTestId('resource-card');
      expect(within(card).getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
      expect(embed).not.toHaveBeenCalled();
    });

    it('shows an ordinary video with Also on, on no music service as a track, as its player too', () => {
      mockCard({
        ...GET_LUCKY,
        also_on: [
          { uri: 'https://www.youtube.com/watch?v=Om61naQC8is', site: 'YouTube' },
          { uri: 'https://open.spotify.com/album/1weenld61qoidwYuZ1GESA', site: 'Spotify' },
        ],
      });
      render(<NativeEmbedResource url={GET_LUCKY_URL} kind="video" renderEmbed={embed} />);

      expect(screen.getByTestId('player-facade')).toHaveAccessibleName(`Play ${GET_LUCKY.name} on YouTube`);
      expect(screen.getByRole('button', { name: 'YouTube: choose another service' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    });
  });

  describe('in the composer', () => {
    it('asks Pinakes to read the link at once and previews the video’s player with its footer, without Play on', () => {
      mockCard(VIDEO_WITH_ALSO_ON);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);

      expect(usePinakesCard).toHaveBeenCalledWith(VIDEO_URL, { resolve: true });
      expect(screen.getByTestId('player-facade')).toBeInTheDocument();
      const actions = within(screen.getByTestId('resource-embed-frame')).getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-uri', VIDEO_URL);
      expect(actions).toHaveAttribute('data-has-also-on', 'true');
      expect(screen.queryByRole('button', { name: /Play on/ })).not.toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
    });

    it('previews the video’s player in the frame with its footer when there is no Also on', () => {
      mockCard(VIDEO_ALONE);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('player-facade')).toBeInTheDocument();
      expect(within(frame).getByTestId('resource-actions')).toHaveAttribute('data-uri', VIDEO_URL);
    });
  });

  it('keeps an embed the viewer opened in the link’s own preview when a card with Also on is read later', () => {
    mockCard(null);
    const withFrame = vi.fn<RenderNativeEmbed>(() => <iframe title="player" data-testid="platform-embed" />);
    const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={withFrame} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));
    const frame = screen.getByTestId('platform-embed');

    mockCard(VIDEO_WITH_ALSO_ON);
    rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={withFrame} />);
    expect(screen.getByTestId('platform-embed')).toBe(frame);
    expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
  });

  it('swaps the link’s own preview for the card’s drawn player when the card is read later', () => {
    mockCard(null);
    const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();

    mockCard(VIDEO_WITH_ALSO_ON);
    rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('player-facade')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-link-card')).not.toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();
  });

  describe('in a box hidden from the page (a feed kept behind an open post)', () => {
    /** The page's size observers and what each watches: the box tells its size through one. */
    let observers: { callback: ResizeObserverCallback; observer: ResizeObserver; targets: Element[] }[] = [];
    let hidden = false;
    let rects: MockInstance<Element['getClientRects']> | undefined;

    beforeEach(() => {
      observers = [];
      hidden = false;
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: ResizeObserverCallback) {
            observers.push({ callback, observer: asOpaque<ResizeObserver>(this), targets: [] });
          }
          observe(target: Element) {
            observers.find(({ observer }) => observer === asOpaque<ResizeObserver>(this))?.targets.push(target);
          }
          unobserve() {}
          disconnect() {
            const entry = observers.find(({ observer }) => observer === asOpaque<ResizeObserver>(this));
            if (entry) entry.targets = [];
          }
        },
      );
      // Laid out nowhere while hidden (`display: none` above it), as `PlayerHost` reads it.
      rects = vi.spyOn(Element.prototype, 'getClientRects');
      rects.mockImplementation(() => asOpaque<DOMRectList>(hidden ? [] : [{}]));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      rects?.mockRestore();
    });

    /** The box is hidden or shown again: its size goes to or from nothing, and its observer says so. */
    const setHidden = (value: boolean) =>
      act(() => {
        hidden = value;
        const box = screen.getByTestId('native-embed-resource');
        for (const { callback, observer, targets } of observers) {
          if (targets.includes(box)) callback([], observer);
        }
      });

    it('unloads the platform’s video while its box is hidden, and loads it again once shown', () => {
      mockCard(null);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
      fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));
      expect(screen.getByTestId('platform-embed')).toBeInTheDocument();

      setHidden(true);
      expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
      // The resource stays: its card and footer, ready to load the video again.
      expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
      expect(screen.getByTestId('resource-actions')).toBeInTheDocument();

      setHidden(false);
      expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
    });

    it('unloads a video opened from Play on in our card while hidden, still open once shown', () => {
      // A video the card player cannot play is our card, its embed from Play on.
      mockCard({ ...VIDEO_ALONE, status: 'missing' });
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
      fireEvent.click(screen.getByTestId('show-embed'));
      expect(within(screen.getByTestId('resource-card')).getByTestId('platform-embed')).toBeInTheDocument();

      setHidden(true);
      expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
      expect(screen.getByTestId('show-embed')).toHaveAccessibleName('Close the YouTube video');

      setHidden(false);
      expect(within(screen.getByTestId('resource-card')).getByTestId('platform-embed')).toBeInTheDocument();
    });

    it('keeps the video while only scrolled away: laid out, out of the viewport', () => {
      mockCard(null);
      const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
      fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));
      viewport.isVisible = false;
      rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
      setHidden(false);

      expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
    });

    it('keeps the video until the box’s size is first told (no observer word yet)', () => {
      hidden = true;
      mockCard(null);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
      fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));

      expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
    });

    it('leaves the card player’s hosted frame to its host (`PlayerHost`)', () => {
      mockCard(VIDEO_ALONE);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
      fireEvent.click(screen.getByTestId('player-facade'));

      setHidden(true);
      expect(screen.getByTestId('resource-player-frame')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
    });

    it('keeps an X post, which has no frame of its own to unload', () => {
      mockCard(null);
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show on x.com' }));

      setHidden(true);
      expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
    });
  });

  it('waits for Pinakes to read a link in the composer before loading any platform embed', () => {
    vi.mocked(usePinakesCard).mockReturnValue({ data: null, isLoading: false, isError: false, isResolving: true });
    const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);
    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();

    mockCard(VIDEO_WITH_ALSO_ON);
    rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);
    expect(screen.getByTestId('player-facade')).toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();
  });
});

describe('NativeEmbedResource: an X post’s video and a link Pinakes is still reading', () => {
  const POST_ID = '2118393153103470770';
  const MP4 = 'https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/a.mp4';
  const STILL = 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still.jpg';
  const PHOTO = 'https://pbs.twimg.com/media/photo.jpg';
  const SERVER_POST = {
    id: POST_ID,
    text: 'A video post',
    authorName: 'Some One',
    handle: 'someone',
    published: null,
    image: STILL,
    images: [STILL, PHOTO],
    hasVideo: true,
    video: MP4 as string | null,
    videoAspect: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    viewport.isVisible = true;
    useSettingsStore.setState({ media: defaultMediaPreferences });
  });

  it('shows the still and our Play; the press plays the MP4 in the app’s player inside the post, nothing from X before', () => {
    mockCard(null);
    xPostRead.post = SERVER_POST;
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

    expect(screen.getByTestId('resource-card-post')).toHaveTextContent('A video post');
    expect(within(screen.getByTestId('resource-card-image')).getByRole('img')).toHaveAttribute(
      'src',
      `/api/image?xpost=${POST_ID}&src=${encodeURIComponent(STILL)}`,
    );
    expect(document.querySelector('video')).toBeNull();
    expectNoThirdPartyLoads();

    fireEvent.click(screen.getByRole('button', { name: 'Play on x.com' }));

    const video = within(screen.getByTestId('resource-card-player')).getByTestId('x-post-video');
    expect(video).toHaveAttribute('data-src', MP4);
    // In a frame of its own that sends no Referer (X's video host refuses another site's), started on load.
    const doc = video.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
    expect(doc).toContain('<meta name="referrer" content="no-referrer">');
    expect(doc).toContain(`<video controls playsinline autoplay src="${MP4}">`);
    expect(embed).not.toHaveBeenCalled();
  });

  it('reads the MP4 of a video post its Pinakes card tells only on Play, and plays it in the app’s player', () => {
    mockCard({ ...POST_CARD, image: STILL });
    xPostRead.post = SERVER_POST;
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

    // Before the press nothing is read, not even from the app's server.
    expect(xPostRead.ids.every((id) => id === null)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Play on x.com' }));

    expect(xPostRead.ids).toContain(POST_ID);
    expect(screen.getByTestId('x-post-video')).toHaveAttribute('data-src', MP4);
    expect(embed).not.toHaveBeenCalled();
  });

  it('starts reading the post as the viewer reaches for Play (pointer down, focus), nothing before', () => {
    mockCard({ ...POST_CARD, image: STILL });
    xPostRead.prefetched = [];
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
    expect(xPostRead.prefetched).toEqual([]);

    const play = screen.getByRole('button', { name: 'Play on x.com' });
    fireEvent.pointerDown(play);
    fireEvent.focus(play);
    expect(xPostRead.prefetched).toEqual([POST_URL, POST_URL]);
  });

  it('holds the place while the MP4 is read, then shows X’s post for a video with no MP4', () => {
    mockCard({ ...POST_CARD, image: STILL });
    xPostRead.pending = true;
    const { rerender } = render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play on x.com' }));
    expect(screen.getByTestId('x-post-video-loading')).toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();

    xPostRead.pending = false;
    xPostRead.post = { ...SERVER_POST, video: null };
    rerender(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
    expect(within(screen.getByTestId('resource-card-player')).getByTestId('platform-embed')).toBeInTheDocument();
  });

  it('shows the post the server read while Pinakes still reads the link, without waiting for it', () => {
    vi.mocked(usePinakesCard).mockReturnValue({ data: null, isLoading: false, isError: false, isResolving: true });
    xPostRead.post = { ...SERVER_POST, hasVideo: false, video: null, image: PHOTO, images: [PHOTO] };
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

    expect(xPostRead.ids).toContain(POST_ID);
    expect(screen.getByTestId('resource-card-post')).toHaveTextContent('A video post');
    expect(screen.queryByTestId('resource-card-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
  });
});

describe('NativeEmbedResource: an X post the card cannot tell, read by the app’s server', () => {
  const POST_ID = '2118393153103470770';
  const SERVER_POST = {
    id: POST_ID,
    text: 'Read by the app',
    authorName: 'Some One',
    handle: 'someone',
    published: '2026-11-20T10:00:00.000Z',
    image: 'https://pbs.twimg.com/media/photo.jpg',
    images: ['https://pbs.twimg.com/media/photo.jpg'],
    hasVideo: false,
    video: null as string | null,
    videoAspect: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    viewport.isVisible = true;
    useSettingsStore.setState({ media: defaultMediaPreferences });
  });

  it('shows a post Pinakes has no card for as a post, its image from the app’s route only, nothing to press', () => {
    mockCard(null);
    xPostRead.post = SERVER_POST;
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

    expect(xPostRead.ids).toContain(POST_ID);
    expect(screen.getByTestId('resource-card-post')).toHaveTextContent('Read by the app');
    expect(screen.getByTestId('resource-card-post-author')).toHaveTextContent('Some One@someone');
    expect(within(screen.getByTestId('resource-card-image')).getByRole('img')).toHaveAttribute(
      'src',
      `/api/image?xpost=${POST_ID}&src=${encodeURIComponent(SERVER_POST.image)}`,
    );
    expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();
    expectNoThirdPartyLoads();
  });

  it('shows a post whose card has no text (still read) as the post the server read, the card’s footer kept', () => {
    mockCard({ ...POST_CARD, id: 'pinakes-id', name: 'x.com', description: null, status: 'unreachable' });
    xPostRead.post = SERVER_POST;
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

    expect(screen.getByTestId('resource-card-post')).toHaveTextContent('Read by the app');
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card-id', 'pinakes-id');
    expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
  });

  it('keeps a Play for a video in the post, loading X’s embed inside the card only on that press', () => {
    mockCard(null);
    const poster = 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still.jpg';
    xPostRead.post = { ...SERVER_POST, image: poster, images: [poster], hasVideo: true };
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

    expect(screen.getByTestId('resource-card-post')).toHaveTextContent('Read by the app');
    expect(embed).not.toHaveBeenCalled();
    expectNoThirdPartyLoads();
    fireEvent.click(screen.getByRole('button', { name: 'Play on x.com' }));
    expect(within(screen.getByTestId('resource-card-player')).getByTestId('platform-embed')).toBeInTheDocument();
  });

  it('holds the skeleton while the post is read, then keeps the link card when it cannot be', () => {
    mockCard(null);
    xPostRead.pending = true;
    const { rerender } = render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();

    xPostRead.pending = false;
    rerender(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show on x.com' })).toBeInTheDocument();
  });

  it('reads nothing for a card that tells the post, or a post gone upstream', () => {
    mockCard(POST_CARD);
    const { unmount } = render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
    unmount();
    mockCard({ ...POST_CARD, status: 'missing' });
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

    expect(xPostRead.ids.every((id) => id === null)).toBe(true);
  });
});
