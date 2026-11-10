import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import bookFixture from '@/services/pinakes/fixtures/by-uri.book.json';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import missingFixture from '@/services/pinakes/fixtures/by-uri.missing.json';
import movieFixture from '@/services/pinakes/fixtures/by-uri.movie.json';
import musicRecordingFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import pubkyFixture from '@/services/pinakes/fixtures/by-uri.pubky.json';
import scholarlyArticleFixture from '@/services/pinakes/fixtures/by-uri.scholarly-article.json';
import unreachableFixture from '@/services/pinakes/fixtures/by-uri.unreachable.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceCard } from './ResourceCard';
import { ResourceFamily } from './ResourceCard.types';

const ARTICLE: TPinakesResourceDetail = articleFixture;

const card = () => screen.getByTestId('resource-card');
const title = () => screen.getByTestId('resource-card-title');
const source = () => screen.getByTestId('resource-card-source');

describe('ResourceCard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('header and click-through', () => {
    it('names the site top right with an arrow, never the full link', () => {
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      expect(source()).toHaveTextContent('Wikipedia (en)');
      expect(source()).not.toHaveTextContent('en.wikipedia.org/wiki');
      expect(source().querySelector('svg.lucide-arrow-up-right')).toBeInTheDocument();
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
      expect(screen.getByTestId('resource-card-image')).toHaveAttribute('src', ARTICLE.image);
      expect(screen.queryByTestId('resource-card-status')).not.toBeInTheDocument();
    });

    it('links the title and the source to the post’s link in a new tab', () => {
      const href = 'https://en.m.wikipedia.org/wiki/Bitcoin';
      render(<ResourceCard card={ARTICLE} href={href} />);

      for (const link of [title(), source()]) {
        expect(link.tagName).toBe('A');
        expect(link).toHaveAttribute('href', href);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
    });

    it('takes the favicon from the card’s own site when the post uses another host', () => {
      render(<ResourceCard card={ARTICLE} href="https://en.m.wikipedia.org/wiki/Bitcoin" />);

      expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute(
        'src',
        'https://en.wikipedia.org/favicon.ico',
      );
    });

    it('links to the card’s own link without a post link', () => {
      render(<ResourceCard card={ARTICLE} />);

      expect(title()).toHaveAttribute('href', ARTICLE.uri);
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

    it('hides an image that fails to load', () => {
      render(<ResourceCard card={ARTICLE} href={ARTICLE.uri} />);

      fireEvent.error(screen.getByTestId('resource-card-image'));

      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
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
      ['article', articleFixture],
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

    it('shows where a place is, with its attribution', () => {
      render(<ResourceCard card={placeFixture} href={placeFixture.uri} />);

      expect(card()).toHaveAttribute('data-family', ResourceFamily.PLACE);
      expect(screen.getByTestId('resource-card-type')).toHaveTextContent('City');
      expect(screen.getByTestId('resource-card-point')).toHaveTextContent('52.5174, 13.3951');
      expect(screen.getByTestId('resource-card-attribution')).toHaveTextContent('© OpenStreetMap contributors (ODbL)');
      expect(screen.queryByTestId('resource-card-dates')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-image')).not.toBeInTheDocument();
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

  describe('links that are not web pages', () => {
    it('renders an isbn: card without a post link as text, with a book icon', () => {
      render(<ResourceCard card={bookFixture} />);

      expect(title().tagName).toBe('P');
      expect(title()).toHaveTextContent('Fantastic Mr. Fox');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-card-source').querySelector('svg')).toHaveClass('lucide-book-open');
      expect(screen.queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
    });

    it('links an isbn: card to the web link the post used', () => {
      const href = 'https://openlibrary.org/isbn/9780140328721';
      render(<ResourceCard card={bookFixture} href={href} />);

      expect(title()).toHaveAttribute('href', href);
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

      expect(title()).toHaveAttribute('href', pubkyFixture.open_in[0].url);
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

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
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

      expect(screen.getByTestId('resource-card-status')).toHaveTextContent('Details not read yet');
      expect(title()).toHaveTextContent('Bitcoin');
    });

    it.each([PinakesStatus.ERROR, 'archived'])('says the details could not be read for status %s', (status) => {
      render(<ResourceCard card={{ ...ARTICLE, status }} />);

      expect(card()).toHaveAttribute('data-status', PinakesStatus.ERROR);
      expect(within(screen.getByTestId('resource-card-status')).getByText('Details could not be read')).toBeVisible();
    });
  });
});
