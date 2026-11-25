import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import bookFixture from '@/services/pinakes/fixtures/by-uri.book.json';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import instagramBlockedFixture from '@/services/pinakes/fixtures/by-uri.instagram-blocked.json';
import mbArtistSparseEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-artist-sparse.enriched.json';
import mbArtistSparseFixture from '@/services/pinakes/fixtures/by-uri.mb-artist-sparse.json';
import mbGroupEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-group.enriched.json';
import mbReleaseGroupEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-release-group.enriched.json';
import mbReleaseGroupFixture from '@/services/pinakes/fixtures/by-uri.mb-release-group.json';
import missingFixture from '@/services/pinakes/fixtures/by-uri.missing.json';
import movieFixture from '@/services/pinakes/fixtures/by-uri.movie.json';
import musicRecordingFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import podcastFixture from '@/services/pinakes/fixtures/by-uri.podcast.json';
import pubkyFixture from '@/services/pinakes/fixtures/by-uri.pubky.json';
import scholarlyArticleFixture from '@/services/pinakes/fixtures/by-uri.scholarly-article.json';
import unreachableFixture from '@/services/pinakes/fixtures/by-uri.unreachable.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceCard } from './ResourceCard';
import { ResourceFamily } from './ResourceCard.types';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
// The link's own preview (OpenGraph) fills only what a card lacks; its tests are in ResourceCard.fallback.test.
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
// The image's lightbox: Embla is stubbed only because jsdom lacks the matchMedia it needs
// (as in PostAttachmentsImagesAndVideos.focus.test); the Dialog is the real one.
// One API object for every render, as Embla keeps its own.
vi.mock('embla-carousel-react', () => {
  const api = {
    scrollPrev: () => {},
    scrollNext: () => {},
    canScrollPrev: () => false,
    canScrollNext: () => false,
    selectedScrollSnap: () => 0,
    on: () => {},
    off: () => {},
    scrollTo: () => {},
  };
  const ref = () => {};
  return { default: () => [ref, api] };
});

const ARTICLE: TPinakesResourceDetail = articleFixture;
/** An article's page that is a video with its player (`embed`): its image stands where the player stands. */
const VIDEO_PAGE: TPinakesResourceDetail = {
  ...ARTICLE,
  type: 'VideoObject',
  type_path: ['Thing', 'CreativeWork', 'MediaObject', 'VideoObject'],
  embed: {
    provider: 'youtube',
    kind: 'video',
    src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0',
    height: null,
    aspect: 1.7778,
    allow: ['autoplay'],
    autoplay_param: 'autoplay=1',
  },
};

const card = () => screen.getByTestId('resource-card');
const title = () => screen.getByTestId('resource-card-title');
const source = () => screen.getByTestId('resource-card-source');
/** The card's image, inside its slot: small beside the text, or under it for an embed's image. */
const cardImage = () => within(screen.getByTestId('resource-card-image')).getByRole('img');

describe('ResourceCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockPush.mockClear();
  });

  describe('header and click-through', () => {
    it('stays a click-through while a player or an embed stands in its body, and a click in that body stays there', () => {
      const wrap = (body: React.ReactNode) => <div data-testid="wrapped">{body}</div>;
      const { rerender } = render(<ResourceCard card={videoFixture} renderBody={wrap} />);

      // A body that may turn into a player is the card's until it does.
      expect(card()).toHaveAttribute('data-click-through', 'true');
      expect(screen.getByTestId('wrapped')).toContainElement(title());
      expect(screen.getByTestId('wrapped').closest('[data-resource-controls]')).toBeNull();

      const wrapped = screen.getByTestId('wrapped');
      rerender(<ResourceCard card={videoFixture} renderBody={wrap} isBodyReplaced />);
      // Opening a player remounts nothing the body renders (its AnimatedHeight animates the change).
      expect(screen.getByTestId('wrapped')).toBe(wrapped);
      // The player (or embed) and the space around it are its own controls, as in the embed frame.
      const controls = screen.getByTestId('wrapped').closest('[data-resource-controls]');
      expect(controls).toHaveClass('cursor-auto');
      fireEvent.click(screen.getByTestId('wrapped'));
      fireEvent.click(controls!);
      expect(mockPush).not.toHaveBeenCalled();

      // The rest of the card still opens the resource page.
      expect(card()).toHaveAttribute('data-click-through', 'true');
      fireEvent.click(screen.getByTestId('resource-card-type'));
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(videoFixture.uri));
    });

    it('stays a click-through while its episode plays in the card, and a click on the audio stays there', () => {
      const stream = { url: 'https://cdn.example.com/episode.mp3', type: 'audio/mpeg', preview: false };
      render(<ResourceCard card={{ ...ARTICLE, stream }} href={ARTICLE.uri} />);
      fireEvent.click(within(screen.getByTestId('resource-card-audio')).getByRole('button', { name: /^Play / }));
      const controls = screen.getByTestId('resource-audio-controls');
      const audio = controls.querySelector('audio');
      expect(audio).toBeInTheDocument();

      fireEvent.play(audio!);
      fireEvent.click(controls);
      fireEvent.click(within(controls).getByRole('button', { name: 'Forward 30 seconds' }));
      expect(mockPush).not.toHaveBeenCalled();

      expect(card()).toHaveAttribute('data-click-through', 'true');
      fireEvent.click(screen.getByTestId('resource-card-description'));
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(ARTICLE.uri));
    });

    it('puts no native tooltip on the title or the summary line', () => {
      render(<ResourceCard card={placeFixture} href={placeFixture.uri} />);

      expect(title()).not.toHaveAttribute('title');
      expect(screen.getByTestId('resource-card-summary')).not.toHaveAttribute('title');
    });

    it('names the site top right with an arrow, never the full link', () => {
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      expect(source()).toHaveTextContent('Wikipedia (en)');
      expect(source()).not.toHaveTextContent('en.wikipedia.org/wiki');
      expect(source().querySelector('svg.lucide-arrow-up-right')).toBeInTheDocument();
      expect(source()).toHaveAccessibleName('Open in Wikipedia (en)');
    });

    it('opens the resource page in the same tab on a click anywhere on the card', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      fireEvent.click(screen.getByTestId('resource-card-description'));
      fireEvent.click(screen.getByTestId('resource-card-type'));

      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(ARTICLE.uri));
      expect(open).not.toHaveBeenCalled();
      expect(card()).toHaveAttribute('data-click-through', 'true');
      expect(card()).not.toHaveAttribute('role');
    });

    it('opens the resource page in a new tab on Cmd, Ctrl or Shift-click and on a middle click, as a link does', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);
      const description = screen.getByTestId('resource-card-description');

      fireEvent.click(description, { metaKey: true });
      fireEvent.click(description, { ctrlKey: true });
      fireEvent.click(description, { shiftKey: true });
      fireEvent(description, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
      // A right click opens the context menu, not the page.
      fireEvent(description, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }));

      expect(open).toHaveBeenCalledTimes(4);
      expect(open).toHaveBeenCalledWith(getResourceRoute(ARTICLE.uri), '_blank', 'noopener,noreferrer');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('opens the resource page in a new tab where links may not navigate (the composer)', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(
        <PostPreviewNavigableProvider navigable={false}>
          <ResourceCard card={ARTICLE} href={ARTICLE.uri} />
        </PostPreviewNavigableProvider>,
      );

      fireEvent.click(screen.getByTestId('resource-card-description'));

      expect(open).toHaveBeenCalledWith(getResourceRoute(ARTICLE.uri), '_blank', 'noopener,noreferrer');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('keeps the click on the card, away from the surrounding post', () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const onPostClick = vi.fn();
      render(
        <div onClick={onPostClick} onAuxClick={onPostClick}>
          <ResourceCard card={ARTICLE} href={ARTICLE.uri} />
        </div>,
      );

      fireEvent.click(screen.getByTestId('resource-card-description'));
      fireEvent(
        screen.getByTestId('resource-card-description'),
        new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
      );

      expect(onPostClick).not.toHaveBeenCalled();
    });

    it('leaves the title link, the source link and the actions to themselves', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(
        <ResourceCard
          card={ARTICLE}
          href={ARTICLE.uri}
          actions={
            <div data-resource-controls data-testid="actions">
              <span data-testid="actions-gap">gap</span>
              <button type="button">Act</button>
            </div>
          }
        />,
      );

      fireEvent.click(title());
      fireEvent.click(source());
      fireEvent.click(screen.getByRole('button', { name: 'Act' }));
      fireEvent.click(screen.getByTestId('actions-gap'));

      expect(open).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('keeps Enter and Space on its links and controls away from the surrounding post', () => {
      const onPostKeyDown = vi.fn();
      render(
        <div onKeyDown={onPostKeyDown}>
          <ResourceCard
            card={ARTICLE}
            href={ARTICLE.uri}
            actions={
              <div data-resource-controls>
                <button type="button">Act</button>
              </div>
            }
          />
        </div>,
      );

      fireEvent.keyDown(source(), { key: 'Enter' });
      fireEvent.keyDown(title(), { key: ' ' });
      fireEvent.keyDown(screen.getByRole('button', { name: 'Act' }), { key: 'Enter' });
      expect(onPostKeyDown).not.toHaveBeenCalled();

      // Any other key (list navigation, Escape) still bubbles.
      fireEvent.keyDown(source(), { key: 'Escape' });
      expect(onPostKeyDown).toHaveBeenCalledTimes(1);
    });

    it('shows the pointer over its header and body only, not over its actions', () => {
      render(
        <ResourceCard
          card={ARTICLE}
          href={ARTICLE.uri}
          actions={<div data-resource-controls data-testid="actions" />}
        />,
      );

      expect(card()).not.toHaveClass('cursor-pointer');
      expect(card().firstElementChild).toHaveClass('cursor-pointer');
      expect(screen.getByTestId('actions')).not.toHaveClass('cursor-pointer');
    });

    it('renders its actions inside the frame, after the body', () => {
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} actions={<div data-testid="actions" />} />);

      expect(within(card()).getByTestId('actions')).toBeInTheDocument();
      expect(card().lastElementChild).toBe(screen.getByTestId('actions'));
      // Header and body, then the bottom zone, with no divider between them (as on a post).
      expect(card()).not.toHaveClass('divide-y');
      expect(card().children).toHaveLength(2);
    });

    it('opens the resource page whatever its ⋯ menu lists (Also on): only the source opens the link', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(
        <ResourceCard
          card={videoFixture}
          href={videoFixture.uri}
          actions={<div data-resource-controls data-testid="actions" />}
        />,
      );

      fireEvent.click(screen.getByTestId('resource-card-description'));

      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(videoFixture.uri));
      expect(open).not.toHaveBeenCalled();
      expect(card().firstElementChild).toHaveClass('cursor-pointer');
      expect(title()).toHaveAttribute('href', getResourceRoute(videoFixture.uri));
      expect(source()).toHaveAttribute('href', videoFixture.uri);
      expect(source()).toHaveAttribute('target', '_blank');
    });

    it('opens the resource page of a resource without a web link too', () => {
      render(<ResourceCard card={{ ...bookFixture, open_in: [] }} />);

      fireEvent.click(card().firstElementChild as HTMLElement);

      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(bookFixture.uri));
      expect(card().firstElementChild).toHaveClass('cursor-pointer');
    });
  });

  describe('anatomy', () => {
    it('shows the type in words, the source, title, description and image', () => {
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      expect(card()).toHaveAttribute('data-status', PinakesStatus.OK);
      expect(screen.getByTestId('resource-card-type')).toHaveTextContent('Article');
      expect(source()).toHaveTextContent('Wikipedia (en)');
      expect(title()).toHaveTextContent('Bitcoin');
      expect(screen.getByTestId('resource-card-description').textContent).toMatch(
        /^Bitcoin is the first decentralized/,
      );
      // A Wikimedia file is shown without a credit too.
      expect(cardImage()).toHaveAttribute('src', ARTICLE.image);
      expect(screen.queryByTestId('resource-card-type-tile')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-status')).not.toBeInTheDocument();
    });

    it.each<[string, Partial<TPinakesResourceDetail>, string | null, string | null]>([
      ['its credit', { credits: mbGroupEnrichedFixture.credits }, 'Wikimedia Commons', null],
      ['the card’s own attribution', { credits: [], attribution: 'Grayliptrot, public domain' }, null, 'Grayliptrot'],
      ['no credit', { credits: [], attribution: '© OpenStreetMap contributors (ODbL)' }, null, null],
    ])('shows a Wikimedia image with %s', (_, extra, creditLine, attribution) => {
      render(<ResourceCard card={{ ...ARTICLE, ...extra }} href={ARTICLE.uri} />);

      expect(cardImage()).toHaveAttribute('src', ARTICLE.image);
      if (creditLine) expect(screen.getByTestId('resource-credits')).toHaveTextContent(creditLine);
      else expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
      if (attribution) expect(screen.getByTestId('resource-card-attribution')).toHaveTextContent(attribution);
      else expect(screen.queryByTestId('resource-card-attribution')).not.toBeInTheDocument();
    });

    it('links the title to the resource’s page and the source to the post’s link in a new tab', () => {
      const href = 'https://en.m.wikipedia.org/wiki/Bitcoin';
      render(<ResourceCard card={ARTICLE} href={href} />);

      expect(card()).toHaveAttribute('data-size', 'default');
      expect(title().tagName).toBe('A');
      expect(title()).toHaveAttribute('href', '/resource?uri=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FBitcoin');
      expect(title()).not.toHaveAttribute('target');
      expect(source().tagName).toBe('A');
      expect(source()).toHaveAttribute('href', href);
      expect(source()).toHaveAttribute('target', '_blank');
      expect(source()).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('links the title to the resource page in a new tab where links may not navigate (the composer, a quoted post in a dialog)', () => {
      const href = 'https://en.m.wikipedia.org/wiki/Bitcoin';
      render(
        <PostPreviewNavigableProvider navigable={false}>
          <ResourceCard card={ARTICLE} href={href} />
        </PostPreviewNavigableProvider>,
      );

      expect(title()).toHaveAttribute('href', getResourceRoute(ARTICLE.uri));
      expect(title()).toHaveAttribute('target', '_blank');
      expect(title()).toHaveAttribute('rel', 'noopener noreferrer');
      // The site link still opens the link as written, in a new tab.
      expect(source()).toHaveAttribute('href', href);
      expect(source()).toHaveAttribute('target', '_blank');
    });

    it('takes the favicon from the card’s own site when the post uses another host', () => {
      render(<ResourceCard card={ARTICLE} href="https://en.m.wikipedia.org/wiki/Bitcoin" />);

      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        expect.stringMatching(/\/api\/favicon\?host=en\.wikipedia\.org$/),
      );
    });

    it('links the source to the card’s own link without a post link', () => {
      render(<ResourceCard card={ARTICLE} />);

      expect(source()).toHaveAttribute('href', ARTICLE.uri);
    });

    it('shows the site’s favicon, then its parent domain’s, and a globe when both fail to load', () => {
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      const favicon = screen.getByTestId('resource-source-favicon');
      expect(favicon).toHaveAttribute('src', expect.stringMatching(/\/api\/favicon\?host=en\.wikipedia\.org$/));
      fireEvent.error(favicon);
      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        expect.stringMatching(/\/api\/favicon\?host=wikipedia\.org$/),
      );
      fireEvent.error(screen.getByTestId('resource-source-favicon'));

      expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
      expect(source().querySelector('svg')).toHaveClass('lucide-globe');
    });

    it('shows the type’s icon in place of an image that fails to load', () => {
      render(<ResourceCard card={musicRecordingFixture} href={musicRecordingFixture.uri} />);

      fireEvent.error(cardImage());

      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card-type-tile').querySelector('svg')).toHaveClass('lucide-music');
    });

    it.each([
      ['a video', videoFixture],
      ['a video page', VIDEO_PAGE],
    ])(
      'shows the image of %s with a player under the text as a post shows its one image, where the player stands',
      (_, fixture) => {
        render(<ResourceCard card={fixture} href={fixture.uri} />);

        const slot = screen.getByTestId('resource-card-image');
        expect(title().compareDocumentPosition(slot)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(slot).toContainElement(screen.getByRole('button', { name: fixture.name! }));
        expect(cardImage()).toHaveAttribute('data-cy', 'post-attachment-image');
        expect(cardImage()).toHaveAccessibleName(fixture.name!);
        expect(screen.queryByTestId('resource-card-type-tile')).not.toBeInTheDocument();
      },
    );

    it.each([
      ['video', videoFixture],
      ['video page', VIDEO_PAGE],
    ])('shows a %s’s image whole, in its own shape', (_, fixture) => {
      render(<ResourceCard card={fixture} href={fixture.uri} />);

      expect(cardImage()).toHaveClass('object-contain', 'max-h-96');
      expect(cardImage()).not.toHaveClass('object-cover');
    });

    it('shows a video post’s still under the text, where its post stands', () => {
      const post: TPinakesResourceDetail = {
        ...VIDEO_PAGE,
        uri: 'https://x.com/a/status/1',
        embed: {
          provider: 'x',
          kind: 'post',
          src: 'https://platform.twitter.com/embed/Tweet.html?id=1&dnt=true',
          height: null,
          aspect: null,
          allow: [],
          autoplay_param: null,
        },
      };
      render(<ResourceCard card={post} href={post.uri} />);

      expect(title().compareDocumentPosition(screen.getByTestId('resource-card-image'))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(screen.getByTestId('resource-card-image-fit')).toBeInTheDocument();
    });

    it('falls back to the type tile when the large image fails to load', () => {
      render(<ResourceCard card={VIDEO_PAGE} href={VIDEO_PAGE.uri} />);
      expect(screen.getByTestId('resource-card-image-fit')).toBeInTheDocument();

      // Its one image fails, with no group or preview image to take its place.
      fireEvent.error(cardImage());

      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card-type-tile')).toBeInTheDocument();
    });

    describe('the small image beside the text', () => {
      const ALBUM: TPinakesResourceDetail = { ...mbReleaseGroupFixture, image: 'https://coverartarchive.org/a.jpg' };
      const PLAYLIST: TPinakesResourceDetail = {
        ...musicRecordingFixture,
        type: 'MusicPlaylist',
        type_path: ['Thing', 'CreativeWork', 'MusicPlaylist'],
      };

      it.each([
        ['song', musicRecordingFixture],
        ['album', ALBUM],
        ['playlist', PLAYLIST],
        ['article', ARTICLE],
        ['artist', mbGroupEnrichedFixture],
        ['event', eventFixture],
      ])('shows a %s’s image small, left of the title', (_, fixture) => {
        render(<ResourceCard card={fixture} href={fixture.uri} />);

        const slot = screen.getByTestId('resource-card-image');
        expect(slot.compareDocumentPosition(title())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(slot).toHaveClass('shrink-0', 'self-start');
        expect(slot).toHaveAttribute('data-resource-controls');
        expect(slot).toHaveAttribute('data-shape', 'square');
        expect(cardImage()).toHaveAttribute('src', fixture.image);
        expect(cardImage()).toHaveClass('size-20', 'sm:size-24', 'object-cover');
        expect(cardImage()).not.toHaveClass('max-h-96');
        expect(cardImage()).toHaveAccessibleName(fixture.name!);
        const trigger = screen.getByRole('button', { name: fixture.name! });
        expect(slot).toContainElement(trigger);
        // The lightbox's own trigger, as on a post's image: a screen reader hears that it opens a dialog.
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByTestId('resource-card-image-fit')).not.toBeInTheDocument();
        expect(screen.queryByTestId('resource-card-type-tile')).not.toBeInTheDocument();
      });

      it.each([
        ['an album', ALBUM, ['size-24', 'sm:size-40']],
        ['a film', movieFixture, ['aspect-video', 'w-40', 'sm:w-64']],
      ])('shows a larger image of %s on the resource page’s card', (_, fixture, classes) => {
        render(<ResourceCard card={fixture} size="large" />);

        expect(cardImage()).toHaveClass(...classes);
      });

      it.each([
        ['a film with no player', movieFixture],
        ['a video with no player', { ...videoFixture, embed: null, also_on: [] }],
      ])('shows the image of %s small, as a 16:9 thumbnail before it loads', (_, fixture) => {
        render(<ResourceCard card={fixture} href={fixture.uri} />);

        const slot = screen.getByTestId('resource-card-image');
        expect(slot.compareDocumentPosition(title())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(slot).toHaveAttribute('data-shape', 'wide');
        expect(cardImage()).toHaveClass('aspect-video', 'w-28', 'sm:w-40', 'object-cover');
        expect(screen.queryByTestId('resource-card-image-fit')).not.toBeInTheDocument();
      });

      it('shows an upright image square once it has loaded, whatever the type says', () => {
        render(<ResourceCard card={movieFixture} href={movieFixture.uri} />);
        Object.defineProperty(cardImage(), 'naturalWidth', { value: 600 });
        Object.defineProperty(cardImage(), 'naturalHeight', { value: 900 });

        fireEvent.load(cardImage());

        expect(screen.getByTestId('resource-card-image')).toHaveAttribute('data-shape', 'square');
        expect(cardImage()).toHaveClass('size-20', 'sm:size-24');
      });

      it.each([
        ['film', movieFixture, 'wide'],
        ['article', ARTICLE, 'square'],
      ])('keeps a %s’s shape by type for an image between square and wide', (_, fixture, shape) => {
        render(<ResourceCard card={fixture} href={fixture.uri} />);
        Object.defineProperty(cardImage(), 'naturalWidth', { value: 1200 });
        Object.defineProperty(cardImage(), 'naturalHeight', { value: 1000 });

        fireEvent.load(cardImage());

        expect(screen.getByTestId('resource-card-image')).toHaveAttribute('data-shape', shape);
      });

      it('starts the next image in the type’s shape again, not in the last image’s', () => {
        const { rerender } = render(<ResourceCard card={movieFixture} href={movieFixture.uri} />);
        Object.defineProperty(cardImage(), 'naturalWidth', { value: 600 });
        Object.defineProperty(cardImage(), 'naturalHeight', { value: 900 });
        fireEvent.load(cardImage());
        expect(screen.getByTestId('resource-card-image')).toHaveAttribute('data-shape', 'square');

        rerender(
          <ResourceCard card={{ ...movieFixture, image: 'https://example.org/still.jpg' }} href={movieFixture.uri} />,
        );

        expect(screen.getByTestId('resource-card-image')).toHaveAttribute('data-shape', 'wide');
      });

      it('opens the cover in the post’s lightbox on a tap, while the rest of the card opens the page', async () => {
        const onPostClick = vi.fn();
        render(
          <div onClick={onPostClick}>
            <ResourceCard card={ALBUM} href={ALBUM.uri} />
          </div>,
        );
        const open = vi.spyOn(window, 'open').mockReturnValue(null);
        fireEvent.click(screen.getByTestId('resource-card-type'));
        expect(mockPush).toHaveBeenCalledWith(getResourceRoute(ALBUM.uri));
        mockPush.mockClear();
        onPostClick.mockClear();
        const slot = screen.getByTestId('resource-card-image');
        const trigger = screen.getByRole('button', { name: ALBUM.name! });
        const focus = vi.spyOn(trigger, 'focus');

        // A middle click on the cover opens nothing.
        fireEvent(cardImage(), new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
        expect(open).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();

        fireEvent.click(cardImage());

        const lightbox = await screen.findByRole('dialog');
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(within(lightbox).getByTestId('carousel-image-zoom-frame')).toHaveAttribute('data-zoomed', 'false');
        const lightboxImage = within(lightbox)
          .getAllByRole('img')
          .find((img) => img.getAttribute('src') === ALBUM.image);
        expect(lightboxImage).toBeDefined();
        expect(mockPush).not.toHaveBeenCalled();
        expect(onPostClick).not.toHaveBeenCalled();

        // The lightbox's image is the cover's in React only: its load or failure leaves the cover as it is.
        Object.defineProperty(lightboxImage!, 'naturalWidth', { value: 1200 });
        Object.defineProperty(lightboxImage!, 'naturalHeight', { value: 630 });
        fireEvent.load(lightboxImage!);
        fireEvent.error(lightboxImage!);
        expect(screen.getByTestId('resource-card-image')).toBe(slot);
        expect(slot).toHaveAttribute('data-shape', 'square');
        expect(screen.queryByTestId('resource-card-type-tile')).not.toBeInTheDocument();

        // Closing gives the focus back to the cover, without scrolling the feed.
        fireEvent.keyDown(lightbox, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
        expect(mockPush).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
      });

      it('shows a wide cover as a 16:9 thumbnail once it has loaded', async () => {
        render(<ResourceCard card={musicRecordingFixture} href={musicRecordingFixture.uri} />);
        Object.defineProperty(cardImage(), 'naturalWidth', { value: 1200 });
        Object.defineProperty(cardImage(), 'naturalHeight', { value: 630 });

        fireEvent.load(cardImage());

        expect(screen.getByTestId('resource-card-image')).toHaveAttribute('data-shape', 'wide');
        expect(cardImage()).toHaveClass('aspect-video', 'w-28');
        expect(cardImage()).not.toHaveClass('size-20');
      });

      it('falls back to the type tile when the cover fails, and dims a gone one', () => {
        const { unmount } = render(<ResourceCard card={{ ...ALBUM, status: PinakesStatus.MISSING }} />);
        expect(screen.getByTestId('resource-card-image')).toHaveClass('opacity-60');
        unmount();

        render(<ResourceCard card={ALBUM} href={ALBUM.uri} />);
        fireEvent.error(cardImage());
        expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
        expect(screen.getByTestId('resource-card-type-tile')).toBeInTheDocument();
      });
    });

    it('opens the image in the post’s lightbox on a tap, never the resource page', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const onPostClick = vi.fn();
      render(
        <div onClick={onPostClick}>
          <ResourceCard card={VIDEO_PAGE} href={ARTICLE.uri} />
        </div>,
      );
      const slot = screen.getByTestId('resource-card-image');
      const fit = screen.getByTestId('resource-card-image-fit');
      expect(fit).toHaveAttribute('data-resource-controls');

      // In the image's box around the picture, and a middle click on it, open nothing either.
      fireEvent.click(fit);
      fireEvent(cardImage(), new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
      expect(mockPush).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();

      fireEvent.click(cardImage());

      const lightbox = await screen.findByRole('dialog');
      expect(within(lightbox).getByTestId('carousel-image-zoom-frame')).toHaveAttribute('data-zoomed', 'false');
      expect(
        within(lightbox)
          .getAllByRole('img')
          .map((img) => img.getAttribute('src')),
      ).toContain(ARTICLE.image);
      fireEvent.click(lightbox);
      // The lightbox's images are the card's in React only: one failing there leaves the card's image as it is.
      fireEvent.error(within(lightbox).getAllByRole('img')[0]);
      expect(screen.getByTestId('resource-card-image')).toBe(slot);
      expect(screen.queryByTestId('resource-card-type-tile')).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(onPostClick).not.toHaveBeenCalled();
      expect(card()).toHaveAttribute('data-click-through', 'true');
    });

    it('opens the lightbox where links may not navigate too, as a post’s image does', async () => {
      render(
        <PostPreviewNavigableProvider navigable={false}>
          <ResourceCard card={VIDEO_PAGE} href={ARTICLE.uri} />
        </PostPreviewNavigableProvider>,
      );

      fireEvent.click(cardImage());

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it.each([
      [64, '64px'],
      [1200, '1200px'],
    ])('never shows an image %ipx wide larger than it is, nor wider than a post’s media', (width, maxWidth) => {
      render(<ResourceCard card={VIDEO_PAGE} href={ARTICLE.uri} />);
      const fit = screen.getByTestId('resource-card-image-fit');
      expect(fit.style.maxWidth).toBe('');
      Object.defineProperty(cardImage(), 'naturalWidth', { value: width });

      fireEvent.load(cardImage());

      expect(fit.style.maxWidth).toBe(maxWidth);
      expect(fit).toHaveClass('mx-auto');
      expect(screen.getByTestId('resource-card-image')).toHaveClass('max-w-2xl');
      expect(screen.getByTestId('resource-card-image').style.maxWidth).toBe('');
      // Beside a narrow image is the card's surface: it opens the resource page.
      fireEvent.click(screen.getByTestId('resource-card-image'));
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(ARTICLE.uri));
    });

    it('takes no size from the lightbox’s images', async () => {
      render(<ResourceCard card={VIDEO_PAGE} href={ARTICLE.uri} />);
      fireEvent.click(cardImage());
      const lightboxImage = within(await screen.findByRole('dialog')).getAllByRole('img')[0];
      Object.defineProperty(lightboxImage, 'naturalWidth', { value: 64 });

      fireEvent.load(lightboxImage);

      expect(screen.getByTestId('resource-card-image-fit').style.maxWidth).toBe('');
    });

    it('gives the image’s place to a player or embed that stands in the body', () => {
      const wrap = (body: React.ReactNode) => <div data-testid="wrapped">{body}</div>;
      const { rerender } = render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} renderBody={wrap} />);
      expect(screen.getByTestId('wrapped')).toContainElement(screen.getByTestId('resource-card-image'));

      rerender(
        <ResourceCard
          card={ARTICLE}
          href={ARTICLE.uri}
          renderBody={() => <div data-testid="player" />}
          isBodyReplaced
        />,
      );

      expect(screen.getByTestId('player')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
    });

    it('dims the image of an object that is gone', () => {
      render(<ResourceCard card={{ ...missingFixture, image: ARTICLE.image }} />);

      expect(screen.getByTestId('resource-card-image')).toHaveClass('opacity-60');
    });

    it('names the source by the card’s own host when the card has no site', () => {
      render(<ResourceCard card={{ ...ARTICLE, site: null }} href="https://en.m.wikipedia.org/wiki/Bitcoin" />);

      expect(source()).toHaveTextContent('en.wikipedia.org');
    });

    it('names the source by the post link’s host when the card has no site and no web link', () => {
      render(<ResourceCard card={{ ...bookFixture, site: null }} href="https://www.example.org/a" />);

      expect(source()).toHaveTextContent('example.org');
    });
  });

  describe('families', () => {
    it('shows when an event happens, in its own time zone, and its venue', () => {
      render(<ResourceCard card={eventFixture} href={eventFixture.uri} />);

      expect(card()).toHaveAttribute('data-family', ResourceFamily.EVENT);
      expect(screen.getByTestId('resource-card-type')).toHaveTextContent('Event');
      expect(screen.getByTestId('resource-card-dates').textContent).toMatch(/2026.*CDT/);
      expect(screen.getByTestId('resource-card-venue')).toHaveTextContent('Hilton Austin');
      expect(screen.queryByTestId('resource-card-point')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-event-status')).not.toBeInTheDocument();
    });

    it('shows an event’s point when it has no venue name', () => {
      render(<ResourceCard card={{ ...eventFixture, venue: null }} href={eventFixture.uri} />);

      expect(screen.getByTestId('resource-card-point')).toHaveTextContent('30.2652, -97.7381');
      expect(screen.queryByTestId('resource-card-venue')).not.toBeInTheDocument();
    });

    it('says when an event is not going ahead as scheduled', () => {
      render(<ResourceCard card={{ ...eventFixture, event_status: 'cancelled' }} href={eventFixture.uri} />);

      expect(screen.getByTestId('resource-card-event-status')).toHaveTextContent('Cancelled');
    });

    it('shows where a place is, without OpenStreetMap’s credit: its page names it under Sources', () => {
      render(<ResourceCard card={placeFixture} href={placeFixture.uri} />);

      expect(card()).toHaveAttribute('data-family', ResourceFamily.PLACE);
      expect(screen.getByTestId('resource-card-type')).toHaveTextContent('City');
      // A city's address is its country; no raw coordinates when the card says where it is.
      expect(screen.getByTestId('resource-card-summary')).toHaveTextContent('Germany');
      expect(screen.queryByTestId('resource-card-point')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-attribution')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
      expect(card()).not.toHaveTextContent('ODbL');
      expect(screen.queryByTestId('resource-card-dates')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card-type-tile').querySelector('svg')).toHaveClass('lucide-map-pin');
    });

    it('names OpenStreetMap once under Sources on the page of a place or of an event placed from its data', () => {
      const zone = 'Timezone Boundary Builder / OpenStreetMap contributors (ODbL-1.0), tzf-rel 2025c';
      for (const attribution of [placeFixture.attribution, `${placeFixture.attribution}; ${zone}`, zone]) {
        const { unmount } = render(<ResourceCard card={{ ...placeFixture, attribution }} size="large" />);

        expect(screen.queryByTestId('resource-card-attribution')).not.toBeInTheDocument();
        const sources = within(screen.getByRole('region', { name: 'Sources' }));
        expect(sources.getAllByRole('listitem').map((line) => line.textContent)).toEqual(['Map data: OpenStreetMap']);
        expect(sources.getByTestId('resource-credit-source')).toHaveAttribute(
          'href',
          'https://www.openstreetmap.org/copyright',
        );
        unmount();
      }
    });

    it('keeps a credit other than OpenStreetMap’s on the card, with no map data under Sources', () => {
      const fedlex = 'Source: Fedlex, www.fedlex.admin.ch';
      render(<ResourceCard card={{ ...ARTICLE, credits: [], attribution: fedlex }} size="large" />);

      expect(screen.getByTestId('resource-card-attribution').textContent).toBe(fedlex);
      expect(screen.queryByRole('region', { name: 'Sources' })).not.toBeInTheDocument();
    });

    it('keeps only the other source’s credit on a feed card whose attribution also credits OpenStreetMap', () => {
      const fedlex = 'Source: Fedlex, www.fedlex.admin.ch';
      const attribution = `${fedlex}; ${placeFixture.attribution}`;
      render(<ResourceCard card={{ ...ARTICLE, credits: [], attribution }} href={ARTICLE.uri} />);

      expect(screen.getByTestId('resource-card-attribution').textContent).toBe(fedlex);
      expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
    });

    it('shows a place’s address instead of its coordinates', () => {
      const cafe = {
        ...placeFixture,
        type: 'CafeOrCoffeeShop',
        type_path: ['Thing', 'Organization', 'Place', 'LocalBusiness', 'FoodEstablishment', 'CafeOrCoffeeShop'],
        name: 'Henrici',
        address: {
          street: 'Niederdorfstrasse',
          house_number: '1',
          postcode: '8001',
          city: 'Zürich',
          country_code: 'ch',
        },
        category: 'amenity/cafe',
      };
      render(<ResourceCard card={cafe} href={placeFixture.uri} />);

      expect(screen.getByTestId('resource-card-summary').textContent).toMatch(
        /^Niederdorfstrasse 1, 8001 Zürich, Switzerland$/,
      );
      expect(screen.queryByTestId('resource-card-point')).not.toBeInTheDocument();
    });

    it('shows a place’s point when it has no address', () => {
      render(<ResourceCard card={{ ...placeFixture, address: null }} href={placeFixture.uri} />);

      expect(screen.getByTestId('resource-card-point')).toHaveTextContent('52.5174, 13.3951');
    });

    it('leads an event with its dates, then the venue, the organizer and whether it is online', () => {
      render(<ResourceCard card={{ ...eventFixture, attendance: 'online' }} href={eventFixture.uri} />);

      const dates = screen.getByTestId('resource-card-dates');
      const description = screen.getByTestId('resource-card-description');
      expect(dates.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByTestId('resource-card-organizer')).toHaveTextContent(
        'by 2026 Principled Business Summit - Austin',
      );
      expect(within(screen.getByTestId('resource-card-organizer')).getByRole('link')).toHaveAttribute(
        'href',
        eventFixture.organizer?.url,
      );
      expect(screen.getByTestId('resource-card-attendance')).toHaveTextContent('Online');
    });

    it('leaves out an organizer that only repeats the performer, and an in-person event’s chip', () => {
      const concert = {
        ...eventFixture,
        organizer: { name: 'Noah Kahan', url: 'https://www.songkick.com/concerts/1' },
        facts: { performer: 'Noah Kahan' },
      };
      render(<ResourceCard card={concert} href={eventFixture.uri} />);

      expect(screen.queryByTestId('resource-card-organizer')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-attendance')).not.toBeInTheDocument();
    });

    it.each([
      ['video', videoFixture, 'Video', 'YouTube'],
      ['song', musicRecordingFixture, 'Song', 'Spotify'],
      ['scholarly article', scholarlyArticleFixture, 'Scholarly article', 'DOI'],
    ])('shows a %s as a web card', (_name, fixture: TPinakesResourceDetail, typeLabel, site) => {
      render(<ResourceCard card={fixture} href={fixture.uri} />);

      expect(card()).toHaveAttribute('data-family', ResourceFamily.WEB);
      expect(screen.getByTestId('resource-card-type')).toHaveTextContent(typeLabel);
      expect(source()).toHaveTextContent(site);
      expect(title()).toHaveTextContent(fixture.name!);
      expect(screen.queryByTestId('resource-card-dates')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-point')).not.toBeInTheDocument();
    });

    it('ignores event dates on a card outside the event family', () => {
      render(<ResourceCard card={{ ...ARTICLE, start: eventFixture.start }} />);

      expect(screen.queryByTestId('resource-card-dates')).not.toBeInTheDocument();
    });
  });

  describe('audio stream', () => {
    const EPISODE: TPinakesResourceDetail = {
      ...podcastFixture,
      type: 'PodcastEpisode',
      type_path: ['Thing', 'CreativeWork', 'Episode', 'PodcastEpisode'],
      stream: { url: 'https://example.org/episode.mp3', type: 'audio/mpeg', preview: false, duration_s: 2728 },
    };
    const audio = () => screen.queryByTestId('resource-card-audio');

    it('plays an episode’s http(s) audio in the app’s player, loading nothing until played', () => {
      render(<ResourceCard card={EPISODE} href={EPISODE.uri} />);

      // Play beside its length; the card's heading names it, so the row's title is for screen readers.
      expect(within(audio()!).getByRole('button', { name: `Play ${EPISODE.name}` })).toBeInTheDocument();
      expect(audio()).toHaveTextContent('45:28');
      expect(within(audio()!).getByText(EPISODE.name!)).toHaveClass('sr-only');
      expect(audio()!.querySelector('audio, iframe')).toBeNull();
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();

      fireEvent.click(within(audio()!).getByRole('button', { name: `Play ${EPISODE.name}` }));
      expect(screen.getByTestId('resource-player-audio')).toHaveAttribute('src', 'https://example.org/episode.mp3');
      expect(screen.getByTestId('resource-audio-controls')).toBeInTheDocument();
    });

    it('names an episode’s show, linked to the show’s page', () => {
      const show = 'https://feeds.megaphone.fm/darknetdiaries';
      render(
        <ResourceCard
          card={{ ...EPISODE, related: [{ rel: 'show', uri: show, name: 'Darknet Diaries' }] }}
          href={EPISODE.uri}
        />,
      );

      const from = screen.getByTestId('resource-card-show');
      expect(from).toHaveTextContent('From Darknet Diaries');
      expect(within(from).getByRole('link', { name: 'Darknet Diaries' })).toHaveAttribute(
        'href',
        `/resource?uri=${encodeURIComponent(show)}`,
      );
    });

    it('names no show for an episode whose card names none', () => {
      render(<ResourceCard card={EPISODE} href={EPISODE.uri} />);

      expect(screen.queryByTestId('resource-card-show')).not.toBeInTheDocument();
    });

    it('lists a show’s latest episodes, each with its Play for the app’s audio player', () => {
      const episodes = [182, 181, 180, 179].map((n) => ({
        uri: `https://darknetdiaries.com/episode/${n}/`,
        name: `Episode ${n}`,
        guid: `guid-${n}`,
        stream: { url: `https://example.org/ep${n}.mp3`, type: 'audio/mpeg', preview: false },
      }));
      render(<ResourceCard card={{ ...podcastFixture, episodes }} href={podcastFixture.uri} />);

      expect(
        screen.getAllByRole('button', { name: /^Play Episode/ }).map((el) => el.getAttribute('aria-label')),
      ).toEqual(['Play Episode 182', 'Play Episode 181', 'Play Episode 180']);
      expect(screen.getByRole('link', { name: 'All episodes' })).toHaveAttribute(
        'href',
        `/resource?uri=${encodeURIComponent(podcastFixture.uri)}#episodes`,
      );
      // A show has no audio of its own.
      expect(audio()).not.toBeInTheDocument();
    });

    it('lists no episodes for a show without any', () => {
      render(<ResourceCard card={podcastFixture} href={podcastFixture.uri} />);

      expect(screen.queryByTestId('resource-card-episodes')).not.toBeInTheDocument();
    });

    it('plays a recording’s public preview too, and says it is one', () => {
      const stream = { url: 'https://example.org/preview.m4a', type: 'audio/mp4', preview: true };
      render(<ResourceCard card={{ ...musicRecordingFixture, stream }} />);

      expect(audio()).toHaveAttribute('src', stream.url);
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it.each([
      ['a non-http(s) link', { url: 'javascript:alert(1)', type: 'audio/mpeg' }],
      ['a video', { url: 'https://example.org/episode.mp4', type: 'video/mp4' }],
    ])('plays no %s', (_, stream) => {
      render(<ResourceCard card={{ ...EPISODE, stream: { ...stream, preview: false } }} />);

      expect(audio()).not.toBeInTheDocument();
    });

    it('keeps a click on the player from opening the card’s link', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={EPISODE} href={EPISODE.uri} />);
      expect(card()).toHaveAttribute('data-click-through', 'true');

      fireEvent.click(audio()!);

      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('links that are not web pages', () => {
    it('links an isbn: card without a post link only to its page, with a book icon', () => {
      render(<ResourceCard card={bookFixture} />);

      expect(title()).toHaveTextContent('Fantastic Mr. Fox');
      expect(screen.getAllByRole('link')).toEqual([title()]);
      expect(title()).toHaveAttribute('href', '/resource?uri=isbn%3A9780140328721');
      expect(screen.getByTestId('resource-card-source').querySelector('svg')).toHaveClass('lucide-book-open');
      expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
    });

    it('links an isbn: card to the web link the post used', () => {
      const href = 'https://openlibrary.org/isbn/9780140328721';
      render(<ResourceCard card={bookFixture} href={href} />);

      expect(source()).toHaveAttribute('href', href);
      expect(source()).toHaveTextContent('openlibrary.org');
      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        expect.stringMatching(/\/api\/favicon\?host=openlibrary\.org$/),
      );
    });

    it('links a btc: card without a post link to the web link people wrote for it', () => {
      const block = {
        ...ARTICLE,
        uri: 'btc:block/0000000000000000000029eb73ea7fbb1e1706781d5db0259f0c3df42f26614a',
        type: 'BitcoinBlock',
        type_path: ['Thing', 'BitcoinBlock'],
        site: 'mempool.space',
        image: null,
        refs: ['https://mempool.space/block/0000000000000000000029eb73ea7fbb1e1706781d5db0259f0c3df42f26614a'],
        aliases: ['https://mempool.space/block/0000000000000000000029eb73ea7fbb1e1706781d5db0259f0c3df42f26614a'],
      };
      render(<ResourceCard card={block} />);

      expect(source()).toHaveAttribute('href', block.refs[0]);
      expect(source()).toHaveTextContent('mempool.space');
      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        expect.stringMatching(/\/api\/favicon\?host=mempool\.space$/),
      );
    });

    it.each(['default', 'large'] as const)(
      'links a %s btc: card read on demand (no web link written) to the page Pinakes opens it in',
      (size) => {
        const hash = '0000000000000000002dc2b16821a39010c212e2d84ee1fe7b2115f345df2696';
        const page = `https://mempool.space/block/${hash}`;
        const block = {
          ...ARTICLE,
          uri: `btc:block/${hash}`,
          type: 'BitcoinBlock',
          type_path: ['Thing', 'BitcoinBlock'],
          site: 'mempool.space',
          image: null,
          refs: [],
          aliases: [],
          open_in: [{ client: 'mempool.space', url: page }],
        };
        render(<ResourceCard card={block} size={size} />);

        // "mempool.space ↗", a link out, named by what it does, with mempool's own icon.
        expect(source().tagName).toBe('A');
        expect(source()).toHaveAttribute('href', page);
        expect(source()).toHaveAttribute('target', '_blank');
        expect(source()).toHaveTextContent('mempool.space');
        expect(source().querySelector('svg.lucide-arrow-up-right')).not.toBeNull();
        expect(source()).toHaveAccessibleName('Open in mempool.space');
        expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
          'src',
          expect.stringMatching(/\/api\/favicon\?host=mempool\.space$/),
        );
      },
    );

    it('opens a pubky:// card at the address Pinakes gives for it, and hides its pubky:// image', () => {
      render(<ResourceCard card={pubkyFixture} />);

      expect(source()).toHaveAttribute('href', pubkyFixture.open_in[0].url);
      expect(title()).toHaveAttribute('href', getResourceRoute(pubkyFixture.uri));
      expect(source()).toHaveTextContent('loopky');
      expect(screen.getByTestId('resource-card-type')).toHaveTextContent('Learning resource');
      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
    });

    it('never links or loads an unsafe scheme', () => {
      const unsafe = {
        ...ARTICLE,
        uri: 'javascript:alert(1)',
        image: 'javascript:alert(2)',
        refs: ['javascript:alert(4)'],
        open_in: [{ client: 'x', url: 'data:text/html,<b>x</b>' }],
      };
      render(<ResourceCard card={unsafe} href="javascript:alert(3)" />);

      // The one link is the app's own page for it, the URI only as an encoded query value.
      expect(screen.getAllByRole('link')).toEqual([title()]);
      expect(title()).toHaveAttribute('href', '/resource?uri=javascript%3Aalert%281%29');
      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
    });

    it('renders markup in text fields as text', () => {
      render(<ResourceCard card={{ ...ARTICLE, name: '<img src=x onerror=alert(1)>', description: '<b>bold</b>' }} />);

      expect(title()).toHaveTextContent('<img src=x onerror=alert(1)>');
      expect(screen.getByTestId('resource-card-description')).toHaveTextContent('<b>bold</b>');
      expect(card().querySelector('b')).toBeNull();
    });
  });

  describe('status', () => {
    it('says a missing object is gone and titles the card with its link', () => {
      render(<ResourceCard card={missingFixture} href={missingFixture.uri} />);

      expect(card()).toHaveAttribute('data-status', PinakesStatus.MISSING);
      expect(screen.getByTestId('resource-card-status')).toHaveTextContent('No longer available at the source');
      expect(title()).toHaveTextContent('music.apple.com/song/1440717826');
      expect(source()).toHaveTextContent('Apple Music');
    });

    it('says an unreachable source could not be reached', () => {
      render(<ResourceCard card={unreachableFixture} href={unreachableFixture.uri} />);

      expect(card()).toHaveAttribute('data-status', PinakesStatus.UNREACHABLE);
      expect(screen.getByTestId('resource-card-status')).toHaveTextContent('The source could not be reached');
      expect(title()).toHaveTextContent('binance.com/');
    });

    it('says a pending card has not been read yet', () => {
      render(<ResourceCard card={{ ...ARTICLE, status: PinakesStatus.PENDING }} />);

      expect(screen.getByTestId('resource-card-status')).toHaveTextContent('Details are still being read');
      expect(title()).toHaveTextContent('Bitcoin');
    });

    it.each([PinakesStatus.ERROR, 'archived'])('says the details could not be read for status %s', (status) => {
      render(<ResourceCard card={{ ...ARTICLE, status }} />);

      expect(card()).toHaveAttribute('data-status', PinakesStatus.ERROR);
      expect(within(screen.getByTestId('resource-card-status')).getByText('Details could not be read')).toBeVisible();
    });
  });

  describe('large', () => {
    it('heads the resource page: its title is a heading, "Open in <site>" its one link out, and it is no click-through', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={videoFixture} size="large" />);

      expect(card()).toHaveAttribute('data-size', 'large');
      // Where a post stands on its page: the post card's surface; the page's own heading is the `h1`.
      expect(card()).toHaveClass('bg-card');
      expect(card()).not.toHaveClass('bg-embed');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(videoFixture.name);
      expect(title()).not.toHaveAttribute('href');
      expect(source()).toHaveAttribute('href', videoFixture.uri);
      expect(source()).toHaveAttribute('target', '_blank');
      expect(source().textContent).toBe('YouTube');
      expect(source()).toHaveAccessibleName('Open in YouTube');

      fireEvent.click(screen.getByTestId('resource-card-description'));
      expect(open).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(card()).not.toHaveAttribute('data-click-through');
    });

    it('shows the whole description, clamped on a phone until “More”', () => {
      render(<ResourceCard card={ARTICLE} size="large" />);

      const description = screen.getByTestId('resource-card-description');
      expect(description).not.toHaveClass('line-clamp-2');
      expect(description).toHaveClass('max-sm:line-clamp-6');
      const more = screen.getByTestId('resource-card-more');
      expect(more).toHaveAttribute('aria-expanded', 'false');
      expect(more).toHaveAttribute('aria-controls', description.id);
      fireEvent.click(more);
      expect(screen.getByTestId('resource-card-description')).not.toHaveClass('max-sm:line-clamp-6');
      expect(more).toHaveTextContent('Less');
      expect(more).toHaveAttribute('aria-expanded', 'true');
    });

    it('lists every fact under “Details”, known ones formatted, unknown ones in words, ids left out', () => {
      const song = {
        ...musicRecordingFixture,
        facts: { duration: '369', isrc: 'USQX91300108', mbid: '833f00e1', some_new_fact: 'value' },
      };
      render(<ResourceCard card={song} size="large" />);

      expect(screen.getByRole('region', { name: 'Details' })).toBeInTheDocument();
      expect(screen.getAllByTestId('resource-fact').map((row) => row.textContent)).toEqual([
        'Duration6:09',
        'ISRCUSQX91300108',
        'Some new factvalue',
      ]);
    });

    it('says in one plain line under “Details” that the site shared nothing, in place of a raw `blocked` row', () => {
      render(<ResourceCard card={instagramBlockedFixture} size="large" />);

      const details = screen.getByRole('region', { name: 'Details' });
      expect(within(details).getByTestId('resource-facts-note')).toHaveTextContent(
        "instagram.com didn't share this post's details.",
      );
      expect(screen.queryAllByTestId('resource-fact')).toHaveLength(0);
      expect(details.textContent).not.toMatch(/blocked|true/i);
      // Its title as Pinakes names it; Pinakes' "Blocked by the site." is not shown as a description: the
      // line in Details says it.
      expect(title()).toHaveTextContent('Post on instagram.com');
      expect(screen.queryByTestId('resource-card-description')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card').textContent).not.toContain('Blocked by the site.');
    });

    it('keeps the line beside the other facts, and lists a card that was read as before', () => {
      const { unmount } = render(
        <ResourceCard
          card={{ ...instagramBlockedFixture, facts: { blocked: 'true', handle: 'someone' } }}
          size="large"
        />,
      );
      expect(screen.getByTestId('resource-facts-note')).toBeInTheDocument();
      expect(screen.getAllByTestId('resource-fact').map((row) => row.textContent)).toEqual(['Handlesomeone']);
      unmount();

      render(<ResourceCard card={{ ...instagramBlockedFixture, facts: { handle: 'someone' } }} size="large" />);
      expect(screen.queryByTestId('resource-facts-note')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('resource-fact').map((row) => row.textContent)).toEqual(['Handlesomeone']);
    });

    it('titles a card without a web link as text', () => {
      render(<ResourceCard card={bookFixture} size="large" />);

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Fantastic Mr. Fox');
      expect(title().tagName).toBe('SPAN');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('does not send the card, its source or its heading to a link that is gone upstream', () => {
      const { unmount } = render(<ResourceCard card={missingFixture} href={missingFixture.uri} />);
      expect(source().tagName).toBe('SPAN');
      // The card, like its title, opens the resource's page (which says it is gone).
      fireEvent.click(card().firstElementChild as HTMLElement);
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(missingFixture.uri));
      unmount();

      // Its title still opens the resource's page (which says it is gone), never the link.
      const { unmount: unmountQuoted } = render(
        <PostPreviewNavigableProvider navigable={false}>
          <ResourceCard card={missingFixture} href={missingFixture.uri} />
        </PostPreviewNavigableProvider>,
      );
      expect(title()).toHaveAttribute('href', getResourceRoute(missingFixture.uri));
      unmountQuoted();

      render(<ResourceCard card={missingFixture} size="large" />);

      expect(title().tagName).toBe('SPAN');
      expect(source().tagName).toBe('SPAN');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card-status')).toHaveTextContent('No longer available at the source');
    });

    it('renders its actions inside the frame, after the body', () => {
      render(<ResourceCard card={ARTICLE} size="large" actions={<div data-testid="actions" />} />);

      expect(card().lastElementChild).toBe(screen.getByTestId('actions'));
    });
  });

  describe('enrichment credits', () => {
    const MB_GROUP: TPinakesResourceDetail = mbGroupEnrichedFixture;
    const credits = () => screen.getByTestId('resource-credits');

    it('names the sources of the text and image in one line at the bottom of the body, above the actions', () => {
      render(<ResourceCard card={MB_GROUP} actions={<div data-testid="actions" />} />);

      expect(credits()).toHaveAttribute('data-variant', 'compact');
      expect(credits().compareDocumentPosition(screen.getByTestId('actions'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(credits()).toHaveTextContent(
        'Sources: Text: Wikipedia, CC BY-SA 4.0 · Image: Sony Music Entertainment, Wikimedia Commons, CC BY 4.0',
      );
      expect(screen.getByRole('link', { name: 'Wikipedia' })).toHaveAttribute(
        'href',
        'https://en.wikipedia.org/wiki/Daft_Punk',
      );
      expect(screen.getByTestId('resource-card-description')).toHaveClass('line-clamp-2');
    });

    it('lists every source with its license under the large card’s text and image, above the actions', () => {
      render(<ResourceCard card={MB_GROUP} size="large" actions={<div data-testid="actions" />} />);

      expect(credits()).toHaveAttribute('data-variant', 'full');
      expect(credits().compareDocumentPosition(screen.getByTestId('actions'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getByRole('region', { name: 'Sources' })).toBe(credits());
      expect(screen.getAllByTestId('resource-credit').map((line) => line.textContent)).toEqual([
        'Text: Wikipedia (en), excerpt · CC BY-SA 4.0',
        'Image: Sony Music Entertainment · Wikimedia Commons · CC BY 4.0',
      ]);
      expect(screen.getByTestId('resource-card-description')).not.toHaveClass('line-clamp-2');
      expect(cardImage()).toHaveAttribute('src', MB_GROUP.image);
    });

    it('lets a source in the line open its own page on a card that is a click-through', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={MB_GROUP} href={MB_GROUP.uri} actions={<div data-resource-controls />} />);

      fireEvent.click(screen.getByRole('link', { name: 'Wikipedia' }));
      expect(open).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('resource-card-description'));
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(MB_GROUP.uri));
    });

    it('treats a source that is not an http(s) page as the card’s surface, like the description', () => {
      const card = {
        ...MB_GROUP,
        credits: MB_GROUP.credits?.map((credit) => ({ ...credit, source_url: 'urn:x', license_url: null })),
      };
      render(<ResourceCard card={card} href={MB_GROUP.uri} actions={<div data-resource-controls />} />);

      expect(within(credits()).queryByRole('link')).not.toBeInTheDocument();
      fireEvent.click(screen.getAllByTestId('resource-credit-source')[0]);
      expect(mockPush).toHaveBeenCalledWith(getResourceRoute(MB_GROUP.uri));
    });

    it('drops the image’s credit when the image fails to load', () => {
      render(<ResourceCard card={MB_GROUP} />);

      fireEvent.error(cardImage());

      expect(credits()).toHaveTextContent('Sources: Text: Wikipedia');
      expect(credits()).not.toHaveTextContent('Wikimedia Commons');
    });

    it('credits only the text when an album has no image', () => {
      render(<ResourceCard card={mbReleaseGroupEnrichedFixture} size="large" />);

      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('resource-credit')).toHaveLength(1);
      expect(screen.getByTestId('resource-credit')).toHaveAttribute('data-field', 'description');
    });

    it('shows a card without credits as before: its own description and image, no sources', () => {
      render(<ResourceCard card={mbReleaseGroupFixture} size="large" />);

      expect(screen.getByTestId('resource-card-description')).toHaveTextContent('Miles Davis');
      expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
    });

    it('still shows an image that has no credit and needs none', () => {
      render(<ResourceCard card={{ ...musicRecordingFixture, credits: [] }} />);

      expect(cardImage()).toHaveAttribute('src', musicRecordingFixture.image);
    });

    it('shows a Wikimedia Commons image without its credit, crediting only the text', () => {
      render(<ResourceCard card={{ ...MB_GROUP, credits: MB_GROUP.credits?.slice(0, 1) }} />);

      expect(cardImage()).toHaveAttribute('src', MB_GROUP.image);
      expect(credits()).toHaveTextContent('Sources: Text: Wikipedia');
      expect(credits()).not.toHaveTextContent('Wikimedia Commons');
    });

    it('shows no sources line on a card without credits', () => {
      render(<ResourceCard card={ARTICLE} />);

      expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
    });

    it.each([
      ['stable', mbArtistSparseFixture],
      ['enriched, nothing found', mbArtistSparseEnrichedFixture],
    ])('never says a sparse card has no description; its facts and type icon stand in (%s)', (_, sparse) => {
      const card = { ...sparse, facts: { ...sparse.facts, disambiguation: 'frenchcore artist', area: 'Netherlands' } };
      render(<ResourceCard card={card} size="large" />);

      expect(screen.getByTestId('resource-card-summary')).toHaveTextContent('Frenchcore artist · Netherlands');
      expect(screen.queryByTestId('resource-card-description')).not.toBeInTheDocument();
      expect(screen.queryByText('No description available')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-credits')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card-type-tile').querySelector('svg')).toHaveClass('lucide-user');
    });
  });
});
