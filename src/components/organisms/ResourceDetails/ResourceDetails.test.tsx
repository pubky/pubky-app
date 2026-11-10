import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePinakesGroup } from '@/hooks/usePinakesGroup/usePinakesGroup';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import { usePinakesRelated } from '@/hooks/usePinakesRelated/usePinakesRelated';
import bookFixture from '@/services/pinakes/fixtures/by-uri.book.json';
import mbRecordingEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-recording.enriched.json';
import missingFixture from '@/services/pinakes/fixtures/by-uri.missing.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import groupFixture from '@/services/pinakes/fixtures/group.video.json';
import relatedFixture from '@/services/pinakes/fixtures/search.related.json';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceDetails } from './ResourceDetails';

const mocks = vi.hoisted(() => ({ configured: true, otherLinks: null as { uri: string; name: string }[] | null }));

// The second tag group's links are read once by the page; here only which links matters.
vi.mock('@/hooks/useOtherLinkTags/useOtherLinkTags', () => ({
  useOtherLinkTags: (links: { uri: string; name: string }[]) => {
    mocks.otherLinks = links;
    return { reads: [], isLoading: false };
  },
}));

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: () => mocks.configured, PINAKES_RELATED_LIMIT: 5 }));
vi.mock('@/hooks/usePinakesGroup/usePinakesGroup', () => ({ usePinakesGroup: vi.fn() }));
vi.mock('@/hooks/usePinakesRelated/usePinakesRelated', () => ({ usePinakesRelated: vi.fn() }));
// The action row and tag bar have their own tests; here only what they are given matters.
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: ({
    uri,
    postUri,
    collectionsCount,
    tagsLabel,
    linkUrl,
    title,
    extraMenuContent,
    otherTagList,
    size,
  }: {
    uri: string;
    postUri?: string | null;
    collectionsCount?: number | null;
    tagsLabel: string;
    linkUrl?: string | null;
    title?: string | null;
    extraMenuContent?: unknown;
    otherTagList?: readonly { label: string }[];
    size?: string;
  }) => (
    <div
      data-testid="resource-actions"
      data-uri={uri}
      data-post-uri={postUri === undefined ? 'default' : (postUri ?? 'none')}
      data-collections={collectionsCount ?? 'none'}
      data-tags-label={tagsLabel}
      data-link-url={linkUrl === undefined ? 'default' : (linkUrl ?? 'none')}
      data-title={title ?? 'none'}
      data-extra-menu={extraMenuContent ? 'yes' : 'no'}
      data-size={size}
    >
      <div data-testid="resource-other-tag-list" data-labels={otherTagList?.map((tag) => tag.label).join(',')} />
    </div>
  ),
}));

const VIDEO: TPinakesResourceDetail = videoFixture;
const GROUP: TPinakesGroupDetail = groupFixture;
const RELATED: TPinakesCard[] = relatedFixture.items;
const NOT_KNOWN = 'https://example.com/pinakes-does-not-know-this-link-1104';

const settled = <T,>(data: T) => ({ data, isLoading: false, isError: false });
const otherLinks = (): { uri: string; name: string }[] => mocks.otherLinks ?? [];
const LOADING = { data: undefined, isLoading: true, isError: false };
const FAILED = { data: null, isLoading: false, isError: true };

let read: UsePinakesQueryResult<TPinakesResourceDetail>;
const onRetry = vi.fn();
const renderDetails = (uri: string | null) => render(<ResourceDetails uri={uri} read={read} onRetry={onRetry} />);

describe('ResourceDetails', () => {
  const mockGroup = vi.mocked(usePinakesGroup);
  const mockRelated = vi.mocked(usePinakesRelated);

  beforeEach(() => {
    mocks.otherLinks = null;
    vi.clearAllMocks();
    mocks.configured = true;
    read = settled(VIDEO);
    mockGroup.mockReturnValue(settled(GROUP));
    mockRelated.mockReturnValue(settled(RELATED));
  });

  describe('when the link is known', () => {
    it('reads the card for the page’s link and shows it large, under the page’s heading, opened by its header alone', () => {
      renderDetails(VIDEO.uri);

      expect(screen.getByTestId('resource-card')).toHaveAttribute('data-size', 'large');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(VIDEO.name!);
      // One way to open the source: "Open in YouTube", no second link on the title.
      expect(screen.getByTestId('resource-card-title')).not.toHaveAttribute('href');
      expect(screen.getByTestId('resource-card-source')).toHaveAttribute('href', VIDEO.uri);
      expect(screen.getByTestId('resource-card-source').textContent).toBe('YouTube');
      expect(screen.getByTestId('resource-card-source')).toHaveAccessibleName('Open in YouTube');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('External resource');
      // The lists are the page's sidebar cards (`ResourceSidebar`), not part of the body.
      expect(screen.queryByTestId('resource-also-on-list')).not.toBeInTheDocument();
      expect(mockRelated).not.toHaveBeenCalled();
    });

    it('closes the large card with its action row and tags, on the card’s link', () => {
      read = settled({ ...VIDEO, collections: 8 });
      renderDetails(VIDEO.uri);

      const actions = within(screen.getByTestId('resource-card')).getByTestId('resource-actions');
      expect(VIDEO.refs).toContain(VIDEO.uri);
      expect(actions).toHaveAttribute('data-uri', VIDEO.uri);
      expect(actions).toHaveAttribute('data-post-uri', VIDEO.uri);
      expect(actions).toHaveAttribute('data-collections', '8');
      expect(actions).toHaveAttribute('data-tags-label', 'Tags on this video');
      expect(actions).toHaveAttribute('data-size', 'large');
      // The full lists are the page's sidebar cards: the large card's ⋯ has no Also on section.
      expect(actions).toHaveAttribute('data-extra-menu', 'no');
      expect(screen.queryByTestId('resource-also-on-menu')).not.toBeInTheDocument();
    });

    it('gives the ⋯ menu the acted-on web link and the title to copy', () => {
      read = settled({ ...missingFixture, name: 'Africa' });
      renderDetails(missingFixture.uri);

      const actions = screen.getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-link-url', 'https://music.apple.com/gb/song/1440717826');
      expect(actions).toHaveAttribute('data-title', 'Africa');
    });

    it('has no title to copy for a card without a name', () => {
      read = settled(missingFixture);
      renderDetails(missingFixture.uri);

      expect(missingFixture.name).toBeNull();
      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-title', 'none');
    });

    it('has no web link to copy for a resource known by another scheme only', () => {
      read = settled({ ...bookFixture, open_in: [] });
      renderDetails(bookFixture.uri);

      const actions = screen.getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-uri', 'isbn:9780140328721');
      expect(actions).toHaveAttribute('data-link-url', 'none');
      expect(actions).toHaveAttribute('data-title', 'Fantastic Mr. Fox');
    });

    it('acts on a link people wrote when the canonical one is not one of them', () => {
      read = settled(missingFixture);
      renderDetails(missingFixture.uri);

      // Nexus has the tags on the `gb` link people wrote, none on the canonical one.
      expect(missingFixture.refs).not.toContain(missingFixture.uri);
      const actions = screen.getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-uri', 'https://music.apple.com/gb/song/1440717826');
      expect(actions).toHaveAttribute('data-post-uri', 'https://music.apple.com/gb/song/1440717826');
    });

    it('acts on the page’s own link when people wrote it', () => {
      const alias = 'https://youtu.be/dQw4w9WgXcQ';
      read = settled({ ...VIDEO, refs: [VIDEO.uri, alias] });
      renderDetails(alias);

      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-uri', alias);
    });

    it('posts about the first web link of a resource whose own link is not one', () => {
      read = settled(bookFixture);
      renderDetails(bookFixture.uri);

      const actions = screen.getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-uri', 'isbn:9780140328721');
      expect(actions).toHaveAttribute('data-post-uri', bookFixture.also_on[0].uri);
    });

    it('has no link to post about for a resource without any web link', () => {
      read = settled({ ...bookFixture, also_on: [] });
      renderDetails(bookFixture.uri);

      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-post-uri', 'none');
    });

    it('shows an enriched card’s whole text and image with their sources', () => {
      read = settled(mbRecordingEnrichedFixture);
      renderDetails(mbRecordingEnrichedFixture.uri);

      const card = screen.getByTestId('resource-card');
      expect(within(card).getByTestId('resource-card-description')).toHaveTextContent(
        mbRecordingEnrichedFixture.description,
      );
      expect(within(card).getByTestId('resource-card-image')).toHaveAttribute('src', mbRecordingEnrichedFixture.image);
      const sources = within(card).getByRole('region', { name: 'Sources' });
      expect(
        within(sources)
          .getAllByRole('listitem')
          .map((line) => line.textContent),
      ).toEqual([
        'Text: Wikipedia (en), excerpt, about its MusicBrainz work · CC BY-SA 4.0',
        'Image: Queen · Wikimedia Commons · Public domain',
      ]);
    });

    it('names OpenStreetMap once under Sources on a place’s page, not on its card', () => {
      read = settled(placeFixture);
      renderDetails(placeFixture.uri);

      const card = within(screen.getByTestId('resource-card'));
      expect(card.queryByTestId('resource-card-attribution')).not.toBeInTheDocument();
      const sources = within(card.getByRole('region', { name: 'Sources' }));
      expect(sources.getAllByRole('listitem').map((line) => line.textContent)).toEqual(['Map data: OpenStreetMap']);
      expect(sources.getByTestId('resource-credit-source')).toHaveAttribute(
        'href',
        'https://www.openstreetmap.org/copyright',
      );
    });

    it('lists no map data on the page of a resource OpenStreetMap does not credit', () => {
      renderDetails(VIDEO.uri);

      expect(screen.getByTestId('resource-card')).not.toHaveTextContent('Map data');
    });

    it('merges into the card’s tag list the tags of its other links: group members, then Also on, by URI', () => {
      renderDetails(VIDEO.uri);

      const card = within(screen.getByTestId('resource-card'));
      expect(card.getByTestId('resource-actions')).toContainElement(card.getByTestId('resource-other-tag-list'));
      const links = otherLinks();
      // A member's written link is read, as is its canonical one; then the Also on entries not seen yet.
      expect(links.slice(0, 3)).toEqual([
        { uri: 'https://tidal.com/track/490851477', name: 'TIDAL' },
        { uri: 'https://music.apple.com/gb/song/1624945512', name: 'Apple Music' },
        { uri: 'https://music.apple.com/song/1624945512', name: 'Apple Music' },
      ]);
      const uris = links.map((link) => link.uri);
      expect(uris).not.toContain(VIDEO.uri);
      expect(new Set(uris).size).toBe(uris.length);
      // A derived Also on link nobody tagged is not read.
      expect(VIDEO.also_on.find((entry) => entry.derived)?.uri).toBe(
        'https://open.spotify.com/track/6JEK0CvvjDjjMUBFoXShNZ',
      );
      expect(uris).not.toContain('https://open.spotify.com/track/6JEK0CvvjDjjMUBFoXShNZ');
    });

    it('reads the Also on links’ tags when the group read failed, never the page link’s own spellings', () => {
      const alias = 'https://youtu.be/dQw4w9WgXcQ';
      read = settled({
        ...VIDEO,
        refs: [VIDEO.uri, alias],
        aliases: ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
        also_on: [
          { uri: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ', site: 'YouTube' },
          { uri: 'https://tidal.com/track/490851477', id: 'tidal', site: 'TIDAL' },
        ],
      });
      mockGroup.mockReturnValue(FAILED);
      renderDetails(alias);

      expect(otherLinks()).toEqual([{ uri: 'https://tidal.com/track/490851477', name: 'TIDAL' }]);
    });

    it('reads no other link while the group is read, so the chips do not reorder when it arrives', () => {
      mockGroup.mockReturnValue(LOADING);
      renderDetails(VIDEO.uri);

      expect(otherLinks()).toEqual([]);
    });

    it('reads the Also on links of a card outside a group', () => {
      read = settled({ ...VIDEO, group: null });
      mockGroup.mockReturnValue(settled(null));
      renderDetails(VIDEO.uri);

      expect(otherLinks()[0]).toEqual({ uri: 'https://tidal.com/track/490851477', name: 'TIDAL' });
    });
  });

  it.each<[string, () => void, string | null]>([
    ['is read', () => (read = LOADING), VIDEO.uri],
    ['is not known', () => (read = settled(null)), NOT_KNOWN],
    ['could not be read', () => (read = FAILED), VIDEO.uri],
    ['is not configured', () => (mocks.configured = false), VIDEO.uri],
    ['has no link', () => undefined, null],
  ])('has one page heading while the link %s', (_, arrange, uri) => {
    arrange();
    renderDetails(uri);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('External resource');
  });

  it('names the loading card for screen readers', () => {
    read = LOADING;
    renderDetails(VIDEO.uri);

    expect(screen.getByRole('region', { name: 'Loading external resource' })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the card skeleton while the link is read', () => {
    read = LOADING;
    renderDetails(VIDEO.uri);

    expect(screen.getByTestId('resource-card-skeleton')).toHaveAttribute('data-size', 'large');
    // The same frame as the card: its bottom zone of actions and tags too.
    expect(screen.getByTestId('resource-card-skeleton-actions')).toBeInTheDocument();
    expect(mockRelated).not.toHaveBeenCalled();
  });

  describe('when the link is not known', () => {
    it('says Pinakes does not know it and links out to it', () => {
      read = settled(null);
      renderDetails(NOT_KNOWN);

      expect(screen.getByText("Pinakes doesn't know this link yet")).toBeInTheDocument();
      const link = screen.getByTestId('resource-plain-link');
      expect(link).toHaveAttribute('href', NOT_KNOWN);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.queryByTestId('resource-card')).not.toBeInTheDocument();
    });

    it.each(['isbn:0000000000', 'javascript:alert(1)'])('shows %s as text, not a link', (uri) => {
      read = settled(null);
      renderDetails(uri);

      expect(screen.getByTestId('resource-plain-link')).toHaveTextContent(uri);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
  });

  it('says when the card could not be read and asks the page to read it again on Try again', () => {
    read = FAILED;
    renderDetails(VIDEO.uri);

    expect(screen.getByText('This external resource could not be loaded')).toBeInTheDocument();
    expect(screen.getByTestId('resource-plain-link')).toHaveAttribute('href', VIDEO.uri);

    fireEvent.click(screen.getByTestId('resource-retry'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says the details are not available, reading nothing, when Pinakes is not configured', () => {
    mocks.configured = false;
    renderDetails(NOT_KNOWN);

    expect(screen.getByText('External resource details are not available')).toBeInTheDocument();
    expect(screen.getByTestId('resource-plain-link')).toHaveAttribute('href', NOT_KNOWN);
  });

  it('says there is no link when the page has none', () => {
    renderDetails(null);

    expect(screen.getByText('No link to show')).toBeInTheDocument();
  });
});
