import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { NativeEmbedResource, type RenderNativeEmbed } from './NativeEmbedResource';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: vi.fn() }));
const viewport = vi.hoisted(() => ({ isVisible: true }));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: viewport.isVisible }),
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
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

  it('gives the footer the card, on our card and under the platform’s embed, for its other links’ tags', () => {
    const withAlsoOn = { ...videoFixture, id: 'with-also-on' };
    mockCard(withAlsoOn);
    const { unmount } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card-id', 'with-also-on');
    unmount();

    // An X post Pinakes knows nowhere else: the platform's own embed, and still the card for the footer.
    mockCard({ ...POST_CARD, id: 'post-alone' });
    render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
    expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card-id', 'post-alone');
  });

  it('reads the card for the link as written and re-reads it while on screen', () => {
    mockCard(VIDEO_ALONE);
    render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

    expect(usePinakesCard).toHaveBeenCalledWith(VIDEO_URL, { recheck: true });
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
    expect(screen.getByTestId('platform-embed')).toBeInTheDocument();

    // Scrolled away again: what was read stays, only the re-reads stop.
    viewport.isVisible = false;
    rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
    expect(usePinakesCard).toHaveBeenLastCalledWith(VIDEO_URL, { recheck: false });
  });

  it('reads the composer’s link at once, wherever the box is', () => {
    viewport.isVisible = false;
    mockCard(VIDEO_ALONE);
    render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);

    expect(usePinakesCard).toHaveBeenCalledWith(VIDEO_URL, { resolve: true });
  });

  describe('a link with Also on', () => {
    it('shows the video’s player up front in the resource frame, its other services in the header’s switch', () => {
      mockCard(VIDEO_WITH_ALSO_ON);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0',
      );
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

    it('shows an X post as X’s embed up front, its only source: no switch, no Card, its Also on in the ⋯ menu', () => {
      mockCard(POST_WITH_ALSO_ON);
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('platform-embed')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('player-switch')).not.toBeInTheDocument();
      expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
      expect(within(frame).getByTestId('resource-actions')).toHaveAttribute('data-has-also-on', 'true');
    });

    it('with platform embeds up front off, shows an X post on our card from Show on, with X’s mark, and the same pill closes it', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } });
      onTestFinished(() => {
        useSettingsStore.setState({ media: defaultMediaPreferences });
      });
      mockCard(POST_WITH_ALSO_ON);
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

      expect(embed).not.toHaveBeenCalled();
      const pill = screen.getByTestId('show-embed');
      expect(within(pill).getByTestId('resource-source-brand')).toBeInTheDocument();
      // The post's text is its name: not repeated as its description.
      expect(screen.getAllByText('BREAKING: a post')).toHaveLength(1);

      fireEvent.click(pill);
      expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
      expect(pill).toHaveAttribute('aria-expanded', 'true');
      // A click on the open post stays there; the card's header still opens the page.
      fireEvent.click(screen.getByTestId('native-embed-body'));
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByTestId('resource-card')).toHaveAttribute('data-click-through', 'true');
      fireEvent.click(screen.getByTestId('resource-card-type'));
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(POST_WITH_ALSO_ON.uri));
      fireEvent.click(pill);
      expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card')).toHaveAttribute('data-click-through', 'true');
    });

    it('gives Show on the post’s own pill on the post card’s surface (a quoted post, a collection’s item)', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } });
      onTestFinished(() => {
        useSettingsStore.setState({ media: defaultMediaPreferences });
      });
      mockCard(POST_WITH_ALSO_ON);
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
    it('shows the video’s player in the resource frame, with the resource’s footer, no switch and no Play on', () => {
      mockCard(VIDEO_ALONE);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('resource-card-type')).toHaveTextContent('Video');
      expect(within(frame).getByTestId('resource-player-frame')).toBeInTheDocument();
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

    it('shows the embed in the frame for a link Pinakes does not know, or has not read yet', () => {
      for (const data of [null, { ...POST_CARD, status: 'pending' as const }, { ...POST_CARD, name: null }]) {
        mockCard(data);
        const { unmount } = render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);
        expect(screen.getByTestId('resource-embed-frame')).toBeInTheDocument();
        expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
        // Without a card the type link still says what it is and opens the resource page.
        expect(screen.getByTestId('resource-card-type')).toHaveAttribute('href', getResourceRoute(POST_URL));
        expect(screen.getByTestId('resource-card-source')).toHaveTextContent('x.com');
        unmount();
      }
    });

    describe('with Card (no player) above YouTube in Players', () => {
      beforeEach(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder: ['card'] } }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('keeps the frame of a link Pinakes does not know, its embed only from Play on', () => {
        mockCard(null);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        const frame = screen.getByTestId('resource-embed-frame');
        expect(embed).not.toHaveBeenCalled();
        expect(document.querySelector('iframe')).toBeNull();
        fireEvent.click(within(frame).getByRole('button', { name: 'Play on YouTube' }));
        expect(within(frame).getByTestId('resource-embed-body')).toContainElement(screen.getByTestId('platform-embed'));
      });
    });

    describe('with platform embeds up front off', () => {
      beforeEach(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('shows the player’s stand-in with Play on in the resource frame and loads nothing from the platform', () => {
        mockCard(VIDEO_ALONE);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        const frame = screen.getByTestId('resource-embed-frame');
        expect(within(frame).getByTestId('embed-player')).toBeInTheDocument();
        expect(embed).not.toHaveBeenCalled();
        expect(document.querySelector('iframe')).toBeNull();
        expect(within(frame).getByRole('button', { name: 'Play on YouTube' })).toBeInTheDocument();
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

      it('keeps the frame of a link Pinakes does not know, its embed only from Play on, and closes it again', () => {
        mockCard(null);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        const frame = screen.getByTestId('resource-embed-frame');
        expect(within(frame).getByTestId('resource-actions')).toHaveAttribute('data-uri', VIDEO_URL);
        expect(embed).not.toHaveBeenCalled();
        // No empty body under the header while nothing is loaded
        expect(within(frame).queryByTestId('resource-embed-body')).not.toBeInTheDocument();

        fireEvent.click(within(frame).getByRole('button', { name: 'Play on YouTube' }));
        expect(within(frame).getByTestId('resource-embed-body')).toContainElement(screen.getByTestId('platform-embed'));
        fireEvent.click(within(frame).getByRole('button', { name: 'Close the YouTube video' }));
        expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
        expect(within(frame).queryByTestId('resource-embed-body')).not.toBeInTheDocument();
      });

      it('keeps an embed opened before Pinakes knew the link when its card is read later', () => {
        mockCard(null);
        const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
        fireEvent.click(screen.getByRole('button', { name: 'Play on YouTube' }));

        mockCard(VIDEO_ALONE);
        rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        const frame = screen.getByTestId('resource-embed-frame');
        expect(within(frame).getByTestId('resource-embed-body')).toContainElement(screen.getByTestId('platform-embed'));
        expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();

        // Closed, the player's stand-in takes its place.
        fireEvent.click(within(frame).getByRole('button', { name: 'Close the YouTube video' }));
        expect(screen.getByTestId('embed-player')).toBeInTheDocument();
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
          expect(screen.getByRole('button', { name: 'Play on YouTube' })).toBeInTheDocument();
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

      it('shows an X post on our card, its embed only from Show on', () => {
        mockCard(POST_CARD);
        render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={embed} />);

        expect(embed).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('show-embed'));
        expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
      });
    });

    it('gives way to the card when the platform cannot show the post', () => {
      mockCard(POST_CARD);
      let fail: () => void = () => {};
      const failing = vi.fn<RenderNativeEmbed>(({ onError }) => {
        fail = onError;
        return <div data-testid="platform-embed" />;
      });
      render(<NativeEmbedResource url={POST_URL} kind="post" renderEmbed={failing} />);
      expect(screen.getByTestId('resource-embed-frame')).toBeInTheDocument();

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

    it('shows the platform embed up front, its only source: no card, no switch, no Play on', () => {
      gone();
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      expect(within(screen.getByTestId('resource-embed-frame')).getByTestId('platform-embed')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('player-switch')).not.toBeInTheDocument();
      expect(screen.queryByTestId('show-embed')).not.toBeInTheDocument();
    });

    it('offers the platform embed from Play on, with platform embeds up front off', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } });
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
          embedsUpFront: false,
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

  it('holds the place with the card’s skeleton while Pinakes reads, then shows the embed after 5 s', () => {
    vi.useFakeTimers();
    try {
      mockCard(undefined, true);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
      expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(PINAKES_SLOW_READ_MS));
      expect(screen.getByTestId('platform-embed')).toBeInTheDocument();
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

    it('shows the song’s player up front, paused, in the resource frame instead of the platform embed', () => {
      mockCard(SONG);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0',
      );
      expect(embed).not.toHaveBeenCalled();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      expect(within(frame).getByRole('button', { name: /choose another service$/ })).toBeInTheDocument();
      expect(within(frame).getByTestId('resource-actions')).toHaveAttribute('data-has-also-on', 'true');
    });

    it('previews the same in the composer, without the footer', () => {
      mockCard(SONG);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);

      expect(screen.getByTestId('resource-player-frame')).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
      expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
    });

    describe('with platform embeds up front off', () => {
      beforeEach(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('loads nothing from any service, and offers Play on in the player’s place', () => {
        mockCard(SONG);
        render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);

        expect(document.querySelector('iframe')).toBeNull();
        expect(embed).not.toHaveBeenCalled();
        expect(screen.getByTestId('embed-player')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Play on YouTube' })).toBeInTheDocument();
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

    it('shows the song’s player up front, paused, with a switch, instead of our card with Play on', () => {
      expect(GET_LUCKY.type).toBe('VideoObject');
      mockCard(GET_LUCKY);
      render(<NativeEmbedResource url={GET_LUCKY_URL} kind="video" renderEmbed={embed} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/5NV6Rdv1a3I?enablejsapi=1&rel=0',
      );
      expect(within(frame).getByRole('button', { name: 'YouTube: choose another service' })).toBeInTheDocument();
      // Its header keeps Pinakes' type, as its card does.
      expect(within(frame).getByTestId('resource-card-type')).toHaveTextContent('Video');
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
    });

    it('shows our card, loading nothing, with Card (no player) first in Players', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder: ['card'] } });
      onTestFinished(() => {
        useSettingsStore.setState({ media: defaultMediaPreferences });
      });
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
      onTestFinished(() => {
        useSettingsStore.setState({ media: defaultMediaPreferences });
      });
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

      expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/5NV6Rdv1a3I?enablejsapi=1&rel=0',
      );
      expect(screen.getByRole('button', { name: 'YouTube: choose another service' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    });
  });

  describe('in the composer', () => {
    it('asks Pinakes to read the link at once and previews the video’s player without footer or Play on', () => {
      mockCard(VIDEO_WITH_ALSO_ON);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);

      expect(usePinakesCard).toHaveBeenCalledWith(VIDEO_URL, { resolve: true });
      expect(
        within(screen.getByTestId('resource-embed-frame')).getByTestId('resource-player-frame'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Play on/ })).not.toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
    });

    it('previews the video’s player in the frame without footer when there is no Also on', () => {
      mockCard(VIDEO_ALONE);
      render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);

      expect(
        within(screen.getByTestId('resource-embed-frame')).getByTestId('resource-player-frame'),
      ).toBeInTheDocument();
      expect(embed).not.toHaveBeenCalled();
      expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
    });
  });

  it('keeps an embed the viewer has pressed in when a card with Also on is read later', () => {
    vi.useFakeTimers();
    try {
      mockCard(null);
      const withFrame = vi.fn<RenderNativeEmbed>(() => <iframe title="player" data-testid="platform-embed" />);
      const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={withFrame} />);
      const frame = screen.getByTestId('platform-embed');
      act(() => {
        fireEvent.mouseOver(frame);
        frame.focus();
        window.dispatchEvent(new Event('blur'));
        vi.advanceTimersByTime(1);
      });

      mockCard(VIDEO_WITH_ALSO_ON);
      rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={withFrame} />);
      expect(screen.getByTestId('platform-embed')).toBe(frame);
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('swaps an untouched embed for the card’s player when the card is read later', () => {
    mockCard(null);
    const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('platform-embed')).toBeInTheDocument();

    mockCard(VIDEO_WITH_ALSO_ON);
    rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} />);
    expect(screen.getByTestId('resource-player-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('platform-embed')).not.toBeInTheDocument();
  });

  it('waits for Pinakes to read a link in the composer before loading any platform embed', () => {
    vi.mocked(usePinakesCard).mockReturnValue({ data: null, isLoading: false, isError: false, isResolving: true });
    const { rerender } = render(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);
    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();

    mockCard(VIDEO_WITH_ALSO_ON);
    rerender(<NativeEmbedResource url={VIDEO_URL} kind="video" renderEmbed={embed} isComposing />);
    expect(screen.getByTestId('resource-player-frame')).toBeInTheDocument();
    expect(embed).not.toHaveBeenCalled();
  });
});
