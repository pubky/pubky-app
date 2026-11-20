import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { isPinakesConfigured, PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { MENU_VARIANT } from '@/config/ui';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import type { ResourceExtraMenuContent } from '@/organisms/ResourceActions/ResourceMoreMenu';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import mbGroupEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-group.enriched.json';
import missingFixture from '@/services/pinakes/fixtures/by-uri.missing.json';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import unreachableFixture from '@/services/pinakes/fixtures/by-uri.unreachable.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { GenericResourcePreview } from './GenericResourcePreview';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: vi.fn(),
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: vi.fn() }));
const viewport = vi.hoisted(() => ({ isVisible: false }));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: viewport.isVisible }),
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({ useOgMetadata: vi.fn() }));
vi.mock('@/molecules/ResourcePlayer/ResourcePlayerFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/molecules/ResourcePlayer/ResourcePlayerFrame')>()),
  AnimatedHeight: ({ children }: { children: React.ReactNode }) => <div data-testid="animated-height">{children}</div>,
}));
// The action row and tag bar have their own tests; here only what they are given matters. The extra
// ⋯ entries render in a dropdown, as the real ⋯ menu renders them on a desktop; `data-has-extra-menu`
// says whether any were passed.
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: ({
    uri,
    spellings,
    postUri,
    collectionsCount,
    tagsLabel,
    linkUrl,
    title,
    isOnScreen,
    playOn,
    extraMenuContent,
    card,
  }: {
    uri: string;
    card?: { id: string } | null;
    spellings?: readonly string[];
    postUri?: string | null;
    collectionsCount?: number | null;
    tagsLabel: string;
    linkUrl?: string | null;
    title?: string | null;
    isOnScreen?: boolean;
    playOn?: React.ReactNode;
    extraMenuContent?: ResourceExtraMenuContent;
  }) => (
    <div
      data-resource-controls
      data-testid="resource-actions"
      data-uri={uri}
      data-spellings={(spellings ?? []).join(' ')}
      data-post-uri={postUri ?? 'default'}
      data-collections={collectionsCount ?? 'none'}
      data-tags-label={tagsLabel}
      data-link-url={linkUrl ?? 'none'}
      data-title={title ?? 'none'}
      data-on-screen={String(isOnScreen)}
      data-has-extra-menu={String(Boolean(extraMenuContent))}
      data-card-id={card?.id ?? 'none'}
    >
      {playOn}
      {extraMenuContent && (
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="mock-more-trigger">More options</DropdownMenuTrigger>
          <DropdownMenuContent data-testid="resource-more-menu">
            {extraMenuContent({ variant: MENU_VARIANT.DROPDOWN, closeMenu: () => {} })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  ),
}));

const URL = 'https://en.wikipedia.org/wiki/Bitcoin';
/** The video without its tracks on Spotify, Deezer and TIDAL: a video with Also on. */
const ORDINARY_VIDEO = {
  ...videoFixture,
  also_on: videoFixture.also_on.filter((entry) => !['Spotify', 'Deezer', 'TIDAL'].includes(entry.site ?? '')),
};
/**
 * A generic link (`isPlayable` false) Pinakes knows on YouTube too: an artist's MusicBrainz page.
 * Its card shows first, with the embed/card switch in its header.
 */
const ARTIST_URL = 'https://musicbrainz.org/artist/056e4f3e-d505-4dad-8ec1-d04f521cbb56';
const ARTIST = {
  ...ORDINARY_VIDEO,
  uri: ARTIST_URL,
  refs: [ARTIST_URL],
  aliases: [],
  site: 'MusicBrainz',
  type: 'MusicGroup',
  type_path: ['Thing', 'Organization', 'PerformingGroup', 'MusicGroup'],
};

describe('GenericResourcePreview', () => {
  const mockUsePinakesCard = vi.mocked(usePinakesCard);
  const mockUseOgMetadata = vi.mocked(useOgMetadata);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPinakesConfigured).mockReturnValue(true);
    mockUseOgMetadata.mockReturnValue({
      metadata: { url: 'en.wikipedia.org', title: 'Bitcoin - Wikipedia', image: null, type: 'website' },
      isLoading: false,
      error: null,
    });
  });

  it('gives the footer the card it shows, whose other links’ tags join its own as on the resource page', () => {
    mockUsePinakesCard.mockReturnValue({ data: mbGroupEnrichedFixture, isLoading: false, isError: false });
    const { unmount } = render(<GenericResourcePreview url={mbGroupEnrichedFixture.uri} />);
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card-id', mbGroupEnrichedFixture.id);
    unmount();

    // In the service's own embed up front too (a card with no Also on: its group may still be known).
    mockUsePinakesCard.mockReturnValue({ data: { ...musicFixture, also_on: [] }, isLoading: false, isError: false });
    const embedded = render(<GenericResourcePreview url={musicFixture.uri} />);
    expect(screen.getByTestId('resource-embed-frame')).toBeInTheDocument();
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card-id', musicFixture.id);
    embedded.unmount();

    // No card for the link (its own preview): nothing but its own tags.
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: false });
    render(<GenericResourcePreview url={URL} />);
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-card-id', 'none');
  });

  it('reads the Pinakes card for the link', () => {
    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url={URL} />);

    expect(mockUsePinakesCard).toHaveBeenCalledWith(URL, { recheck: false, resolve: false });
  });

  it('shows the link’s own preview with its actions once the card takes longer than 5 s, until the card is read', () => {
    vi.useFakeTimers();
    try {
      mockUsePinakesCard.mockReturnValue({ data: undefined, isLoading: true, isError: false });
      const { rerender } = render(<GenericResourcePreview url={URL} />);
      expect(screen.getByTestId('resource-card-skeleton')).toHaveAttribute('aria-busy', 'true');

      act(() => vi.advanceTimersByTime(PINAKES_SLOW_READ_MS));
      expect(screen.queryByTestId('resource-card-skeleton')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
      expect(screen.getByTestId('resource-actions')).toBeInTheDocument();

      const box = screen.getByTestId('resource-preview');
      mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });
      rerender(<GenericResourcePreview url={URL} />);
      // The card takes the preview's place in the same box, with no skeleton in between.
      expect(screen.getByTestId('resource-preview')).toBe(box);
      expect(within(box).getByTestId('resource-card')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-link-card')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts over for another link on the same preview', () => {
    vi.useFakeTimers();
    try {
      mockUsePinakesCard.mockReturnValue({ data: undefined, isLoading: true, isError: false });
      const { rerender } = render(<GenericResourcePreview url={URL} />);
      act(() => vi.advanceTimersByTime(PINAKES_SLOW_READ_MS));
      expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();

      mockUsePinakesCard.mockReturnValue({ data: ARTIST, isLoading: false, isError: false });
      rerender(<GenericResourcePreview url={ARTIST.uri} />);
      expect(screen.getByTestId('resource-card')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the plain link preview, unchanged and without actions, when Pinakes is not configured', () => {
    vi.mocked(isPinakesConfigured).mockReturnValue(false);
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: false });

    render(<GenericResourcePreview url={URL} />);

    expect(mockUsePinakesCard).toHaveBeenCalledWith(null, { recheck: false, resolve: false });
    expect(screen.getByTestId('generic-website-preview')).toHaveTextContent('Bitcoin - Wikipedia');
    expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
  });

  it.each([
    'https://example.com/clip.mp4',
    'https://example.com/talk.mp3',
    'https://example.com/photo.JPG',
    'https://example.com/media/diagram.webp',
    'http://example.com/photo.jpg',
    'http://example.com/clip.mp4',
  ])('does not look up the direct media file %s, so the plain preview plays it', (url) => {
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: false });

    render(<GenericResourcePreview url={url} />);

    expect(mockUsePinakesCard).toHaveBeenCalledWith(null, { recheck: false, resolve: false });
    expect(mockUseOgMetadata).toHaveBeenCalledWith(url);
    expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
  });

  it('shows the card skeleton in the frame, with the action rows, while Pinakes is read', () => {
    mockUsePinakesCard.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(<GenericResourcePreview url={URL} />);

    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('resource-card-skeleton-actions')).toBeInTheDocument();
    expect(mockUseOgMetadata).not.toHaveBeenCalled();
  });

  it('shows the resource card, its source linking to the post’s link, with its actions on that link', () => {
    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url={URL} />);

    expect(screen.getByTestId('resource-card')).toBeInTheDocument();
    expect(screen.getByTestId('resource-card-source')).toHaveAttribute('href', URL);
    const actions = screen.getByTestId('resource-actions');
    expect(actions).toHaveAttribute('data-uri', URL);
    expect(actions).toHaveAttribute('data-collections', String(articleFixture.collections));
    expect(actions).toHaveAttribute('data-tags-label', 'Tags on this article');
    expect(screen.queryByTestId('generic-website-preview')).not.toBeInTheDocument();
    // Its Wikimedia image shows without a credit: the link's own preview is not read for it.
    expect(mockUseOgMetadata).not.toHaveBeenCalledWith(URL);
  });

  it('does not read the link’s own preview for a card that has its title and image', () => {
    mockUsePinakesCard.mockReturnValue({ data: ARTIST, isLoading: false, isError: false });

    render(<GenericResourcePreview url={ARTIST.uri} />);

    expect(screen.getByTestId('resource-card')).toBeInTheDocument();
    expect(mockUseOgMetadata).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('gives the ⋯ menu the link and title the card shows', () => {
    mockUsePinakesCard.mockReturnValue({ data: videoFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url="https://youtu.be/dQw4w9WgXcQ" />);

    const actions = screen.getByTestId('resource-actions');
    expect(actions).toHaveAttribute('data-link-url', 'https://youtu.be/dQw4w9WgXcQ');
    expect(actions).toHaveAttribute('data-title', videoFixture.name);
  });

  it('gives the ⋯ menu the link, and no title, for a link Pinakes has no card for', () => {
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: false });

    render(<GenericResourcePreview url={URL} />);

    const actions = screen.getByTestId('resource-actions');
    expect(actions).toHaveAttribute('data-link-url', URL);
    expect(actions).toHaveAttribute('data-title', 'none');
  });

  it('tells the footer whether the card is on screen, so its tags wait until it is', () => {
    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

    const { rerender } = render(<GenericResourcePreview url={URL} />);
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-on-screen', 'false');

    viewport.isVisible = true;
    rerender(<GenericResourcePreview url={URL} />);
    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-on-screen', 'true');
    viewport.isVisible = false;
  });

  it('names the tag bar after the card’s type', () => {
    mockUsePinakesCard.mockReturnValue({ data: videoFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url={videoFixture.uri} />);

    expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-tags-label', 'Tags on this video');
  });

  it('names the sources of an enriched card at the bottom of its body, above the action row', () => {
    mockUsePinakesCard.mockReturnValue({ data: mbGroupEnrichedFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url={mbGroupEnrichedFixture.uri} />);

    const credits = screen.getByTestId('resource-credits');
    const actions = screen.getByTestId('resource-actions');
    expect(credits).toHaveTextContent('Sources: Text: Wikipedia, CC BY-SA 4.0 · Image: Sony Music Entertainment');
    expect(credits.compareDocumentPosition(actions)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // Its other services are in the ⋯ menu.
    expect(actions).toHaveAttribute('data-has-extra-menu', 'true');
    expect(actions).toHaveAttribute('data-tags-label', 'Tags on this artist');
  });

  it('leaves out the action row and tag bar while composing', () => {
    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url={URL} isComposing />);

    expect(screen.getByTestId('resource-card')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
  });

  it('grows the box smoothly in a post, and leaves the composer to size its own height', () => {
    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

    const { unmount } = render(<GenericResourcePreview url={URL} />);
    expect(within(screen.getByTestId('resource-preview')).getByTestId('animated-height')).toBeInTheDocument();
    unmount();

    render(<GenericResourcePreview url={URL} isComposing />);
    expect(screen.queryByTestId('animated-height')).not.toBeInTheDocument();
  });

  it('asks Pinakes to read the link while composing, and not in a published post', () => {
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: false });

    viewport.isVisible = true;
    render(<GenericResourcePreview url={URL} isComposing />);
    // On screen, yet not re-read: the published post keeps the link's re-reads.
    expect(mockUsePinakesCard).toHaveBeenLastCalledWith(URL, { recheck: false, resolve: true });
    viewport.isVisible = false;

    render(<GenericResourcePreview url={URL} />);
    expect(mockUsePinakesCard).toHaveBeenLastCalledWith(URL, { recheck: false, resolve: false });
  });

  it('reads an unknown link again only while it is on screen, and puts its card where the preview stood', () => {
    viewport.isVisible = true;
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: false });

    const { rerender } = render(<GenericResourcePreview url={URL} />);
    expect(mockUsePinakesCard).toHaveBeenLastCalledWith(URL, { recheck: true, resolve: false });
    const box = screen.getByTestId('resource-preview');
    expect(within(box).getByTestId('resource-link-card')).toBeInTheDocument();

    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });
    rerender(<GenericResourcePreview url={URL} />);

    expect(screen.getByTestId('resource-preview')).toBe(box);
    expect(within(box).getByTestId('resource-card')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-card-skeleton')).not.toBeInTheDocument();
    viewport.isVisible = false;
  });

  it('leaves the action rows out of the composer’s skeleton', () => {
    mockUsePinakesCard.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(<GenericResourcePreview url={URL} isComposing />);

    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-card-skeleton-actions')).not.toBeInTheDocument();
  });

  it.each([true, false])('leaves out the action row and tag bar inside a quoted post (navigable: %s)', (navigable) => {
    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

    render(
      <PostPreviewNestingProvider navigable={navigable}>
        <GenericResourcePreview url={URL} />
      </PostPreviewNestingProvider>,
    );

    expect(screen.getByTestId('resource-card')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
  });

  it('leaves out the actions of the link’s own preview and of the skeleton inside a quoted post', () => {
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: false });
    const { rerender } = render(
      <PostPreviewNestingProvider>
        <GenericResourcePreview url={URL} />
      </PostPreviewNestingProvider>,
    );

    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();

    mockUsePinakesCard.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    rerender(
      <PostPreviewNestingProvider>
        <GenericResourcePreview url={URL} />
      </PostPreviewNestingProvider>,
    );

    expect(screen.getByTestId('resource-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-card-skeleton-actions')).not.toBeInTheDocument();
  });

  it('shows the link’s own preview in the card frame, with actions, when Pinakes has no card', () => {
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: false });

    render(<GenericResourcePreview url={URL} />);

    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
    expect(screen.getByTestId('resource-link-card-title')).toHaveTextContent('Bitcoin - Wikipedia');
    const actions = screen.getByTestId('resource-actions');
    expect(actions).toHaveAttribute('data-collections', 'none');
    expect(actions).toHaveAttribute('data-tags-label', 'Tags on the external resource');
    expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
  });

  it.each([PinakesStatus.PENDING, PinakesStatus.ERROR])(
    'shows the link’s own preview for a %s card without a name',
    (status) => {
      mockUsePinakesCard.mockReturnValue({
        data: { ...articleFixture, status, name: null },
        isLoading: false,
        isError: false,
      });

      render(<GenericResourcePreview url={URL} />);

      expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
    },
  );

  it('shows a missing card without a name, since it says the link is gone', () => {
    mockUsePinakesCard.mockReturnValue({ data: missingFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url={missingFixture.uri} />);

    expect(screen.getByTestId('resource-card')).toHaveAttribute('data-status', PinakesStatus.MISSING);
  });

  describe('also on', () => {
    const openMoreMenu = () => {
      fireEvent.pointerDown(screen.getByTestId('mock-more-trigger'), { button: 0, ctrlKey: false });
      return screen.getByTestId('resource-more-menu');
    };

    it('adds nothing to the ⋯ menu, and stays a click-through, when the resource is on one site only', () => {
      mockUsePinakesCard.mockReturnValue({ data: eventFixture, isLoading: false, isError: false });

      render(<GenericResourcePreview url={eventFixture.uri} />);

      expect(eventFixture.also_on).toHaveLength(0);
      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-has-extra-menu', 'false');
      expect(screen.getByTestId('resource-card')).toHaveAttribute('data-click-through', 'true');
      expect(screen.getByTestId('resource-card-source')).toHaveAttribute('href', eventFixture.uri);
    });

    it('lists the other services under "Also on" in the ⋯ menu, one row each, without its own', () => {
      mockUsePinakesCard.mockReturnValue({ data: videoFixture, isLoading: false, isError: false });

      render(<GenericResourcePreview url={videoFixture.uri} />);

      // The video is a track on Spotify, Deezer and TIDAL too (`isSong`): its player shows up front
      // in the resource frame, whose type still opens the resource page.
      expect(screen.getByTestId('resource-card-type')).toHaveAttribute('href', getResourceRoute(videoFixture.uri));
      const menu = openMoreMenu();
      const rows = within(within(menu).getByRole('group', { name: 'Also on' })).getAllByRole('menuitem');
      // A YouTube video: the other YouTube upload is its own service.
      expect(rows.map((row) => row.textContent)).toEqual(['TIDAL', 'Apple Music', 'MusicBrainz', 'Deezer', 'Spotify']);
      expect(rows[0]).toHaveAttribute('href', getResourceRoute('https://tidal.com/track/490851477'));
      // The card's own link is not a row: the card's header opens it.
      expect(rows.map((row) => row.getAttribute('href'))).not.toContain(getResourceRoute(videoFixture.uri));
      // The card's menu lists only where the resource is: Also on, no Similar.
      expect(within(menu).queryByText(/similar/i)).not.toBeInTheDocument();
    });

    it('shows a generic link’s card first with the switch in its header; a picked service never opens the page from its player', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      mockUsePinakesCard.mockReturnValue({ data: ARTIST, isLoading: false, isError: false });
      render(<GenericResourcePreview url={ARTIST.uri} />);

      const card = screen.getByTestId('resource-card');
      expect(card).toHaveAttribute('data-click-through', 'true');
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      const switchButton = within(card).getByRole('button', { name: 'Card: choose another service' });
      fireEvent.click(switchButton);
      expect(mockPush).not.toHaveBeenCalled();
      fireEvent.pointerDown(switchButton, { button: 0, ctrlKey: false });
      fireEvent.click(screen.getByRole('menuitem', { name: 'YouTube' }));
      expect(within(screen.getByTestId('resource-embed-frame')).getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/Om61naQC8is?enablejsapi=1&rel=0',
      );

      // A click (or a middle click) on or around the player never leaves what plays.
      fireEvent.click(screen.getByTestId('resource-player'));
      fireEvent(
        screen.getByTestId('resource-player'),
        new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
      );
      expect(mockPush).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      open.mockRestore();
      // A click on the rest of the frame, its header's surface (the type is a link of its own), still opens the page.
      fireEvent.click(screen.getByTestId('resource-card-type').parentElement!);
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(ARTIST.uri));
    });

    it('adds nothing to the ⋯ menu, and stays a click-through, when Also on lists only its own service', () => {
      // An English Wikipedia article: its mobile page is the same service.
      const card = {
        ...articleFixture,
        also_on: [{ uri: 'https://en.m.wikipedia.org/wiki/Bitcoin', site: 'Wikipedia (en)' }],
      };
      mockUsePinakesCard.mockReturnValue({ data: card, isLoading: false, isError: false });

      render(<GenericResourcePreview url={card.uri} />);

      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-has-extra-menu', 'false');
      expect(screen.getByTestId('resource-card')).toHaveAttribute('data-click-through', 'true');
    });

    it('keeps the other services on a card that is not ok, which shows its status', () => {
      mockUsePinakesCard.mockReturnValue({ data: unreachableFixture, isLoading: false, isError: false });

      render(<GenericResourcePreview url={unreachableFixture.uri} />);

      expect(screen.getByTestId('resource-card-status')).toHaveTextContent('The source could not be reached');
      openMoreMenu();

      expect(screen.getByRole('menuitem', { name: /^Wayback Machine, Archived/ })).toHaveAttribute(
        'href',
        getResourceRoute(unreachableFixture.also_on[0].uri),
      );
    });

    it('lists the other services when the card’s own object is gone, and still gives the menu its link', () => {
      mockUsePinakesCard.mockReturnValue({ data: missingFixture, isLoading: false, isError: false });

      render(<GenericResourcePreview url={missingFixture.uri} />);

      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-link-url', missingFixture.uri);
      const items = within(openMoreMenu()).getAllByRole('menuitem');
      // Deezer and Spotify are listed more than once: one row each.
      expect(items.map((item) => item.textContent)).toEqual(['Deezer', 'Qobuz', 'TIDAL', 'Spotify', 'YouTube']);
      expect(items[0]).toHaveAttribute('href', getResourceRoute(missingFixture.also_on[0].uri));
      expect(items.map((item) => item.getAttribute('href'))).not.toContain(getResourceRoute(missingFixture.uri));
    });

    it('adds nothing to the ⋯ menu on the link’s own preview, which Pinakes has no card for', () => {
      mockUsePinakesCard.mockReturnValue({
        data: { ...videoFixture, status: PinakesStatus.PENDING, name: null },
        isLoading: false,
        isError: false,
      });

      render(<GenericResourcePreview url={videoFixture.uri} />);

      expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-has-extra-menu', 'false');
    });
  });

  it('treats a failed Pinakes read like an unknown link, with no error box', () => {
    mockUsePinakesCard.mockReturnValue({ data: null, isLoading: false, isError: true });

    render(<GenericResourcePreview url={URL} />);

    expect(screen.getByTestId('resource-link-card')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
  });

  describe('a link on a service with an embed', () => {
    const SPOTIFY = musicFixture.uri;

    it('shows the service’s own embed up front in the resource frame when the card has no Also on', () => {
      mockUsePinakesCard.mockReturnValue({ data: { ...musicFixture, also_on: [] }, isLoading: false, isError: false });
      render(<GenericResourcePreview url={SPOTIFY} />);

      const frame = screen.getByTestId('resource-embed-frame');
      const player = within(frame).getByTestId('resource-player-frame');
      expect(player.getAttribute('src')).toMatch(/^https:\/\/open\.spotify\.com\/embed\/track\//);
      expect(within(frame).getByTestId('resource-player-status')).toHaveClass('hidden');
      expect(within(frame).getByTestId('resource-actions')).toHaveAttribute('data-uri', SPOTIFY);
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
    });

    it('shows TIDAL’s embed for its `/u` share link, and the canonical link’s for a link with no player', () => {
      const tidal = {
        ...musicFixture,
        uri: 'https://tidal.com/track/3524506',
        site: 'TIDAL',
        also_on: [],
        refs: ['https://tidal.com/track/3524506/u'],
        aliases: ['https://tidal.com/track/3524506/u'],
      };
      mockUsePinakesCard.mockReturnValue({ data: tidal, isLoading: false, isError: false });
      const { unmount } = render(<GenericResourcePreview url="https://tidal.com/track/3524506/u" />);
      expect(screen.getByTestId('resource-player-frame').getAttribute('src')).toBe(
        'https://embed.tidal.com/tracks/3524506?hideOverlays=true',
      );
      unmount();

      render(<GenericResourcePreview url="https://example.com/share/3524506" />);
      expect(screen.getByTestId('resource-player-frame').getAttribute('src')).toBe(
        'https://embed.tidal.com/tracks/3524506?hideOverlays=true',
      );
    });

    it('shows the embed up front for a collection’s item too, on the post card’s surface', () => {
      mockUsePinakesCard.mockReturnValue({ data: { ...musicFixture, also_on: [] }, isLoading: false, isError: false });
      render(
        <ResourceSurfaceProvider surface="card">
          <GenericResourcePreview url={SPOTIFY} />
        </ResourceSurfaceProvider>,
      );

      const frame = screen.getByTestId('resource-embed-frame');
      expect(frame).toHaveClass('bg-card');
      expect(within(frame).getByTestId('resource-player-frame')).toHaveAttribute('loading', 'lazy');
      expect(within(frame).getByTestId('resource-actions')).toBeInTheDocument();
    });

    it('loads another link’s embed anew', () => {
      const OTHER = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
      mockUsePinakesCard.mockReturnValue({ data: { ...musicFixture, also_on: [] }, isLoading: false, isError: false });
      const { rerender } = render(<GenericResourcePreview url={SPOTIFY} isComposing />);
      fireEvent.load(screen.getByTestId('resource-player-frame'));
      expect(screen.getByRole('region', { name: /Spotify player/ })).toHaveAttribute('data-load', 'ready');

      mockUsePinakesCard.mockReturnValue({
        data: { ...musicFixture, uri: OTHER, also_on: [] },
        isLoading: false,
        isError: false,
      });
      rerender(<GenericResourcePreview url={OTHER} isComposing />);
      expect(screen.getByTestId('resource-player-frame').getAttribute('src')).toContain('4uLU6hMCjMI75M1A2tKUQC');
      expect(screen.getByRole('region', { name: /Spotify player/ })).toHaveAttribute('data-load', 'loading');
    });

    it('acts on the card’s canonical link, the link as written read along, and posts about the link as written', () => {
      const tidal = {
        ...musicFixture,
        uri: 'https://tidal.com/track/3524506',
        also_on: [],
        refs: ['https://tidal.com/track/3524506/u'],
        aliases: ['https://tidal.com/track/3524506/u'],
      };
      mockUsePinakesCard.mockReturnValue({ data: tidal, isLoading: false, isError: false });
      render(<GenericResourcePreview url="https://tidal.com/track/3524506/u" />);

      const actions = screen.getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-uri', 'https://tidal.com/track/3524506');
      expect(actions).toHaveAttribute('data-spellings', 'https://tidal.com/track/3524506/u');
      expect(actions).toHaveAttribute('data-post-uri', 'https://tidal.com/track/3524506/u');
    });

    it('shows the link’s player when the card is on other services too, those in the switch', () => {
      mockUsePinakesCard.mockReturnValue({ data: ORDINARY_VIDEO, isLoading: false, isError: false });
      render(<GenericResourcePreview url="https://www.youtube.com/playlist?list=PLabcdefghij" />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('resource-player-frame').getAttribute('src')).toContain(
        'https://www.youtube-nocookie.com/embed/videoseries?list=PLabcdefghij',
      );
      expect(within(frame).getByRole('button', { name: 'YouTube: choose another service' })).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
    });

    it('previews the same embed in the composer, without the footer', () => {
      mockUsePinakesCard.mockReturnValue({ data: { ...musicFixture, also_on: [] }, isLoading: false, isError: false });
      render(<GenericResourcePreview url={SPOTIFY} isComposing />);

      expect(screen.getByTestId('resource-embed-frame')).toBeInTheDocument();
      expect(screen.getByTestId('resource-player-frame')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
    });

    describe('with platform embeds up front off', () => {
      beforeEach(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('shows the player’s stand-in with Play on in the resource frame and loads nothing from the service', () => {
        const album = {
          ...musicFixture,
          uri: 'https://open.spotify.com/album/2noRn2Aes5aoNVsU6iWThc',
          type: 'MusicAlbum',
          type_path: ['Thing', 'CreativeWork', 'MusicAlbum'],
          also_on: [],
        };
        mockUsePinakesCard.mockReturnValue({ data: album, isLoading: false, isError: false });
        render(<GenericResourcePreview url={album.uri} />);

        const frame = screen.getByTestId('resource-embed-frame');
        expect(within(frame).getByRole('button', { name: 'Play on Spotify' })).toBeInTheDocument();
        expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
      });
    });

    describe('with the service removed from Players', () => {
      beforeEach(() =>
        useSettingsStore.setState({ media: { ...defaultMediaPreferences, hiddenPlayers: ['spotify'] } }),
      );
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('keeps our card, with no Play on, and loads nothing from the service', () => {
        const album = {
          ...musicFixture,
          uri: 'https://open.spotify.com/album/2noRn2Aes5aoNVsU6iWThc',
          type: 'MusicAlbum',
          type_path: ['Thing', 'CreativeWork', 'MusicAlbum'],
          also_on: [],
        };
        mockUsePinakesCard.mockReturnValue({ data: album, isLoading: false, isError: false });
        render(<GenericResourcePreview url={album.uri} />);

        expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        expect(screen.queryByTestId('resource-embed-frame')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
      });
    });

    it('keeps the card in a quoted post', () => {
      mockUsePinakesCard.mockReturnValue({ data: { ...musicFixture, also_on: [] }, isLoading: false, isError: false });
      render(
        <PostPreviewNestingProvider>
          <GenericResourcePreview url={SPOTIFY} />
        </PostPreviewNestingProvider>,
      );

      expect(screen.getByTestId('resource-card')).toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
    });
  });
  describe('a song', () => {
    // Get Lucky on Spotify, also on Bandcamp (no player), TIDAL and YouTube.
    const SONG = {
      ...musicFixture,
      also_on: [
        { id: 'b', uri: 'https://rickastley.bandcamp.com/track/never-gonna-give-you-up', site: 'Bandcamp' },
        { id: 't', uri: 'https://tidal.com/track/490851477', site: 'TIDAL' },
        { id: 'y', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', site: 'YouTube' },
      ],
    };
    const switchButton = () => screen.getByRole('button', { name: /choose another service$/ });

    it('shows its player up front with Also on, in the resource frame: no card text, no Play on, tags and actions kept', () => {
      mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
      render(<GenericResourcePreview url={SONG.uri} />);

      const frame = screen.getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP',
      );
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-title')).not.toBeInTheDocument();
      expect(within(frame).getByTestId('resource-card-type')).toHaveTextContent('Song');
      const actions = within(frame).getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-uri', SONG.uri);
      expect(actions).toHaveAttribute('data-has-extra-menu', 'true');
      expect(within(actions).queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    });

    it('switches its player without opening the resource page', () => {
      mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
      render(<GenericResourcePreview url={SONG.uri} />);

      fireEvent.click(switchButton());
      fireEvent.pointerDown(switchButton(), { button: 0, ctrlKey: false });
      fireEvent.click(screen.getByRole('menuitem', { name: 'TIDAL' }));
      fireEvent.click(screen.getByTestId('resource-player-frame'));

      expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://embed.tidal.com/tracks/490851477?hideOverlays=true',
      );
      expect(mockPush).not.toHaveBeenCalled();
    });

    describe('with the viewer’s Players', () => {
      const setPlayers = (playerOrder: string[], hiddenPlayers: string[] = []) =>
        useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder, hiddenPlayers } });
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('shows the first service in the viewer’s order, its switch in that order', () => {
        setPlayers(['tidal', 'youtube', 'spotify']);
        mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
        render(<GenericResourcePreview url={SONG.uri} />);

        expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
          'src',
          'https://embed.tidal.com/tracks/490851477?hideOverlays=true',
        );
        fireEvent.pointerDown(switchButton(), { button: 0, ctrlKey: false });
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
          'Card',
          'TIDAL',
          'YouTube',
          'Spotify',
        ]);
      });

      it('leaves a removed service out, the shared link’s too, whose card then shows first like a generic link’s', () => {
        setPlayers([], ['spotify']);
        mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
        render(<GenericResourcePreview url={SONG.uri} />);

        expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        expect(switchButton()).toHaveTextContent('Card');
        fireEvent.pointerDown(switchButton(), { button: 0, ctrlKey: false });
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Card', 'TIDAL', 'YouTube']);
        expect(document.querySelectorAll('iframe[src*="spotify"]')).toHaveLength(0);
      });

      it('shows the card without a player when every service it is on is removed', () => {
        setPlayers([], ['spotify', 'tidal', 'youtube']);
        mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
        render(<GenericResourcePreview url={SONG.uri} />);

        expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
      });
    });

    it('previews the same player and switch in the composer, without the footer', () => {
      mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
      render(<GenericResourcePreview url={SONG.uri} isComposing />);

      expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP',
      );
      expect(switchButton()).toBeInTheDocument();
      expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
    });

    it('shows our card in place from the switch’s Card, with the switch to pick a service again', () => {
      mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
      render(<GenericResourcePreview url={SONG.uri} />);

      fireEvent.pointerDown(switchButton(), { button: 0, ctrlKey: false });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Show the link card instead of a player' }));

      const card = screen.getByTestId('resource-card');
      expect(document.querySelector('iframe')).toBeNull();
      expect(within(card).getByTestId('resource-card-title')).toHaveTextContent(SONG.name!);
      expect(within(card).getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
      expect(within(card).getByTestId('resource-actions')).toHaveAttribute('data-has-extra-menu', 'true');
      expect(within(card).queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();

      fireEvent.pointerDown(switchButton(), { button: 0, ctrlKey: false });
      fireEvent.click(screen.getByRole('menuitem', { name: 'TIDAL' }));
      expect(within(screen.getByTestId('resource-embed-frame')).getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://embed.tidal.com/tracks/490851477?hideOverlays=true',
      );
      expect(mockPush).not.toHaveBeenCalled();
    });

    describe('with Card (no player) first in Players', () => {
      beforeEach(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder: ['card'] } }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('shows our card first, loading nothing, also for a song on one service', () => {
        mockUsePinakesCard.mockReturnValue({ data: { ...SONG, also_on: [] }, isLoading: false, isError: false });
        render(<GenericResourcePreview url={SONG.uri} />);

        expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        expect(screen.queryByTestId('resource-embed-frame')).not.toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        expect(switchButton()).toHaveAccessibleName('Card: choose another service');
      });

      it('shows our card, loading nothing, for an album on one service, its switch offering that service', () => {
        const album = {
          ...musicFixture,
          uri: 'https://tidal.com/album/655910',
          site: 'TIDAL',
          type: 'MusicAlbum',
          type_path: ['Thing', 'CreativeWork', 'MusicAlbum'],
          also_on: [],
        };
        mockUsePinakesCard.mockReturnValue({ data: album, isLoading: false, isError: false });
        render(<GenericResourcePreview url={album.uri} />);

        expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        expect(screen.queryByTestId('resource-embed-frame')).not.toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        expect(screen.queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
        expect(switchButton()).toHaveAccessibleName('Card: choose another service');
      });

      it('previews our card in the composer, without the footer', () => {
        mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
        render(<GenericResourcePreview url={SONG.uri} isComposing />);

        expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        expect(document.querySelector('iframe')).toBeNull();
        expect(switchButton()).toBeInTheDocument();
        expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
      });
    });

    describe('with platform embeds up front off', () => {
      beforeEach(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } }));
      afterEach(() => useSettingsStore.setState({ media: defaultMediaPreferences }));

      it('loads no player, and offers Play on in its place, the footer kept', () => {
        mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
        render(<GenericResourcePreview url={SONG.uri} />);

        expect(document.querySelector('iframe')).toBeNull();
        expect(
          within(screen.getByTestId('embed-player')).getByRole('button', { name: 'Play on Spotify' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('resource-actions')).toBeInTheDocument();
      });
    });

    it('keeps the card in a quoted post', () => {
      mockUsePinakesCard.mockReturnValue({ data: SONG, isLoading: false, isError: false });
      render(
        <PostPreviewNestingProvider>
          <GenericResourcePreview url={SONG.uri} />
        </PostPreviewNestingProvider>,
      );

      expect(screen.getByTestId('resource-card')).toBeInTheDocument();
      expect(document.querySelector('iframe')).toBeNull();
    });
  });
});
