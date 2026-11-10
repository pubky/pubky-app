import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { usePinakesGroup } from '@/hooks/usePinakesGroup/usePinakesGroup';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import { usePinakesRelated } from '@/hooks/usePinakesRelated/usePinakesRelated';
import bookFixture from '@/services/pinakes/fixtures/by-uri.book.json';
import mbGroupEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-group.enriched.json';
import mbRecordingEnrichedFixture from '@/services/pinakes/fixtures/by-uri.mb-recording.enriched.json';
import missingFixture from '@/services/pinakes/fixtures/by-uri.missing.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import groupFixture from '@/services/pinakes/fixtures/group.video.json';
import relatedFixture from '@/services/pinakes/fixtures/search.related.json';
import type { TPinakesCard, TPinakesGroupDetail, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';
import { ResourceDetails } from './ResourceDetails';

const mocks = vi.hoisted(() => ({
  configured: true,
  replyCount: 2 as number | undefined,
  otherLinks: null as { uri: string; name: string }[] | null,
}));

// The second tag group's links are read once by the page; here only which links matters.
vi.mock('@/hooks/useOtherLinkTags/useOtherLinkTags', () => ({
  useOtherLinkTags: (links: { uri: string; name: string }[]) => {
    mocks.otherLinks = links;
    return { reads: [], isLoading: false };
  },
}));

// X's embed (react-tweet) loads nothing here: `tweet.state` is what X answers.
const tweet = vi.hoisted(() => ({ state: { data: null as unknown, error: null as unknown, isLoading: false } }));
vi.mock('react-tweet', () => ({
  useTweet: () => tweet.state,
  EmbeddedTweet: () => <div data-testid="twitter-tweet" />,
  TweetSkeleton: () => <div data-testid="twitter-tweet-skeleton" />,
  TweetNotFound: () => <div data-testid="twitter-tweet-not-found" />,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: () => mocks.configured, PINAKES_RELATED_LIMIT: 5 }));
vi.mock('@/hooks/usePinakesGroup/usePinakesGroup', () => ({ usePinakesGroup: vi.fn() }));
vi.mock('@/hooks/usePinakesRelated/usePinakesRelated', () => ({ usePinakesRelated: vi.fn() }));
// A card without an image asks the link's OpenGraph data; nothing is read here.
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
// The action row and tag bar have their own tests; here only what they are given matters.
vi.mock('@/organisms/ResourceActions/ResourceActions', () => ({
  ResourceActions: ({
    uri,
    spellings,
    spellingsByUri,
    postUri,
    collectionsCount,
    tagsLabel,
    linkUrl,
    title,
    extraMenuContent,
    otherTagList,
    playOn,
    size,
    replyCount,
  }: {
    uri: string;
    spellings?: readonly string[];
    spellingsByUri?: boolean;
    postUri?: string | null;
    collectionsCount?: number | null;
    tagsLabel: string;
    linkUrl?: string | null;
    title?: string | null;
    extraMenuContent?: unknown;
    otherTagList?: readonly { label: string }[];
    playOn?: React.ReactNode;
    size?: string;
    replyCount?: number;
  }) => (
    <div
      data-testid="resource-actions"
      data-reply-count={replyCount ?? 'none'}
      data-uri={uri}
      data-spellings={(spellings ?? []).join(' ')}
      data-spellings-by-uri={String(Boolean(spellingsByUri))}
      data-post-uri={postUri === undefined ? 'default' : (postUri ?? 'none')}
      data-collections={collectionsCount ?? 'none'}
      data-tags-label={tagsLabel}
      data-link-url={linkUrl === undefined ? 'default' : (linkUrl ?? 'none')}
      data-title={title ?? 'none'}
      data-extra-menu={extraMenuContent ? 'yes' : 'no'}
      data-size={size}
    >
      {playOn}
      <div data-testid="resource-other-tag-list" data-labels={otherTagList?.map((tag) => tag.label).join(',')} />
    </div>
  ),
}));
vi.mock('./ResourceReplies', () => ({
  ResourceReplies: ({ uri, replies }: { uri: string; replies: { uri: string | null } }) => (
    <div data-testid="resource-replies-stub" data-uri={uri} data-replies-uri={replies.uri} />
  ),
}));

const VIDEO: TPinakesResourceDetail = videoFixture;
/** The same video without its tracks on Spotify, Deezer and TIDAL: a video, no song (`isSong`). */
const ORDINARY_VIDEO: TPinakesResourceDetail = {
  ...VIDEO,
  also_on: VIDEO.also_on.filter((entry) => !['Spotify', 'Deezer', 'TIDAL'].includes(entry.site ?? '')),
};
const GROUP: TPinakesGroupDetail = groupFixture;
const RELATED: TPinakesCard[] = relatedFixture.items;
const NOT_KNOWN = 'https://example.com/pinakes-does-not-know-this-link-1104';
const X_URL = 'https://x.com/joenakamoto/status/2119830751713829276';
const X_POST: TPinakesResourceDetail = {
  ...VIDEO,
  uri: X_URL,
  refs: [X_URL],
  aliases: [],
  name: 'this guy has been on a rampage',
  description: 'this guy has been on a rampage pic.twitter.com/MZy4Mhd',
  site: 'x.com',
  type: 'SocialMediaPosting',
  type_path: ['Thing', 'CreativeWork', 'Article', 'SocialMediaPosting'],
  image: null,
  facts: { author: 'joenakamoto', author_name: 'Joe Nakamoto', published: '2026-11-09' },
  group: null,
  also_on: [],
};
const X_POST_WITH_ALSO_ON: TPinakesResourceDetail = {
  ...X_POST,
  also_on: [{ ...VIDEO.also_on[0], uri: 'https://bsky.app/profile/someone/post/3abc', site: 'Bluesky' }],
};

const settled = <T,>(data: T) => ({ data, isLoading: false, isError: false });
const otherLinks = (): { uri: string; name: string }[] => mocks.otherLinks ?? [];
const LOADING = { data: undefined, isLoading: true, isError: false };
const FAILED = { data: null, isLoading: false, isError: true };

let read: UsePinakesQueryResult<TPinakesResourceDetail>;
const onRetry = vi.fn();
/** The page's read of the thread (`ResourcePage` reads it and hands it down); its own test covers it. */
const pageReplies = () => ({
  uri: 'page-thread',
  replyIds: [],
  totalCount: 2,
  replyCount: mocks.replyCount,
  hasMore: false,
  showAll: false,
  isExpandingAll: false,
  expandAll: vi.fn(),
  addReply: vi.fn(),
});
const renderDetails = (uri: string | null) =>
  render(<ResourceDetails uri={uri} read={read} onRetry={onRetry} replies={pageReplies()} />);

describe('ResourceDetails', () => {
  const mockGroup = vi.mocked(usePinakesGroup);
  const mockRelated = vi.mocked(usePinakesRelated);

  beforeEach(() => {
    mocks.otherLinks = null;
    vi.clearAllMocks();
    mocks.configured = true;
    mocks.replyCount = 2;
    read = settled(VIDEO);
    mockGroup.mockReturnValue(settled(GROUP));
    mockRelated.mockReturnValue(settled(RELATED));
    tweet.state = { data: { id_str: '2119830751713829276' }, error: null, isLoading: false };
  });

  describe('when the link is known', () => {
    it('reads the card for the page’s link and shows it large, under the page’s heading, opened by its header alone', () => {
      read = settled(ORDINARY_VIDEO);
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

    it('puts the thread of the posts replying to the acted-on link under the card, as a post page does', () => {
      renderDetails(VIDEO.uri);

      const thread = screen.getByTestId('resource-replies-stub');
      expect(thread).toHaveAttribute('data-uri', VIDEO.uri);
      expect(thread).toHaveAttribute('data-replies-uri', 'page-thread');
      // After the card, not inside it.
      expect(within(screen.getByTestId('resource-details')).queryByTestId('resource-replies-stub')).toBeNull();
      // The Reply button counts what the thread counts.
      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-reply-count', '2');
    });

    it('gives the Reply button no number when Nexus does not count the replies', () => {
      mocks.replyCount = undefined;
      renderDetails(VIDEO.uri);

      expect(screen.getByTestId('resource-actions')).toHaveAttribute('data-reply-count', 'none');
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

    it('acts on the canonical link, reading the links people wrote along when it is not one of them', () => {
      read = settled(missingFixture);
      renderDetails(missingFixture.uri);

      // Nexus has the tags on the `gb` link people wrote: read along and shown as the card's.
      expect(missingFixture.refs).not.toContain(missingFixture.uri);
      const actions = screen.getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-uri', missingFixture.uri);
      expect(actions).toHaveAttribute('data-spellings', 'https://music.apple.com/gb/song/1440717826');
      // The page reads them on a Nexus without `by_ids` too.
      expect(actions).toHaveAttribute('data-spellings-by-uri', 'true');
      // "Post about this" gives the link people wrote, as a post's card does.
      expect(actions).toHaveAttribute('data-post-uri', 'https://music.apple.com/gb/song/1440717826');
    });

    it('acts on the canonical link on any spelling’s page, that spelling and the others read along', () => {
      const alias = 'https://youtu.be/dQw4w9WgXcQ';
      read = settled({ ...VIDEO, refs: [VIDEO.uri, alias], aliases: ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'] });
      renderDetails(alias);

      const actions = screen.getByTestId('resource-actions');
      expect(actions).toHaveAttribute('data-uri', VIDEO.uri);
      expect(actions).toHaveAttribute('data-spellings', `${alias} https://m.youtube.com/watch?v=dQw4w9WgXcQ`);
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
      read = settled(mbGroupEnrichedFixture);
      renderDetails(mbGroupEnrichedFixture.uri);

      const card = screen.getByTestId('resource-card');
      expect(within(card).getByTestId('resource-card-description')).toHaveTextContent(
        mbGroupEnrichedFixture.description!.slice(0, 40),
      );
      expect(within(card).getByTestId('resource-card-image')).toHaveAttribute('src', mbGroupEnrichedFixture.image);
      const sources = within(card).getByRole('region', { name: 'Sources' });
      const lines = within(sources)
        .getAllByRole('listitem')
        .map((line) => line.textContent);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^Text: Wikipedia/);
      expect(lines[1]).toMatch(/^Image: /);
    });

    it('shows a song as its player, paused, in place of its image and text, with its details, sources and footer', () => {
      read = settled(mbRecordingEnrichedFixture);
      renderDetails(mbRecordingEnrichedFixture.uri);

      const card = screen.getByTestId('resource-card');
      const player = within(card).getByTestId('resource-player-frame');
      expect(player).toHaveAttribute('src', 'https://open.spotify.com/embed/track/2OBofMJx94NryV2SK8p8Zf');
      expect(within(card).queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
      // No second card beside the player: no image, title link or description.
      expect(within(card).queryByTestId('resource-card-image')).not.toBeInTheDocument();
      expect(within(card).queryByTestId('resource-card-title')).not.toBeInTheDocument();
      expect(within(card).queryByTestId('resource-card-description')).not.toBeInTheDocument();
      // The page keeps its heading for screen readers, and everything outside the body.
      expect(within(card).getByRole('heading', { level: 2, name: mbRecordingEnrichedFixture.name })).toHaveClass(
        'sr-only',
      );
      expect(within(card).getByRole('region', { name: 'Sources' })).toBeInTheDocument();
      expect(within(card).getByRole('region', { name: 'Details' })).toBeInTheDocument();
      expect(within(card).getByTestId('resource-actions')).toBeInTheDocument();
    });

    it('shows a song as its card, with the switch above its image and text, with Card (no player) first in Players', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, playerOrder: ['card'] } });
      onTestFinished(() => {
        useSettingsStore.setState({ media: defaultMediaPreferences });
      });
      read = settled(mbRecordingEnrichedFixture);
      renderDetails(mbRecordingEnrichedFixture.uri);

      const card = screen.getByTestId('resource-card');
      expect(document.querySelector('iframe')).toBeNull();
      expect(within(card).getByRole('heading', { level: 2, name: mbRecordingEnrichedFixture.name })).not.toHaveClass(
        'sr-only',
      );
      expect(within(card).getByRole('button', { name: 'Card: choose another service' })).toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: /^Play on/ })).not.toBeInTheDocument();
    });

    it('plays a song on the service of the link the page was opened with', () => {
      read = settled(mbRecordingEnrichedFixture);
      renderDetails('https://tidal.com/track/534050211');

      expect(screen.getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://embed.tidal.com/tracks/534050211?hideOverlays=true',
      );
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

    it('reads the Also on links when the group read failed, never the card’s own spellings', () => {
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

      // The canonical link and its spellings (the mobile alias too) are the tag bar's, merged there.
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

  describe('an X post', () => {
    beforeEach(() => mockGroup.mockReturnValue(settled(null)));

    it('shows X’s embed as the card’s body when Pinakes knows it nowhere else, without the card’s own text or details', () => {
      read = settled(X_POST);
      renderDetails(X_URL);

      expect(within(screen.getByTestId('native-embed-body')).getByTestId('twitter-tweet')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-title')).toBeNull();
      expect(screen.queryByTestId('resource-card-description')).toBeNull();
      expect(screen.queryByTestId('resource-facts')).toBeNull();
      // The header, the footer and the page's headings stay.
      expect(screen.getByTestId('resource-card')).toHaveAttribute('data-size', 'large');
      expect(screen.getByTestId('resource-card-source').textContent).toBe('x.com');
      expect(screen.getByTestId('resource-card-source')).toHaveAccessibleName('Open in x.com');
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(X_POST.name!);
      expect(screen.getByTestId('resource-actions')).toBeInTheDocument();
      expect(screen.queryByTestId('show-embed')).toBeNull();
    });

    it('shows our card with Show on <site> when Pinakes knows it on other services too, X’s embed only from there', () => {
      read = settled(X_POST_WITH_ALSO_ON);
      renderDetails(X_URL);

      expect(screen.getByTestId('resource-card-title')).toHaveTextContent(X_POST.name!);
      expect(screen.getByTestId('resource-facts')).toBeInTheDocument();
      expect(screen.queryByTestId('twitter-tweet')).toBeNull();

      const show = within(screen.getByTestId('resource-actions')).getByTestId('show-embed');
      expect(show).toHaveAccessibleName('Show on x.com');
      fireEvent.click(show);
      expect(within(screen.getByTestId('native-embed-body')).getByTestId('twitter-tweet')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-card-title')).toBeNull();
      expect(screen.queryByTestId('resource-facts')).toBeNull();
      expect(screen.getByTestId('show-embed')).toHaveAccessibleName('Close the x.com post');

      fireEvent.click(screen.getByTestId('show-embed'));
      expect(screen.getByTestId('resource-card-title')).toBeInTheDocument();
    });

    it('shows our card with Show on 𝕏 to a viewer who turned platform embeds up front off', () => {
      useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } });
      try {
        read = settled(X_POST);
        renderDetails(X_URL);

        expect(screen.getByTestId('resource-card-title')).toHaveTextContent(X_POST.name!);
        expect(screen.getByTestId('resource-facts')).toBeInTheDocument();
        expect(screen.queryByTestId('twitter-tweet')).toBeNull();
        fireEvent.click(within(screen.getByTestId('resource-actions')).getByTestId('show-embed'));
        expect(within(screen.getByTestId('native-embed-body')).getByTestId('twitter-tweet')).toBeInTheDocument();
      } finally {
        act(() => useSettingsStore.setState({ media: defaultMediaPreferences }));
      }
    });

    it('shows our card, without Show on, when X cannot show the post', () => {
      tweet.state = { data: null, error: new Error('gone'), isLoading: false };
      read = settled(X_POST);
      renderDetails(X_URL);

      expect(screen.getByTestId('resource-card-title')).toHaveTextContent(X_POST.name!);
      expect(screen.getByTestId('resource-facts')).toBeInTheDocument();
      expect(screen.queryByTestId('native-embed-body')).toBeNull();
      expect(screen.queryByTestId('show-embed')).toBeNull();
    });

    it('shows X’s embed up front for a card Pinakes is still reading, as in a post', () => {
      read = settled({ ...X_POST, status: 'pending', name: null, description: null });
      renderDetails(X_URL);

      expect(within(screen.getByTestId('native-embed-body')).getByTestId('twitter-tweet')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(X_URL);
    });

    it('goes back to our card, without Show on, when X cannot show the post it was asked to', () => {
      tweet.state = { data: null, error: new Error('gone'), isLoading: false };
      read = settled(X_POST_WITH_ALSO_ON);
      renderDetails(X_URL);

      fireEvent.click(screen.getByTestId('show-embed'));
      expect(screen.getByTestId('resource-card-title')).toHaveTextContent(X_POST.name!);
      expect(screen.queryByTestId('native-embed-body')).toBeNull();
      expect(screen.queryByTestId('show-embed')).toBeNull();
    });

    it('gives a card the player of its other services back once X cannot show the post', () => {
      tweet.state = { data: null, error: new Error('gone'), isLoading: false };
      read = settled({
        ...X_POST,
        also_on: [{ id: 'yt', uri: 'https://www.youtube.com/watch?v=Om61naQC8is', site: 'YouTube' }],
      });
      renderDetails(X_URL);

      // Our card offers X's post, as in a post, not the other service's player.
      expect(screen.queryByTestId('play-on-main')).toBeNull();
      fireEvent.click(screen.getByTestId('show-embed'));
      fireEvent.click(screen.getByTestId('play-on-main'));
      expect(screen.getByTestId('resource-player')).toBeInTheDocument();
      expect(screen.queryByTestId('native-embed-body')).toBeNull();
    });

    it('keeps a video’s card, its text and details, with no platform embed', () => {
      read = settled({ ...VIDEO, also_on: [] });
      renderDetails(VIDEO.uri);

      expect(screen.getByTestId('resource-card-title')).toHaveTextContent(VIDEO.name!);
      expect(screen.queryByTestId('native-embed-body')).toBeNull();
      expect(screen.queryByTestId('show-embed')).toBeNull();
    });
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

    it.each([
      ['Pinakes is not configured', () => (mocks.configured = false)],
      ['the card could not be read', () => (read = FAILED)],
    ])('shows the posts replying to the link when %s: they come from Nexus', (_name, arrange) => {
      arrange();
      renderDetails(NOT_KNOWN);

      expect(screen.getByTestId('resource-replies-stub')).toHaveAttribute('data-uri', NOT_KNOWN);
    });

    it('still shows the posts replying to it, under the empty state, which then does not say nobody shared it', () => {
      read = settled(null);
      renderDetails(NOT_KNOWN);

      expect(screen.getByTestId('resource-replies-stub')).toHaveAttribute('data-uri', NOT_KNOWN);
      expect(screen.getByText('It has not been read yet.')).toBeInTheDocument();
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
