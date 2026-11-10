import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import bookFixture from '@/services/pinakes/fixtures/by-uri.book.json';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
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

// The link's own preview (OpenGraph) fills only what a card lacks; its tests are in ResourceCard.fallback.test.
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));

const ARTICLE: TPinakesResourceDetail = articleFixture;

const card = () => screen.getByTestId('resource-card');
const title = () => screen.getByTestId('resource-card-title');
const source = () => screen.getByTestId('resource-card-source');

describe('ResourceCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('header and click-through', () => {
    it('is no click-through when its body may turn into a player', () => {
      render(<ResourceCard card={videoFixture} renderBody={(body) => <div data-testid="wrapped">{body}</div>} />);

      expect(card()).not.toHaveAttribute('data-click-through');
      expect(screen.getByTestId('wrapped')).toContainElement(title());
    });

    it('names the site top right with an arrow, never the full link', () => {
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      expect(source()).toHaveTextContent('Wikipedia (en)');
      expect(source()).not.toHaveTextContent('en.wikipedia.org/wiki');
      expect(source().querySelector('svg.lucide-arrow-up-right')).toBeInTheDocument();
      expect(source()).toHaveAccessibleName('Open in Wikipedia (en)');
    });

    it('opens the link in a new tab on a click anywhere on the card', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      fireEvent.click(screen.getByTestId('resource-card-description'));

      expect(open).toHaveBeenCalledWith(ARTICLE.uri, '_blank', 'noopener,noreferrer');
      expect(card()).toHaveAttribute('data-click-through', 'true');
      expect(card()).not.toHaveAttribute('role');
    });

    it('keeps the click on the card, away from the surrounding post', () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const onPostClick = vi.fn();
      render(
        <div onClick={onPostClick}>
          <ResourceCard card={ARTICLE} href={ARTICLE.uri} />
        </div>,
      );

      fireEvent.click(screen.getByTestId('resource-card-description'));

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

    it('leaves the link to the ⋯ menu when it lists other services under Also on', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(
        <ResourceCard
          card={videoFixture}
          href={videoFixture.uri}
          actions={<div data-resource-controls data-testid="actions" />}
          hasAlsoOn
        />,
      );

      fireEvent.click(screen.getByTestId('resource-card-description'));

      expect(open).not.toHaveBeenCalled();
      expect(card()).not.toHaveAttribute('data-click-through');
      expect(card().firstElementChild).not.toHaveClass('cursor-pointer');
      expect(title()).toHaveAttribute('href', getResourceRoute(videoFixture.uri));
      expect(source()).toHaveAttribute('href', videoFixture.uri);
    });

    it('stays a click-through on other services too while its ⋯ menu lists no Also on', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(
        <ResourceCard
          card={videoFixture}
          href={videoFixture.uri}
          actions={<div data-resource-controls data-testid="actions" />}
        />,
      );

      fireEvent.click(screen.getByTestId('resource-card-description'));

      expect(open).toHaveBeenCalledWith(videoFixture.uri, '_blank', 'noopener,noreferrer');
      expect(card()).toHaveAttribute('data-click-through', 'true');
    });

    it('stays a click-through on other services too while it has no actions (composing)', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={videoFixture} href={videoFixture.uri} />);

      fireEvent.click(screen.getByTestId('resource-card-description'));

      expect(open).toHaveBeenCalledWith(videoFixture.uri, '_blank', 'noopener,noreferrer');
    });

    it('has no click-through without a web link', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={{ ...bookFixture, open_in: [] }} />);

      fireEvent.click(title());

      expect(open).not.toHaveBeenCalled();
      expect(card()).not.toHaveAttribute('data-click-through');
      expect(card().firstElementChild).not.toHaveClass('cursor-pointer');
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
      expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', ARTICLE.image);
      expect(screen.queryByTestId('resource-card-type-tile')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-status')).not.toBeInTheDocument();
    });

    it.each<[string, Partial<TPinakesResourceDetail>, string | null, string | null]>([
      ['its credit', { credits: mbGroupEnrichedFixture.credits }, 'Wikimedia Commons', null],
      ['the card’s own attribution', { credits: [], attribution: 'Grayliptrot, public domain' }, null, 'Grayliptrot'],
      ['no credit', { credits: [], attribution: '© OpenStreetMap contributors (ODbL)' }, null, null],
    ])('shows a Wikimedia image with %s', (_, extra, creditLine, attribution) => {
      render(<ResourceCard card={{ ...ARTICLE, ...extra }} href={ARTICLE.uri} />);

      expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', ARTICLE.image);
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

    it('links the title out where links may not navigate (the composer, a quoted post in a dialog)', () => {
      const href = 'https://en.m.wikipedia.org/wiki/Bitcoin';
      render(
        <PostPreviewNavigableProvider navigable={false}>
          <ResourceCard card={ARTICLE} href={href} />
        </PostPreviewNavigableProvider>,
      );

      expect(title()).toHaveAttribute('href', href);
      expect(title()).toHaveAttribute('target', '_blank');
      expect(title()).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('takes the favicon from the card’s own site when the post uses another host', () => {
      render(<ResourceCard card={ARTICLE} href="https://en.m.wikipedia.org/wiki/Bitcoin" />);

      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        'https://en.wikipedia.org/favicon.ico',
      );
    });

    it('links the source to the card’s own link without a post link', () => {
      render(<ResourceCard card={ARTICLE} />);

      expect(source()).toHaveAttribute('href', ARTICLE.uri);
    });

    it('shows the site’s favicon, then its parent domain’s, and a globe when both fail to load', () => {
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      const favicon = screen.getByTestId('resource-source-favicon');
      expect(favicon).toHaveAttribute('src', 'https://en.wikipedia.org/favicon.ico');
      fireEvent.error(favicon);
      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute('src', 'https://wikipedia.org/favicon.ico');
      fireEvent.error(screen.getByTestId('resource-source-favicon'));

      expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
      expect(source().querySelector('svg')).toHaveClass('lucide-globe');
    });

    it('shows the type’s icon in place of an image that fails to load', () => {
      render(<ResourceCard card={musicRecordingFixture} href={musicRecordingFixture.uri} />);

      fireEvent.error(screen.getByTestId('resource-card-image'));

      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card-type-tile').querySelector('svg')).toHaveClass('lucide-music');
    });

    it('aligns the image to the top, so a tall text column never stretches it', () => {
      render(<ResourceCard card={videoFixture} href={videoFixture.uri} />);

      expect(screen.getByTestId('resource-card-image')).toHaveClass('self-start');
    });

    it('shows an upright image (a poster) as a square once it has loaded, even for a film', async () => {
      render(<ResourceCard card={movieFixture} href={movieFixture.uri} />);
      const image = screen.getByTestId('resource-card-image');
      expect(image).toHaveAttribute('data-shape', 'wide');
      Object.defineProperty(image, 'naturalWidth', { value: 500 });
      Object.defineProperty(image, 'naturalHeight', { value: 750 });

      fireEvent.load(image);

      await waitFor(() => expect(screen.getByTestId('resource-card-image')).toHaveAttribute('data-shape', 'square'));
    });

    it('shows a wide image as a 16:9 thumbnail once it has loaded, whatever the type', async () => {
      render(<ResourceCard card={musicRecordingFixture} href={musicRecordingFixture.uri} />);
      const image = screen.getByTestId('resource-card-image');
      Object.defineProperty(image, 'naturalWidth', { value: 1200 });
      Object.defineProperty(image, 'naturalHeight', { value: 784 });

      fireEvent.load(image);

      await waitFor(() => expect(screen.getByTestId('resource-card-image')).toHaveAttribute('data-shape', 'wide'));
    });

    it.each([
      ['video', videoFixture],
      ['movie', movieFixture],
    ])('shows a %s’s image as a 16:9 thumbnail', (_, fixture) => {
      render(<ResourceCard card={fixture} href={fixture.uri} />);

      const image = screen.getByTestId('resource-card-image');
      expect(image).toHaveAttribute('data-shape', 'wide');
      expect(image).toHaveClass('aspect-video');
      expect(image).not.toHaveClass('size-20');
    });

    it.each([
      ['song', musicRecordingFixture],
      ['band', mbGroupEnrichedFixture],
    ])('keeps a %s’s image square', (_, fixture) => {
      render(<ResourceCard card={fixture} href={fixture.uri} />);

      const image = screen.getByTestId('resource-card-image');
      expect(image).toHaveAttribute('data-shape', 'square');
      expect(image).toHaveClass('size-20');
      expect(image).not.toHaveClass('aspect-video');
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

      expect(screen.getByTestId('resource-card-event-status')).toHaveTextContent('Event status: cancelled');
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

    it('plays an episode’s http(s) audio, loading nothing until played', () => {
      render(<ResourceCard card={EPISODE} href={EPISODE.uri} />);

      expect(audio()).toHaveAttribute('src', 'https://example.org/episode.mp3');
      expect(audio()).toHaveAttribute('preload', 'none');
      expect(audio()).toHaveAccessibleName(`Play ${EPISODE.name}`);
      expect(screen.queryByText('Preview')).not.toBeInTheDocument();
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
        'https://openlibrary.org/favicon.ico',
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
      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute('src', 'https://mempool.space/favicon.ico');
    });

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

    it('titles a card without a web link as text', () => {
      render(<ResourceCard card={bookFixture} size="large" />);

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Fantastic Mr. Fox');
      expect(title().tagName).toBe('SPAN');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('does not send the card, its source or its heading to a link that is gone upstream', () => {
      const { unmount } = render(<ResourceCard card={missingFixture} href={missingFixture.uri} />);
      expect(source().tagName).toBe('SPAN');
      expect(card()).not.toHaveAttribute('data-click-through');
      unmount();

      // Where links may not navigate, its title is text too.
      const { unmount: unmountQuoted } = render(
        <PostPreviewNavigableProvider navigable={false}>
          <ResourceCard card={missingFixture} href={missingFixture.uri} />
        </PostPreviewNavigableProvider>,
      );
      expect(title().tagName).not.toBe('A');
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
      expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', MB_GROUP.image);
    });

    it('lets a source in the line open its own page on a card that is a click-through', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      render(<ResourceCard card={MB_GROUP} href={MB_GROUP.uri} actions={<div data-resource-controls />} />);

      fireEvent.click(screen.getByRole('link', { name: 'Wikipedia' }));
      expect(open).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('resource-card-description'));
      expect(open).toHaveBeenCalledWith(MB_GROUP.uri, '_blank', 'noopener,noreferrer');
    });

    it('treats a source that is not an http(s) page as the card’s surface, like the description', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const card = {
        ...MB_GROUP,
        credits: MB_GROUP.credits?.map((credit) => ({ ...credit, source_url: 'urn:x', license_url: null })),
      };
      render(<ResourceCard card={card} href={MB_GROUP.uri} actions={<div data-resource-controls />} />);

      expect(within(credits()).queryByRole('link')).not.toBeInTheDocument();
      fireEvent.click(screen.getAllByTestId('resource-credit-source')[0]);
      expect(open).toHaveBeenCalledWith(MB_GROUP.uri, '_blank', 'noopener,noreferrer');
    });

    it('drops the image’s credit when the image fails to load', () => {
      render(<ResourceCard card={MB_GROUP} />);

      fireEvent.error(screen.getByTestId('resource-card-image'));

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

      expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', musicRecordingFixture.image);
    });

    it('shows a Wikimedia Commons image without its credit, crediting only the text', () => {
      render(<ResourceCard card={{ ...MB_GROUP, credits: MB_GROUP.credits?.slice(0, 1) }} />);

      expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', MB_GROUP.image);
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
