import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import { usePinakesGroup } from '@/hooks/usePinakesGroup/usePinakesGroup';
import { usePinakesRelated } from '@/hooks/usePinakesRelated/usePinakesRelated';
import { useResourceRowCounts } from '@/hooks/useResourceRowCounts/useResourceRowCounts';
import type { TResourceRowCounts } from '@/hooks/useResourceRowCounts/useResourceRowCounts.types';
import eventFixture from '@/services/pinakes/fixtures/by-uri.event.json';
import natureFixture from '@/services/pinakes/fixtures/by-uri.nature-article.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import groupFixture from '@/services/pinakes/fixtures/group.video.json';
import becauseFixture from '@/services/pinakes/fixtures/search.related.because.json';
import relatedFixture from '@/services/pinakes/fixtures/search.related.json';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { SHARED_ON_PUBKY_NOTE } from './ResourceAlsoOnList.utils';
import { ResourceSidebar } from './ResourceSidebar';

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: () => true, PINAKES_RELATED_LIMIT: 5 }));
vi.mock('@/hooks/usePinakesGroup/usePinakesGroup', () => ({ usePinakesGroup: vi.fn() }));
vi.mock('@/hooks/usePinakesRelated/usePinakesRelated', () => ({ usePinakesRelated: vi.fn() }));
vi.mock('@/hooks/useResourceRowCounts/useResourceRowCounts', () => ({ useResourceRowCounts: vi.fn() }));
vi.mock('./ResourceSimilarBecause', () => ({
  ResourceSimilarBecause: ({ tagUri }: { tagUri: string }) => <span data-testid="because">{tagUri}</span>,
}));
vi.mock('./ResourceParticipants', () => ({
  ResourceParticipants: ({ uri, replyIds }: { uri: string; replyIds: string[] }) => (
    <div data-testid="participants-stub" data-uri={uri} data-replies={replyIds.join(' ')} />
  ),
}));
vi.mock('@/organisms/FeedbackCard/FeedbackCard', () => ({ FeedbackCard: () => <div data-testid="feedback-stub" /> }));

const VIDEO: TPinakesResourceDetail = videoFixture;
const GROUP: TPinakesGroupDetail = groupFixture;
const RELATED: TPinakesCard[] = relatedFixture.items;

const settled = <T,>(data: T) => ({ data, isLoading: false, isError: false });
const LOADING = { data: undefined, isLoading: true, isError: false };
const FAILED = { data: null, isLoading: false, isError: true };

describe('ResourceSidebar', () => {
  const mockGroup = vi.mocked(usePinakesGroup);
  const mockRelated = vi.mocked(usePinakesRelated);
  const mockRowCounts = vi.mocked(useResourceRowCounts);
  let card: TPinakesResourceDetail;

  beforeEach(() => {
    vi.clearAllMocks();
    card = VIDEO;
    // The video's group; any other card has none here, and a hook asked without an ID reads nothing.
    mockGroup.mockImplementation((id) => (id === VIDEO.group!.id ? settled(GROUP) : settled(null)));
    mockRelated.mockReturnValue(settled(RELATED));
    // No link read: no row shows counts.
    mockRowCounts.mockReturnValue(null);
  });

  it.each([undefined, null])('shows nothing without a card (%s)', (none) => {
    const { container } = render(<ResourceSidebar card={none} />);

    expect(container).toBeEmptyDOMElement();
    expect(mockRelated).not.toHaveBeenCalled();
  });

  describe('people sections, as on a post’s page', () => {
    it('shows Participants and Feedback under Also on and Similar, Feedback only when asked', () => {
      const { rerender } = render(<ResourceSidebar card={card} uri={VIDEO.uri} replyIds={['a:1']} showFeedback />);

      const sidebar = screen.getByTestId('resource-sidebar');
      const order = [...sidebar.children].map((child) => child.getAttribute('data-testid'));
      expect(order.slice(-2)).toEqual(['participants-stub', 'feedback-stub']);
      expect(screen.getByTestId('participants-stub')).toHaveAttribute('data-uri', VIDEO.uri);
      expect(screen.getByTestId('participants-stub')).toHaveAttribute('data-replies', 'a:1');

      rerender(<ResourceSidebar card={card} uri={VIDEO.uri} />);
      expect(screen.queryByTestId('feedback-stub')).not.toBeInTheDocument();
    });

    it('shows Participants without a card', () => {
      render(<ResourceSidebar card={null} uri="https://example.com/a" showFeedback />);

      expect(screen.getByTestId('participants-stub')).toHaveAttribute('data-uri', 'https://example.com/a');
      expect(screen.getByTestId('feedback-stub')).toBeInTheDocument();
      expect(mockRelated).not.toHaveBeenCalled();
    });
  });

  describe('with a card', () => {
    it('lists one row per other service, each opening its page on Pubky, where the link came from in its tooltip only', () => {
      render(<ResourceSidebar card={card} />);

      const section = screen.getByTestId('resource-also-on-list');
      // A YouTube video: not its own YouTube, one Apple Music and one Spotify.
      expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Also on · 5');
      const rows = within(section).getAllByTestId('resource-also-on-list-row');
      expect(rows.map((row) => row.textContent)).toEqual(['TIDAL', 'Apple Music', 'MusicBrainz', 'Deezer', 'Spotify']);
      const [tidal, out] = within(rows[0]).getAllByRole('link');
      expect(tidal).toHaveAccessibleName('TIDAL');
      // Its page on Pubky, not the service: leaving for TIDAL is the ↗ beside it.
      expect(tidal).toHaveAttribute('href', getResourceRoute(VIDEO.also_on[0].uri));
      expect(tidal).not.toHaveAttribute('target');
      expect(tidal).toHaveAttribute('title', `TIDAL · ${SHARED_ON_PUBKY_NOTE}`);
      expect(out).toBe(within(rows[0]).getByTestId('resource-also-on-list-row-external'));
      expect(out).toHaveAccessibleName('Open in TIDAL');
      expect(out).toHaveAttribute('href', VIDEO.also_on[0].uri);
      expect(out).toHaveAttribute('target', '_blank');
      expect(tidal).not.toContainElement(out);
      expect(section.textContent).not.toMatch(/found via|shared on pubky/i);
    });

    it('puts each link’s own counts under its row, none under a link without any', () => {
      const counts: Record<string, TResourceRowCounts> = {
        [VIDEO.also_on[0].uri]: { tags: 1, isTagsAtReadLimit: false, replies: 4, posts: 2 },
      };
      mockRowCounts.mockImplementation((uri) => counts[uri] ?? null);
      render(<ResourceSidebar card={card} />);

      const rows = within(screen.getByTestId('resource-also-on-list')).getAllByTestId('resource-also-on-list-row');
      // Asked for each row's link exactly as the row opens it.
      for (const row of rows) {
        const href = within(row).getAllByRole('link')[0].getAttribute('href');
        expect(mockRowCounts.mock.calls.some(([uri]) => getResourceRoute(uri) === href)).toBe(true);
      }
      const [tidal] = within(rows[0]).getAllByRole('link');
      expect(tidal).toHaveAccessibleName('TIDAL 1 tag, 4 comments, 2 posts');
      expect(tidal).toHaveAttribute('title', `TIDAL · 1 tag, 4 comments, 2 posts · ${SHARED_ON_PUBKY_NOTE}`);
      expect(within(rows[0]).getByTestId('resource-also-on-list-row-counts-tags')).toHaveTextContent('1');
      expect(within(rows[0]).getByTestId('resource-also-on-list-row-counts-replies')).toHaveTextContent('4');
      expect(within(rows[0]).getByTestId('resource-also-on-list-row-counts-posts')).toHaveTextContent('2');
      for (const row of rows.slice(1)) {
        expect(within(row).queryByTestId('resource-also-on-list-row-counts')).not.toBeInTheDocument();
      }
      // Similar rows show none.
      const similar = screen.getByTestId('resource-similar-list');
      expect(within(similar).queryByTestId(/-counts$/)).not.toBeInTheDocument();
    });

    it('shows the first five services and the rest behind "Show N more" in the card’s footer', () => {
      const many = Array.from({ length: 8 }, (_, index) => ({
        uri: `https://service${index}.example/track/1`,
        site: `Service ${index}`,
      }));
      card = { ...VIDEO, group: null, also_on: many };
      render(<ResourceSidebar card={card} />);

      const section = screen.getByTestId('resource-also-on-list');
      expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('Also on · 8');
      expect(within(section).getAllByTestId('resource-also-on-list-row')).toHaveLength(5);
      const toggle = within(section).getByTestId('resource-also-on-list-toggle');
      expect(toggle).toHaveTextContent('Show 3 more');
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-controls', within(section).getByRole('list').id);
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(within(section).getAllByTestId('resource-also-on-list-row')).toHaveLength(8);
      expect(within(section).getByTestId('resource-also-on-list-toggle')).toHaveTextContent('Show less');
    });

    it('shows Also on, then Similar', () => {
      render(<ResourceSidebar card={card} />);

      const sidebar = screen.getByTestId('resource-sidebar');
      expect([...sidebar.children].map((child) => child.getAttribute('data-testid'))).toEqual([
        'resource-also-on-list',
        'resource-similar-list',
      ]);
      expect(sidebar).not.toHaveTextContent('Group members');
    });

    it('lists a shared link that is not a web link by its identifier, opening its page', () => {
      card = natureFixture;
      render(<ResourceSidebar card={card} />);

      const doi = screen.getAllByTestId('resource-also-on-list-row')[0];
      expect(natureFixture.also_on[0].uri).toBe('doi:10.1038/nature12373');
      expect(doi).toHaveTextContent('DOI 10.1038/nature12373');
      expect(within(doi).getByRole('link')).toHaveAttribute('href', getResourceRoute('doi:10.1038/nature12373'));
      // Not a web link: nothing to open out of the app.
      expect(within(doi).queryByTestId('resource-also-on-list-row-external')).not.toBeInTheDocument();
    });

    it('lists a found link that is not a web link, opening its page', () => {
      card = {
        ...natureFixture,
        also_on: [{ uri: 'doi:10.1038/nature12373', site: 'DOI', derived: true, via: 'crossref' }],
      };
      render(<ResourceSidebar card={card} />);

      const doi = screen.getByTestId('resource-also-on-list-row');
      expect(doi).toHaveTextContent('10.1038/nature12373');
      expect(within(doi).getByRole('link')).toHaveAttribute('href', getResourceRoute('doi:10.1038/nature12373'));
    });

    it('lists a match by metadata last with no label, its note in its tooltip and name only', () => {
      const appleMusic = {
        uri: 'https://music.apple.com/us/song/1',
        site: 'Apple Music',
        derived: true,
        via: 'itunes_song',
        kind: 'maybe',
      };
      // Outside a group: no member shared on Pubky stands for Apple Music instead.
      card = {
        ...VIDEO,
        group: null,
        also_on: [appleMusic, ...VIDEO.also_on.filter((entry) => entry.site !== 'Apple Music')],
      };
      render(<ResourceSidebar card={card} />);

      const section = screen.getByTestId('resource-also-on-list');
      const rows = within(section).getAllByTestId('resource-also-on-list-row');
      expect(rows.map((row) => row.textContent)).toEqual([
        'TIDAL',
        'MusicBrainz',
        'Deezer',
        'Spotify',
        'Apple Music Matched by title and length',
      ]);
      const [link] = within(rows[4]).getAllByRole('link');
      expect(within(link).getByText('Matched by title and length')).toHaveClass('sr-only');
      expect(section.textContent).not.toMatch(/maybe/i);
      expect(link).toHaveAccessibleName('Apple Music Matched by title and length');
      expect(link).toHaveAttribute('title', 'Apple Music · Matched by title and length · Found via itunes_song');
      expect(link).toHaveAttribute('href', getResourceRoute(appleMusic.uri));
      // An exact link's row is as before.
      expect(within(rows[0]).getAllByRole('link')[0]).toHaveAccessibleName('TIDAL');
    });

    it('shows no Also on section for a resource on no other service', () => {
      card = eventFixture;
      render(<ResourceSidebar card={card} />);

      expect(eventFixture.also_on).toHaveLength(0);
      expect(screen.queryByTestId('resource-also-on-list')).not.toBeInTheDocument();
    });

    describe('a service in several languages', () => {
      const PLACE: TPinakesResourceDetail = placeFixture;
      const section = () => screen.getByTestId('resource-also-on-list');
      const wikipedia = () => within(section()).getByRole('link', { name: /^Wikipedia / });
      const languages = (name = 'Wikipedia') =>
        within(section()).getByRole('combobox', { name: new RegExp(`^${name} language: `) });
      const voyage = (lang: string) => ({
        uri: `https://${lang}.wikivoyage.org/wiki/Berlin`,
        site: `Wikivoyage (${lang})`,
      });

      // Radix Select asks the DOM for pointer capture and scrolling, which jsdom does not have.
      const POINTER_APIS = [
        'hasPointerCapture',
        'setPointerCapture',
        'releasePointerCapture',
        'scrollIntoView',
      ] as const;
      beforeAll(() => {
        for (const api of POINTER_APIS)
          Object.defineProperty(Element.prototype, api, { configurable: true, value: vi.fn() });
      });
      afterAll(() => {
        for (const api of POINTER_APIS) Reflect.deleteProperty(Element.prototype, api);
      });

      it('is one Wikipedia row with a language select, and the count names the rows', () => {
        card = PLACE;
        render(<ResourceSidebar card={card} />);

        expect(PLACE.also_on).toHaveLength(32);
        expect(within(section()).getByRole('heading', { level: 2 })).toHaveTextContent('Also on · 6');
        const rows = within(section()).getAllByTestId('resource-also-on-list-row');
        expect(rows).toHaveLength(6);
        expect(wikipedia()).toHaveAccessibleName('Wikipedia English (en)');
        expect(wikipedia()).toHaveAttribute('title', 'Wikipedia · English (en) · Found via wikidata');
        expect(wikipedia()).toHaveAttribute('href', getResourceRoute('https://en.wikipedia.org/wiki/Berlin'));
        expect(wikipedia()).not.toHaveAttribute('target');
        // The select is the link's sibling in the list item, never inside it.
        expect(languages()).toHaveAccessibleName('Wikipedia language: English (en)');
        expect(languages()).toHaveTextContent('English (en)');
        expect(wikipedia()).not.toContainElement(languages());
        expect(rows[5]).toContainElement(languages());
        // The chosen edition on Wikipedia, beside the row on its line; the select is under both.
        const out = within(rows[5]).getByTestId('resource-also-on-list-row-external');
        expect(out).toHaveAccessibleName('Open in Wikipedia');
        expect(out).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Berlin');
        expect(out.parentElement).toBe(wikipedia().parentElement);
        expect(out.parentElement).not.toContainElement(languages());
      });

      it('lists the languages by their own names and changes only where the row and its ↗ link', async () => {
        const user = userEvent.setup();
        card = PLACE;
        render(<ResourceSidebar card={card} />);
        const location = window.location.href;

        await user.click(languages());
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(27);
        expect(screen.getByRole('option', { name: 'English (en)' })).toHaveAttribute('aria-selected', 'true');
        // Wikipedia's `no` is Bokmål: its name carries the BCP 47 tag.
        expect(
          within(screen.getByRole('option', { name: 'Norsk bokmål (no)' })).getByText('Norsk bokmål (no)'),
        ).toHaveAttribute('lang', 'nb');
        await user.click(screen.getByRole('option', { name: 'Français (fr)' }));

        expect(languages()).toHaveAccessibleName('Wikipedia language: Français (fr)');
        expect(wikipedia()).toHaveAttribute('href', getResourceRoute('https://fr.wikipedia.org/wiki/Berlin'));
        expect(wikipedia()).toHaveAccessibleName('Wikipedia Français (fr)');
        expect(within(section()).getByRole('link', { name: 'Open in Wikipedia' })).toHaveAttribute(
          'href',
          'https://fr.wikipedia.org/wiki/Berlin',
        );
        expect(window.location.href).toBe(location);
      });

      it('starts on the browser’s language', () => {
        const spy = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-CH', 'de']);
        try {
          card = PLACE;
          render(<ResourceSidebar card={card} />);

          expect(languages()).toHaveAccessibleName('Wikipedia language: Deutsch (de)');
          expect(wikipedia()).toHaveAttribute('href', getResourceRoute('https://de.wikipedia.org/wiki/Berlin'));
        } finally {
          spy.mockRestore();
        }
      });

      it('puts the chosen edition’s counts under the row', () => {
        mockRowCounts.mockImplementation((uri) =>
          uri === 'https://en.wikipedia.org/wiki/Berlin'
            ? { tags: 3, isTagsAtReadLimit: false, replies: 0, posts: 1 }
            : null,
        );
        card = PLACE;
        render(<ResourceSidebar card={card} />);

        expect(wikipedia()).toHaveAccessibleName('Wikipedia English (en) 3 tags, 1 post');
        expect(within(wikipedia()).getByTestId('resource-also-on-list-row-counts-tags')).toHaveTextContent('3');
        expect(within(wikipedia()).queryByTestId('resource-also-on-list-row-counts-replies')).not.toBeInTheDocument();
        expect(within(wikipedia()).getByTestId('resource-also-on-list-row-counts-posts')).toHaveTextContent('1');
        expect(within(section()).getAllByTestId('resource-also-on-list-row-counts')).toHaveLength(1);
      });

      it('shows no label on a match by metadata in another language, its note in its tooltip and name only', () => {
        const maybe = (lang: string) => ({ ...voyage(lang), derived: true, via: 'x', kind: 'maybe' });
        card = { ...PLACE, group: null, also_on: [maybe('en'), maybe('fr')] };
        render(<ResourceSidebar card={card} />);

        const row = within(section()).getByRole('link', { name: /^Wikivoyage / });
        expect(section().textContent).not.toMatch(/maybe/i);
        expect(row).toHaveAccessibleName('Wikivoyage English (en) Matched by title and length');
        expect(row).toHaveAttribute('title', 'Wikivoyage · English (en) · Matched by title and length · Found via x');
      });

      it('gives each service its own row and select, and leaves a service in one language a plain row', () => {
        const wikipediaDe = PLACE.also_on.find((entry) => entry.site === 'Wikipedia (de)')!;
        card = { ...PLACE, also_on: [wikipediaDe, voyage('de'), voyage('fr'), PLACE.also_on[0]] };
        render(<ResourceSidebar card={card} />);

        expect(within(section()).getByRole('heading', { level: 2 })).toHaveTextContent('Also on · 3');
        expect(within(section()).getAllByRole('combobox')).toHaveLength(1);
        expect(languages('Wikivoyage')).toHaveAccessibleName('Wikivoyage language: Deutsch (de)');
        expect(within(section()).getByRole('link', { name: 'Wikipedia (de)' })).toHaveAttribute(
          'href',
          getResourceRoute(wikipediaDe.uri),
        );
      });
    });

    it('adds a group member only for a service Also on has no link for', () => {
      // Also on lists only the derived Spotify link here; the group read adds the other services.
      const derived = VIDEO.also_on[VIDEO.also_on.length - 1];
      card = { ...VIDEO, also_on: [derived, { ...derived }] };
      render(<ResourceSidebar card={card} />);

      expect(mockGroup).toHaveBeenCalledWith(VIDEO.group!.id);
      const section = screen.getByTestId('resource-also-on-list');
      // Each row's own link, not its ↗.
      const links = within(section)
        .getAllByTestId('resource-also-on-list-row')
        .map((row) => within(row).getAllByRole('link')[0]);
      expect(links.map((link) => link.textContent)).toEqual([
        'Spotify',
        'TIDAL',
        'Apple Music',
        'MusicBrainz',
        'Deezer',
      ]);
      expect(links[0]).toHaveAttribute('href', getResourceRoute(derived.uri));
      expect(links[1]).toHaveAttribute('href', getResourceRoute('https://tidal.com/track/490851477'));
      // A member row links out to its service too.
      const rows = within(section).getAllByTestId('resource-also-on-list-row');
      expect(within(rows[1]).getByTestId('resource-also-on-list-row-external')).toHaveAttribute(
        'href',
        'https://tidal.com/track/490851477',
      );
      // A member is named by its service, as Also on names it, not by its title.
      expect(section).not.toHaveTextContent('(Official Video)');
    });

    it('names a member Pinakes gives no service by its link’s host, and opens its page', () => {
      const derived = VIDEO.also_on[VIDEO.also_on.length - 1];
      card = { ...VIDEO, also_on: [derived] };
      const member = { ...GROUP.members[1], uri: 'https://www.example.org/track/1', refs: [], site: null };
      mockGroup.mockReturnValue(settled({ ...GROUP, members: [GROUP.members[0], member] }));
      render(<ResourceSidebar card={card} />);

      const last = within(screen.getAllByTestId('resource-also-on-list-row')[1]).getAllByRole('link')[0];
      expect(last).toHaveAccessibleName('example.org');
      expect(last).toHaveAttribute('href', getResourceRoute(member.uri));
      expect(screen.getByRole('link', { name: 'Open in example.org' })).toHaveAttribute('href', member.uri);
    });

    it.each([
      ['is read', LOADING],
      ['fails', FAILED],
      ['no longer exists', settled(null)],
    ])('lists Also on alone while the group %s', (_, result) => {
      mockGroup.mockReturnValue(result);
      render(<ResourceSidebar card={card} />);

      const section = screen.getByTestId('resource-also-on-list');
      expect(section).toHaveAttribute('aria-busy', 'false');
      expect(within(section).getAllByTestId('resource-also-on-list-row')).toHaveLength(5);
      expect(screen.queryByTestId('resource-also-on-list-message')).not.toBeInTheDocument();
    });

    it('reads no group for a card outside a group', () => {
      card = eventFixture;
      render(<ResourceSidebar card={card} />);

      // Asked without a group ID, which reads nothing (the hook is then disabled).
      expect(mockGroup.mock.calls.every(([id]) => !id)).toBe(true);
    });

    it('lists similar resources, read for this card, each opening its own page', () => {
      render(<ResourceSidebar card={card} />);

      expect(mockRelated).toHaveBeenCalledWith(VIDEO.id);
      const section = screen.getByTestId('resource-similar-list');
      expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(`Similar · ${RELATED.length}`);
      expect(section).toHaveTextContent('People who tagged this also tagged');
      const rows = within(section).getAllByTestId('resource-similar-list-row');
      expect(rows).toHaveLength(RELATED.length);
      // An isbn: book and a geo: point have pages too.
      expect(within(rows[2]).getByRole('link')).toHaveAttribute('href', '/resource?uri=isbn%3A9781119473862');
      expect(rows[2]).toHaveTextContent('The bitcoin standard');
      expect(within(rows[4]).getByRole('link')).toHaveAttribute('href', getResourceRoute('geo:46.0037,8.9511'));
    });

    it('lists calendar occurrences that share their feed’s ID once each', () => {
      // An occurrence card carries its feed's `id` (stable, `/v1/search?type=Event`).
      const occurrences = [RELATED[0], { ...RELATED[1], id: RELATED[0].id }];
      mockRelated.mockReturnValue(settled(occurrences));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<ResourceSidebar card={card} />);

      expect(screen.getAllByTestId('resource-similar-list-row')).toHaveLength(2);
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it.each([
      ['is read', LOADING, null],
      ['fails', FAILED, 'Similar links could not be loaded'],
    ])('shows the state of Similar while it %s', (_, result, message) => {
      mockRelated.mockReturnValue(result);
      render(<ResourceSidebar card={card} />);

      if (message) {
        expect(screen.getByTestId('resource-similar-list-message')).toHaveTextContent(message);
      } else {
        expect(screen.getByTestId('resource-similar-list-loading').children).toHaveLength(5);
      }
      expect(screen.queryByTestId('resource-similar-list-row')).not.toBeInTheDocument();
      expect(within(screen.getByTestId('resource-similar-list')).getByRole('heading', { level: 2 }).textContent).toBe(
        'Similar',
      );
    });

    it('says why each similar row is suggested when Pinakes gives it, by its most referenced link', () => {
      const [first, second] = becauseFixture.items;
      const rows: TPinakesCard[] = [
        // Tagged by another link than its card's URI (a typed card): its tags are that link's.
        { ...first, refs: ['https://example.org/tagged-link', first.uri] },
        second,
        { ...RELATED[0], because: null },
        { ...RELATED[1], because: { shared: 0, taggers: [] } },
      ];
      mockRelated.mockReturnValue(settled(rows));
      render(<ResourceSidebar card={card} />);
      const listed = screen.getAllByTestId('resource-similar-list-row');
      expect(listed).toHaveLength(4);
      expect(within(listed[0]).getByTestId('because')).toHaveTextContent('https://example.org/tagged-link');
      expect(within(listed[1]).getByTestId('because')).toHaveTextContent(second.refs[0] ?? second.uri);
      expect(within(listed[2]).queryByTestId('because')).not.toBeInTheDocument();
      expect(within(listed[3]).queryByTestId('because')).not.toBeInTheDocument();
    });

    it('shows no Similar section when nothing similar is found', () => {
      mockRelated.mockReturnValue(settled([]));
      render(<ResourceSidebar card={card} />);

      expect(mockRelated).toHaveBeenCalledWith(VIDEO.id);
      expect(screen.queryByTestId('resource-similar-list')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-also-on-list')).toBeInTheDocument();
    });

    it('is empty when it has no list to show', () => {
      card = eventFixture;
      mockRelated.mockReturnValue(settled([]));
      render(<ResourceSidebar card={card} />);

      expect(screen.getByTestId('resource-sidebar')).toBeEmptyDOMElement();
    });
  });
});
