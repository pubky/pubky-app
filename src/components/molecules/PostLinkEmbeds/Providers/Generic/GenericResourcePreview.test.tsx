import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { isPinakesConfigured } from '@/config/pinakes';
import { MENU_VARIANT } from '@/config/ui';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import type { ResourceExtraMenuContent } from '@/organisms/ResourceActions/ResourceMoreMenu';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import missingFixture from '@/services/pinakes/fixtures/by-uri.missing.json';
import unreachableFixture from '@/services/pinakes/fixtures/by-uri.unreachable.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import { GenericResourcePreview } from './GenericResourcePreview';

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: vi.fn() }));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({ usePinakesCard: vi.fn() }));
const viewport = vi.hoisted(() => ({ isVisible: false }));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: viewport.isVisible }),
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({ useOgMetadata: vi.fn() }));
// The action row and tag bar have their own tests; here only what they are given matters. The extra
// ⋯ entries render in a dropdown, as the real ⋯ menu renders them on a desktop; `data-has-extra-menu`
// says whether any were passed.
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: ({
    uri,
    collectionsCount,
    tagsLabel,
    linkUrl,
    title,
    isOnScreen,
    extraMenuContent,
  }: {
    uri: string;
    collectionsCount?: number | null;
    tagsLabel: string;
    linkUrl?: string | null;
    title?: string | null;
    isOnScreen?: boolean;
    extraMenuContent?: ResourceExtraMenuContent;
  }) => (
    <div
      data-resource-controls
      data-testid="resource-actions"
      data-uri={uri}
      data-collections={collectionsCount ?? 'none'}
      data-tags-label={tagsLabel}
      data-link-url={linkUrl ?? 'none'}
      data-title={title ?? 'none'}
      data-on-screen={String(isOnScreen)}
      data-has-extra-menu={String(Boolean(extraMenuContent))}
    >
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

  it('reads the Pinakes card for the link', () => {
    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url={URL} />);

    expect(mockUsePinakesCard).toHaveBeenCalledWith(URL, { recheck: false, resolve: false });
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
    expect(mockUseOgMetadata).not.toHaveBeenCalled();
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

  it('leaves out the action row and tag bar while composing', () => {
    mockUsePinakesCard.mockReturnValue({ data: articleFixture, isLoading: false, isError: false });

    render(<GenericResourcePreview url={URL} isComposing />);

    expect(screen.getByTestId('resource-card')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
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

      expect(screen.getByTestId('resource-card')).not.toHaveAttribute('data-click-through');
      const menu = openMoreMenu();
      const rows = within(within(menu).getByRole('group', { name: 'Also on' })).getAllByRole('menuitem');
      // A YouTube video: the other YouTube upload is its own service.
      expect(rows.map((row) => row.textContent)).toEqual(['TIDAL', 'Apple Music', 'MusicBrainz', 'Deezer', 'Spotify']);
      expect(rows[0]).toHaveAttribute('href', 'https://tidal.com/track/490851477');
      // The card's own link is not a row: the card's header opens it.
      expect(rows.map((row) => row.getAttribute('href'))).not.toContain(videoFixture.uri);
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
        unreachableFixture.also_on[0].uri,
      );
    });

    it('lists the other services when the card’s own object is gone, and still gives the menu its link', () => {
      mockUsePinakesCard.mockReturnValue({ data: missingFixture, isLoading: false, isError: false });

      render(<GenericResourcePreview url={missingFixture.uri} />);

      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-link-url', missingFixture.uri);
      const items = within(openMoreMenu()).getAllByRole('menuitem');
      // Deezer and Spotify are listed more than once: one row each.
      expect(items.map((item) => item.textContent)).toEqual(['Deezer', 'Qobuz', 'TIDAL', 'Spotify', 'YouTube']);
      expect(items[0]).toHaveAttribute('href', missingFixture.also_on[0].uri);
      expect(items.map((item) => item.getAttribute('href'))).not.toContain(missingFixture.uri);
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
});
