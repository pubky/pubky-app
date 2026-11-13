import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_VARIANT } from '@/config/ui';
import { PostController } from '@/controllers/post/post';
import { ResourceAlsoOn } from '@/molecules/ResourceCard/ResourceAlsoOn';
import { dedupeAlsoOn } from '@/molecules/ResourceCard/ResourceAlsoOn.utils';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import type { NexusTag } from '@/services/nexus/nexus.types';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceActions } from './ResourceActions';

const URI = 'https://open.spotify.com/track/5Z01UMMf7V1o0MzF86s6WJ';
const PUBKY_URI =
  'pubky://3jubjyq4fkh4dq38exrpuo8we6xta8a6rhxnjjzyoo7j4r3f4rjo/pub/loopky/decks/icvetu0ujilj/manifest.json';

const mocks = vi.hoisted(() => ({
  isSignedIn: true,
  signInRequests: 0,
  isMobile: false,
  bookmark: { isBookmarked: false, isLoading: false, isToggling: false, toggle: vi.fn() },
  collectionTargets: {
    collections: [{ id: 'me:c1', name: 'Workout', description: '', isSaved: false, isUpdating: false }],
    isCollectionsLoading: false,
    isCreatingCollection: false,
    hasMoreCollections: false,
    isCollectionsLoadingMore: false,
    loadMoreCollections: vi.fn(),
    toggleCollection: vi.fn(),
    createCollectionWithItem: vi.fn(),
  },
  collectionParams: null as null | { itemUris: readonly string[]; commitToggle: (id: string, add: boolean) => unknown },
  dialog: vi.fn(),
  replyDialog: vi.fn(),
  tags: {
    tags: [] as NexusTag[],
    isLoading: false,
    isError: false,
    isAtReadLimit: false,
    addTag: vi.fn(),
    toggleTag: vi.fn(),
  },
  tagsUri: null as string | null,
  tagsEnabled: [] as (boolean | undefined)[],
  tagsOptions: [] as ({ enabled?: boolean; spellings?: readonly string[] } | undefined)[],
  // The other links read (`useOtherLinkTags`), what they answered, and the group already read.
  otherLinkReads: [] as { links: { uri: string; name: string }[]; options?: { byIdsOnly?: boolean } }[],
  otherReads: [] as { link: { uri: string; name: string }; tags: NexusTag[] }[],
  groupArgs: [] as unknown[][],
  group: { data: null as unknown, isLoading: false },
  bookmarkActive: [] as (boolean | undefined)[],
  shareUrl: vi.fn(),
  copyToClipboard: vi.fn(),
  copyTitles: [] as (string | undefined)[],
  counts: undefined as
    undefined | null | { resourceId: string; replies?: number; embeds?: number; collections?: number },
  countsUri: null as string | null,
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mocks.isSignedIn,
    requireAuth: (action: () => unknown) => {
      if (mocks.isSignedIn) return action();
      mocks.signInRequests += 1;
      return undefined;
    },
    waitForAuth: async () => mocks.isSignedIn,
  }),
}));
vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({ useIsMobile: () => mocks.isMobile }));
vi.mock('@/hooks/useResourceTags/useResourceTags', () => ({
  useResourceTags: (uri: string, options?: { enabled?: boolean; spellings?: readonly string[] }) => {
    mocks.tagsUri = uri;
    mocks.tagsEnabled.push(options?.enabled);
    mocks.tagsOptions.push(options);
    return mocks.tags;
  },
}));
vi.mock('@/hooks/useOtherLinkTags/useOtherLinkTags', () => ({
  useOtherLinkTags: (links: { uri: string; name: string }[], options?: { byIdsOnly?: boolean }) => {
    mocks.otherLinkReads.push({ links, options });
    return { reads: links.length > 0 ? mocks.otherReads : [], isLoading: false };
  },
}));
vi.mock('@/hooks/usePinakesGroup/usePinakesGroup', () => ({
  usePinakesGroup: (...args: unknown[]) => {
    mocks.groupArgs.push(args);
    return mocks.group;
  },
}));
vi.mock('@/hooks/useResourceCounts/useResourceCounts', () => ({
  useResourceCounts: (uri: string, options?: { fetch?: boolean }) => {
    mocks.countsUri = uri;
    // A card reads no counts of its own: they come with its tags.
    if (options?.fetch) throw new Error('ResourceActions must not fetch the counts itself');
    return mocks.counts;
  },
}));
vi.mock('@/hooks/useShareUrl/useShareUrl', () => ({ useShareUrl: () => ({ shareUrl: mocks.shareUrl }) }));
vi.mock('@/hooks/useCopyToClipboard/useCopyToClipboard', () => ({
  useCopyToClipboard: (options: { successTitle?: string }) => {
    mocks.copyTitles.push(options.successTitle);
    return { copyToClipboard: mocks.copyToClipboard };
  },
}));
vi.mock('@/hooks/useResourceBookmark/useResourceBookmark', () => ({
  useResourceBookmark: (_uri: string, options?: { active?: boolean }) => {
    mocks.bookmarkActive.push(options?.active);
    return mocks.bookmark;
  },
}));
vi.mock('@/hooks/useCollectionSaveTargets/useCollectionSaveTargets', () => ({
  useCollectionSaveTargets: (params: typeof mocks.collectionParams) => {
    mocks.collectionParams = params;
    return mocks.collectionTargets;
  },
}));
vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: () => ({ sentinelRef: { current: null }, isStalled: false, resumeAutoLoad: vi.fn() }),
}));
vi.mock('@/controllers/post/post', () => ({ PostController: { commitUpdateCollectionResource: vi.fn() } }));
vi.mock('@/organisms/DialogNewPost/DialogNewPost', () => ({
  DialogNewPost: (props: { open: boolean; initialContent?: string }) => {
    mocks.dialog(props);
    return props.open ? <div data-testid="new-post-dialog">{props.initialContent}</div> : null;
  },
}));
vi.mock('@/organisms/DialogReply/DialogReply', () => ({
  DialogReply: (props: {
    open: boolean;
    resourceUri?: string;
    onOpenChangeAction: (open: boolean) => void;
    onReplySubmitted?: (replyId: string) => void;
  }) => {
    mocks.replyDialog(props);
    return props.open ? (
      <div data-testid="reply-dialog" data-resource-uri={props.resourceUri}>
        <button type="button" onClick={() => props.onOpenChangeAction(false)}>
          Close reply
        </button>
        <button type="button" onClick={() => props.onReplySubmitted?.('me:reply1')}>
          Send reply
        </button>
      </div>
    ) : null;
  },
}));
// The tag bar has its own test: here only what it is given matters.
vi.mock('./ResourceTagBar', () => ({
  ResourceTagBar: ({
    resourceTags,
    label,
    id,
    isExpanded,
    isAdding,
    onAddingChange,
    otherTags,
    uri,
  }: {
    resourceTags: { tags: NexusTag[] };
    label: string;
    id?: string;
    isExpanded: boolean;
    isAdding: boolean;
    onAddingChange: (isAdding: boolean) => void;
    otherTags?: readonly { label: string }[];
    uri?: string;
  }) => (
    <div
      id={id}
      role="group"
      aria-label={label}
      data-testid="resource-tag-bar-stub"
      data-tags={resourceTags.tags.length}
      data-expanded={isExpanded}
      data-adding={isAdding}
      data-other-tags={otherTags?.map((other) => other.label).join(',') ?? ''}
      data-uri={uri}
    >
      <button type="button" data-testid="tag-bar-add" onClick={() => onAddingChange(true)} />
    </div>
  ),
}));

const LINK = 'https://open.spotify.com/track/5Z01UMMf7V1o0MzF86s6WJ?si=1';

const tag = (label: string): NexusTag => ({
  label,
  taggers: ['a'],
  taggers_count: 1,
  relationship: false,
  tag_uri: null,
});

const renderActions = (collectionsCount?: number | null) =>
  render(
    <ResourceActions
      uri={URI}
      collectionsCount={collectionsCount}
      tagsLabel="Tags on this song"
      linkUrl={LINK}
      title="Bohemian Rhapsody"
    />,
  );

const openMenu = (name: RegExp | string) => {
  const trigger = screen.getByRole('button', { name });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
};

describe('ResourceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSignedIn = true;
    mocks.signInRequests = 0;
    mocks.isMobile = false;
    mocks.bookmark.isBookmarked = false;
    mocks.bookmark.isLoading = false;
    mocks.collectionTargets.collections[0].isSaved = false;
    mocks.tags.tags = [tag('queen'), tag('rock'), tag('70s')];
    mocks.tags.isLoading = false;
    mocks.tags.isError = false;
    mocks.tags.isAtReadLimit = false;
    mocks.shareUrl.mockResolvedValue(true);
    mocks.copyToClipboard.mockResolvedValue(true);
    mocks.copyTitles = [];
    mocks.tagsEnabled = [];
    mocks.tagsOptions = [];
    mocks.otherLinkReads = [];
    mocks.otherReads = [];
    mocks.groupArgs = [];
    mocks.group = { data: null, isLoading: false };
    mocks.bookmarkActive = [];
    mocks.counts = undefined;
    mocks.countsUri = null;
  });

  it.each([
    [undefined, 'default'],
    ['large', 'large'],
  ] as const)('takes the %s size of the card it closes', (size, expected) => {
    render(<ResourceActions uri={URI} tagsLabel="Tags on this song" size={size} />);

    const zone = screen.getByTestId('resource-actions');
    expect(zone).toHaveAttribute('data-size', expected);
  });

  it('lays out the post’s footer: the tags, then the post’s buttons in the post’s order', () => {
    renderActions(8);

    const zone = screen.getByTestId('resource-actions');
    expect(zone).toHaveAttribute('data-resource-controls');
    const footer = screen.getByTestId('resource-footer');
    expect(zone.children).toHaveLength(1);
    expect(zone.firstElementChild).toBe(footer);
    expect(footer).toHaveClass('flex-col', 'items-start', 'md:flex-row', 'md:justify-between');
    // Stacked in a narrow grid cell, as the post footer is.
    expect(footer).toHaveClass('@max-xl/grid:flex-col!', '@max-xl/grid:items-start!', '@max-xl/grid:gap-3!');
    expect(footer.children).toHaveLength(2);
    const tags = screen.getByTestId('resource-tag-bar-stub');
    expect(footer.firstElementChild).toBe(tags);
    expect(mocks.tagsUri).toBe(URI);
    expect(tags).toHaveAttribute('data-tags', '3');
    const row = screen.getByTestId('resource-action-row');
    expect(footer.lastElementChild).toBe(row);
    expect(row).toHaveClass('flex', 'flex-wrap', 'gap-2');
    expect(Array.from(row.children).map((child) => child.getAttribute('aria-label'))).toEqual([
      'Tags on this song (3)',
      'Reply to this external resource',
      'Post about this',
      'Save link (in 8 public collections)',
      'More options',
    ]);
  });

  it('reads the tags from the first time the card is on screen, and keeps them after', () => {
    const props = { uri: URI, tagsLabel: 'Tags on this song' };
    const { rerender } = render(<ResourceActions {...props} isOnScreen={false} />);
    expect(mocks.tagsEnabled.at(-1)).toBe(false);

    rerender(<ResourceActions {...props} isOnScreen />);
    expect(mocks.tagsEnabled.at(-1)).toBe(true);

    rerender(<ResourceActions {...props} isOnScreen={false} />);
    expect(mocks.tagsEnabled.at(-1)).toBe(true);
  });

  it('puts Play on on its own line above the footer, leaving the post’s tags and buttons as they are', () => {
    render(
      <ResourceActions
        uri={URI}
        tagsLabel="Tags on this song"
        linkUrl={LINK}
        playOn={<button type="button">Play on Spotify</button>}
      />,
    );

    const playerRow = screen.getByTestId('resource-player-row');
    expect(playerRow).toHaveTextContent('Play on Spotify');
    expect(playerRow.nextElementSibling).toBe(screen.getByTestId('resource-footer'));
    expect(screen.getByTestId('resource-action-row').firstElementChild).toBe(
      screen.getByTestId('resource-tags-button'),
    );
  });

  it('keeps the buttons on one row at their width beside the tags from md, like the post’s', () => {
    renderActions(8);

    const row = screen.getByTestId('resource-action-row');
    // The tags wrap instead: from md the row neither wraps nor shrinks; in a narrow grid cell it is stacked and may wrap.
    expect(row).toHaveClass('md:flex-nowrap', 'md:shrink-0', '@max-xl/grid:flex-wrap!');
    expect(row).not.toHaveClass('md:flex-wrap');
    expect(row).not.toHaveClass('md:shrink');
    expect(screen.getByTestId('resource-tag-bar-stub').nextElementSibling).toBe(row);
  });

  it('closes up the buttons on a narrow card, so ⋯ stays on their row', () => {
    renderActions(8);

    // Container queries on the footer's own width: a phone's card, a card in a quoted post.
    expect(screen.getByTestId('resource-actions')).toHaveClass('@container/resource-actions');
    expect(screen.getByTestId('resource-action-row')).toHaveClass(
      '@max-sm/resource-actions:gap-1.5',
      '@max-sm/resource-actions:[&>*]:px-2.5!',
      '@max-2xs/resource-actions:gap-1',
      '@max-2xs/resource-actions:[&>*]:gap-1!',
      '@max-2xs/resource-actions:[&>*]:px-2!',
      '@max-[14.5rem]/resource-actions:[&>*]:px-1.5!',
      '@max-[13.75rem]/resource-actions:gap-0.5',
      '@max-[13.5rem]/resource-actions:[&>*]:gap-0.5!',
      '@max-[13.5rem]/resource-actions:[&>*]:px-1!',
    );
  });

  it('gives the tag bar the link and the tags on the same thing’s other links, and adds no row', () => {
    const otherTagList = [{ label: 'rock', taggers: ['b'], count: 1, isComplete: true, sources: [] }];
    render(<ResourceActions uri={URI} tagsLabel="Tags on this song" otherTagList={otherTagList} size="large" />);

    // The bar merges them into its one list: an own chip counts across services, the rest are secondary.
    const bar = screen.getByTestId('resource-tag-bar-stub');
    expect(bar).toHaveAttribute('data-other-tags', 'rock');
    expect(bar).toHaveAttribute('data-uri', URI);
    const zone = screen.getByTestId('resource-actions');
    expect(zone.children).toHaveLength(1);
    expect(zone.firstElementChild).toBe(screen.getByTestId('resource-footer'));
  });

  describe('a card in a feed: the tags on its other links, as on the resource page', () => {
    // OK Computer's MusicBrainz release group (Pinakes, 2026-11-13), as a post writes it: its Also on has
    // the group's tagged members by canonical link, and derived links nobody tagged.
    const MB = 'https://musicbrainz.org/release-group/b1392450-e666-3926-a536-22c65f834433';
    const WRITTEN = `${MB}?tab=overview`;
    const SPOTIFY = 'https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE';
    const APPLE = 'https://music.apple.com/album/1097861387';
    const APPLE_REF = 'https://music.apple.com/us/album/ok-computer/1097861387';
    const DEEZER = 'https://www.deezer.com/album/14879699';
    const OK_COMPUTER: TPinakesResourceDetail = {
      ...videoFixture,
      id: 'e5cb1c655abb4b858e143a38c30ae2ab',
      uri: MB,
      site: 'MusicBrainz',
      refs: [MB],
      aliases: [],
      group: { id: '5a0742e3af4674075c34cafa6bc846c1', size: 4 },
      also_on: [
        { id: 'deezer-id', uri: DEEZER, site: 'Deezer' },
        { id: 'apple-id', uri: APPLE, site: 'Apple Music' },
        { id: 'spotify-id', uri: SPOTIFY, site: 'Spotify' },
        // Listed twice (a second entry for the same service), and the card's own link: read once, never as another's.
        { id: 'spotify-id', uri: SPOTIFY, site: 'Spotify' },
        { id: 'self', uri: MB, site: 'MusicBrainz' },
        // Derived links nobody tagged, an exact one and a match by metadata ("maybe"): never read.
        {
          uri: 'https://radiohead.bandcamp.com/album/ok-computer',
          site: 'Bandcamp',
          derived: true,
          via: 'musicbrainz',
        },
        { uri: 'https://tidal.com/album/58990510', site: 'TIDAL', derived: true, kind: 'maybe', via: 'musicbrainz' },
      ],
    };
    const target = { uri: MB, spellings: [WRITTEN] };
    const renderCard = (props: Partial<React.ComponentProps<typeof ResourceActions>> = {}) =>
      render(
        <ResourceActions
          uri={target.uri}
          spellings={target.spellings}
          tagsLabel="Tags on this album"
          card={OK_COMPUTER}
          {...props}
        />,
      );
    // The links the last render read (none when it read none).
    const lastOtherRead = () => mocks.otherLinkReads.at(-1) ?? { links: [], options: undefined };
    const userTag = (label: string, taggers: string[], relationship = false): NexusTag => ({
      label,
      taggers,
      taggers_count: taggers.length,
      relationship,
      tag_uri: null,
    });

    it('reads its tagged Also on links once its own tags are read, only in the `by_ids` batch, and merges them in', () => {
      mocks.tags.tags = [userTag('radiohead', ['a'])];
      mocks.otherReads = [
        { link: { uri: SPOTIFY, name: 'Spotify' }, tags: [userTag('album', ['b', 'c']), userTag('rock', ['b'])] },
        { link: { uri: DEEZER, name: 'Deezer' }, tags: [userTag('rock', ['d'])] },
      ];
      renderCard();

      expect(lastOtherRead().links).toEqual([
        { uri: DEEZER, name: 'Deezer' },
        { uri: APPLE, name: 'Apple Music' },
        { uri: SPOTIFY, name: 'Spotify' },
      ]);
      expect(lastOtherRead().options).toEqual({ byIdsOnly: true });
      // The resource page's one list (`mergeOtherLinkTags`): rock 2 (b and d) on two links before album 2 on one.
      expect(screen.getByTestId('resource-tag-bar-stub')).toHaveAttribute('data-other-tags', 'rock,album');
      // The group is never asked for: only a group another reader already read is used.
      expect(mocks.groupArgs.at(-1)).toEqual([OK_COMPUTER.group!.id, { cachedOnly: true }]);
    });

    it('reads the refs Pinakes gives with each Also on member on a cold card: no group read, no request of its own', () => {
      const DISCOGS = 'https://www.discogs.com/master/21491';
      const DISCOGS_REF = 'https://www.discogs.com/master/21491-Radiohead-OK-Computer';
      const cold: TPinakesResourceDetail = {
        ...OK_COMPUTER,
        also_on: [
          ...OK_COMPUTER.also_on.map((entry) => (entry.uri === APPLE ? { ...entry, refs: [APPLE_REF] } : entry)),
          { id: 'discogs-id', uri: DISCOGS, site: 'Discogs', refs: [DISCOGS_REF] },
        ],
      };
      mocks.group = { data: null, isLoading: false };
      renderCard({ card: cold });

      // In the first render its own read is enabled in, with the `by_ids`-only read: one batch window.
      expect(mocks.otherLinkReads[0].links.map((link) => link.uri)).toEqual([
        DEEZER,
        APPLE_REF,
        APPLE,
        SPOTIFY,
        DISCOGS_REF,
        DISCOGS,
      ]);
      expect(lastOtherRead().options).toEqual({ byIdsOnly: true });
      // Its own tags are still read and written on its own link and spellings alone.
      expect(mocks.tagsUri).toBe(MB);
      expect(mocks.tagsOptions.at(-1)).toMatchObject({ spellings: [WRITTEN] });
    });

    it('reads the members’ own refs too when the group was already read (the resource page’s), in the page’s order', () => {
      mocks.group = {
        data: {
          id: OK_COMPUTER.group!.id,
          curated: false,
          keys: [],
          members: [
            { ...OK_COMPUTER, also_on: [] },
            { ...videoFixture, id: 'apple-id', uri: APPLE, refs: [APPLE_REF], site: 'Apple Music' },
            { ...videoFixture, id: 'spotify-id', uri: SPOTIFY, refs: [SPOTIFY], site: 'Spotify' },
          ],
        },
        isLoading: false,
      };
      renderCard();

      expect(lastOtherRead().links.map((link) => link.uri)).toEqual([APPLE_REF, APPLE, SPOTIFY, DEEZER]);
    });

    it('reads nothing before it is first on screen, then its other links in the same render as its own tags', () => {
      const { rerender } = renderCard({ isOnScreen: false });
      expect(lastOtherRead().links).toEqual([]);
      expect(mocks.tagsEnabled.at(-1)).toBe(false);

      // Its own read starts and is under way, the group already read is still looked up: the other
      // links go in the same batch window, not one more batch after the own answer.
      mocks.tags.isLoading = true;
      mocks.group = { data: undefined, isLoading: true };
      rerender(<ResourceActions {...target} tagsLabel="Tags on this album" card={OK_COMPUTER} isOnScreen />);
      expect(mocks.tagsEnabled.at(-1)).toBe(true);
      expect(lastOtherRead().links.map((link) => link.uri)).toEqual([DEEZER, APPLE, SPOTIFY]);
      expect(lastOtherRead().options).toEqual({ byIdsOnly: true });
    });

    it('keeps reading and writing the tags on its own link and spellings, never on the other links', () => {
      renderCard();

      expect(mocks.tagsUri).toBe(MB);
      expect(mocks.tagsOptions.at(-1)).toMatchObject({ spellings: [WRITTEN] });
      expect(screen.getByTestId('resource-tag-bar-stub')).toHaveAttribute('data-uri', MB);
    });

    it('reads no other links without a card, and the page’s own list wins', () => {
      const otherTagList = [{ label: 'jazz', taggers: ['b'], count: 1, isComplete: true, sources: [] }];
      render(<ResourceActions uri={URI} tagsLabel="Tags on this song" otherTagList={otherTagList} size="large" />);

      expect(mocks.otherLinkReads.every(({ links }) => links.length === 0)).toBe(true);
      expect(mocks.groupArgs.at(-1)?.[0]).toBeUndefined();
      expect(screen.getByTestId('resource-tag-bar-stub')).toHaveAttribute('data-other-tags', 'jazz');
    });
  });

  it('shows the tags label only as the tag list’s name and the Tags button’s tooltip', () => {
    renderActions();

    expect(screen.getByRole('group', { name: 'Tags on this song' })).toBeInTheDocument();
    expect(screen.queryByText('Tags on this song')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-tags-button')).toHaveAttribute('title', 'Tags on this song (3)');
  });

  it('gives every button the post’s action style and has no bookmark button of its own', () => {
    renderActions();

    for (const button of within(screen.getByTestId('resource-action-row')).getAllByRole('button')) {
      expect(button).toHaveAttribute('data-variant', 'secondary');
      expect(button).toHaveClass('shadow-xs');
    }
    expect(screen.queryByRole('button', { name: /bookmark/i })).not.toBeInTheDocument();
  });

  it('fills every pill with the card colour, so it shows on the card’s muted surface like the post’s does', () => {
    renderActions(8);

    const row = screen.getByTestId('resource-action-row');
    expect(row.children).toHaveLength(5);
    for (const pill of Array.from(row.children)) {
      expect(pill).toHaveClass('bg-card', 'hover:bg-card/70');
      expect(pill).not.toHaveClass('bg-secondary', 'hover:bg-accent');
    }
  });

  it('keeps the post’s own pills on the page’s large card, which has the post card’s surface', () => {
    render(<ResourceActions uri={URI} collectionsCount={8} tagsLabel="Tags on this song" size="large" />);

    for (const button of within(screen.getByTestId('resource-action-row')).getAllByRole('button')) {
      expect(button).toHaveAttribute('data-variant', 'secondary');
      expect(button).toHaveClass('shadow-xs');
      expect(button).not.toHaveClass('bg-card');
    }
  });

  it('keeps the post’s own pills on a card that is the item itself, on the post card’s surface', () => {
    render(
      <ResourceSurfaceProvider surface="card">
        <ResourceActions uri={URI} collectionsCount={8} tagsLabel="Tags on this song" />
      </ResourceSurfaceProvider>,
    );

    const row = screen.getByTestId('resource-action-row');
    expect(row.children).toHaveLength(5);
    for (const pill of Array.from(row.children)) {
      expect(pill).toHaveClass('bg-action-pill', 'shadow-xs');
      expect(pill).not.toHaveClass('bg-card');
    }
  });

  describe('tags', () => {
    it.each([
      ['the labels Nexus returned', { tags: [tag('a'), tag('b')] }, '2'],
      ['none', { tags: [] }, '0'],
      [
        '20+ at the read limit',
        { tags: Array.from({ length: 20 }, (_, index) => tag(`t${index}`)), isAtReadLimit: true },
        '20+',
      ],
    ])('counts %s', (_name, state, shown) => {
      Object.assign(mocks.tags, state);
      renderActions();

      const button = screen.getByTestId('resource-tags-button');
      expect(button).toHaveTextContent(shown);
      expect(button).toHaveAccessibleName(`Tags on this song (${shown})`);
    });

    it.each([
      ['loading', { isLoading: true, tags: [] }],
      ['failed', { isError: true, tags: [] }],
    ])('shows no number while %s', (_name, state) => {
      Object.assign(mocks.tags, state);
      renderActions();

      const button = screen.getByTestId('resource-tags-button');
      expect(button).toHaveTextContent('');
      expect(button).toHaveAccessibleName('Tags on this song');
    });

    it('shows every tag and the tag input, and a few again on a second click', () => {
      renderActions();
      const tags = screen.getByTestId('resource-tag-bar-stub');
      const button = screen.getByTestId('resource-tags-button');
      expect(tags).toHaveAttribute('data-expanded', 'false');
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button);

      expect(tags).toHaveAttribute('data-expanded', 'true');
      expect(button).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(button);

      expect(tags).toHaveAttribute('data-expanded', 'false');
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button);

      expect(tags).toHaveAttribute('data-expanded', 'true');
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('points the Tags button at the tag list it expands', () => {
      renderActions();

      const tags = screen.getByTestId('resource-tag-bar-stub');
      expect(tags.id).not.toBe('');
      expect(screen.getByTestId('resource-tags-button')).toHaveAttribute('aria-controls', tags.id);
    });

    it('moves the buttons down beside the expanded tags from md, like the post’s', () => {
      renderActions();
      const footer = screen.getByTestId('resource-footer');
      expect(footer).toHaveClass('md:items-start');
      expect(footer).not.toHaveClass('md:items-end');

      fireEvent.click(screen.getByTestId('resource-tags-button'));

      expect(footer).toHaveClass('md:items-end');
      expect(footer).not.toHaveClass('md:items-start');
    });

    it('closes the "+" input when it expands or collapses the tags', () => {
      renderActions();
      const tags = screen.getByTestId('resource-tag-bar-stub');
      fireEvent.click(screen.getByTestId('tag-bar-add'));
      expect(tags).toHaveAttribute('data-adding', 'true');

      fireEvent.click(screen.getByTestId('resource-tags-button'));

      expect(tags).toHaveAttribute('data-adding', 'false');
      expect(tags).toHaveAttribute('data-expanded', 'true');
    });

    it('shows the tags signed out too, like the post’s (the input asks to sign in itself)', () => {
      mocks.isSignedIn = false;
      renderActions();

      fireEvent.click(screen.getByTestId('resource-tags-button'));

      expect(screen.getByTestId('resource-tag-bar-stub')).toHaveAttribute('data-expanded', 'true');
      expect(mocks.signInRequests).toBe(0);
    });
  });

  describe('reply', () => {
    it('opens the post’s reply dialog on the external resource, without a number', () => {
      renderActions();

      const button = screen.getByRole('button', { name: 'Reply to this external resource' });
      expect(button).toHaveTextContent('');
      expect(screen.queryByTestId('reply-dialog')).not.toBeInTheDocument();

      fireEvent.click(button);

      expect(screen.getByTestId('reply-dialog')).toHaveAttribute('data-resource-uri', URI);
      fireEvent.click(screen.getByRole('button', { name: 'Close reply' }));
      expect(screen.queryByTestId('reply-dialog')).not.toBeInTheDocument();
    });

    it('shows how many posts reply to the link, as Nexus counts them with its tags', () => {
      mocks.counts = { resourceId: 'r1', replies: 4, embeds: 2, collections: 1 };
      renderActions();

      expect(mocks.countsUri).toBe(URI);
      const button = screen.getByRole('button', { name: 'Reply to this external resource (4 replies)' });
      expect(button).toHaveTextContent('4');
    });

    it.each([
      ['Nexus has no record of the link', null],
      ['Nexus counts none', { resourceId: 'r1', replies: 0, embeds: 0 }],
    ])('shows 0 replies and 0 posts about it when %s, as a post shows its 0s', (_name, counts) => {
      mocks.counts = counts;
      renderActions();

      expect(screen.getByRole('button', { name: 'Reply to this external resource (0 replies)' })).toHaveTextContent(
        '0',
      );
      expect(screen.getByRole('button', { name: /^Post about this \(0 posts embed it\)/ })).toHaveTextContent('0');
    });

    it('shows no number on Reply and Post about this when Nexus does not serve their counts', () => {
      // A `by-uri` answer without the `*_count` fields: the record exists, its counts are unknown.
      mocks.counts = { resourceId: 'r1' };
      renderActions();

      expect(screen.getByRole('button', { name: 'Reply to this external resource' })).toHaveTextContent('');
      expect(screen.getByTestId('resource-post-button')).toHaveTextContent('');
    });

    it('takes the page thread’s count over Nexus’ and tells it the reply the dialog wrote', () => {
      mocks.counts = { resourceId: 'r1', replies: 4 };
      const onReplySubmitted = vi.fn();
      render(
        <ResourceActions
          uri={URI}
          tagsLabel="Tags on this song"
          size="large"
          replyCount={5}
          onReplySubmitted={onReplySubmitted}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Reply to this external resource (5 replies)' }));
      fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

      expect(onReplySubmitted).toHaveBeenCalledWith('me:reply1');
    });

    it('is disabled for a URI a reply cannot name as its parent (a pubky:// resource)', () => {
      render(<ResourceActions uri={PUBKY_URI} tagsLabel="Tags on this deck" />);

      expect(screen.queryByRole('button', { name: 'Reply to this external resource' })).not.toBeInTheDocument();
      const button = screen.getByRole('button', { name: 'Replies to this external resource are not supported' });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(screen.queryByTestId('reply-dialog')).not.toBeInTheDocument();
    });

    it('asks to sign in instead when signed out', () => {
      mocks.isSignedIn = false;
      renderActions();

      fireEvent.click(screen.getByRole('button', { name: 'Reply to this external resource' }));

      expect(screen.queryByTestId('reply-dialog')).not.toBeInTheDocument();
      expect(mocks.signInRequests).toBe(1);
    });

    it('replies on the resource page too, the resource being the parent', () => {
      render(<ResourceActions uri={URI} postUri={LINK} tagsLabel="Tags on this song" linkUrl={LINK} size="large" />);

      fireEvent.click(screen.getByRole('button', { name: 'Reply to this external resource' }));

      expect(screen.getByTestId('reply-dialog')).toHaveAttribute('data-resource-uri', URI);
    });
  });

  describe('collections', () => {
    it.each([
      [8, '8'],
      [0, null],
      [null, null],
      [undefined, null],
    ])('shows the public count %s as %s', (count, shown) => {
      renderActions(count);

      const button = screen.getByRole('button', { name: /^Save link/ });
      if (shown) expect(screen.getByTestId('resource-collections-count')).toHaveTextContent(shown);
      else {
        expect(screen.queryByTestId('resource-collections-count')).not.toBeInTheDocument();
        expect(button).toHaveAccessibleName('Save link');
        expect(button).toHaveClass('w-10');
      }
    });

    it('shows Nexus’ count of the collections holding the link over Pinakes’', () => {
      mocks.counts = { resourceId: 'r1', collections: 2 };
      renderActions(8);

      expect(screen.getByTestId('resource-collections-count')).toHaveTextContent('2');
    });

    it.each([
      ['in an own collection', { inOwnCollection: true, count: 0 }, 'saved'],
      ['only in public collections', { inOwnCollection: false, count: 3 }, 'collected'],
      ['nowhere', { inOwnCollection: false, count: 0 }, 'default'],
    ])('reads as the post’s save state when %s', (_name, state, iconState) => {
      mocks.collectionTargets.collections[0].isSaved = state.inOwnCollection;
      renderActions(state.count);

      const trigger = screen.getByRole('button', { name: /^Save link/ });
      expect(trigger.querySelector('[data-cy="post-save-trigger-icon"]')).toHaveAttribute('data-state', iconState);
    });

    it('reads the bookmark only while the picker is open, and shows it as saved there', async () => {
      mocks.bookmark.isBookmarked = true;
      renderActions();

      expect(mocks.bookmarkActive).not.toContain(true);

      openMenu(/^Save link/);

      await screen.findByText('Bookmarks');
      expect(mocks.bookmarkActive.at(-1)).toBe(true);
      const trigger = screen.getByTestId('resource-collections-button');
      expect(trigger.querySelector('[data-cy="post-save-trigger-icon"]')).toHaveAttribute('data-state', 'saved');
    });

    it('targets the link as the collection item and edits it as a resource', async () => {
      renderActions();

      expect(mocks.collectionParams?.itemUris).toEqual([URI]);
      await mocks.collectionParams?.commitToggle('me:c1', true);
      expect(PostController.commitUpdateCollectionResource).toHaveBeenCalledWith({
        collectionId: 'me:c1',
        uri: URI,
        shouldAdd: true,
      });
    });

    it('counts a collection holding another spelling of the link, and takes every spelling out', async () => {
      const share = `${URI}?si=share`;
      render(<ResourceActions uri={URI} spellings={[share]} tagsLabel="Tags on this song" linkUrl={LINK} />);

      expect(mocks.collectionParams?.itemUris).toEqual([URI, share]);
      await mocks.collectionParams?.commitToggle('me:c1', false);
      expect(PostController.commitUpdateCollectionResource).toHaveBeenCalledWith({
        collectionId: 'me:c1',
        uri: URI,
        shouldAdd: false,
        spellings: [share],
      });
    });

    it('hands a canonical link that is no web link (isbn:) to the collection write with its spellings', async () => {
      const isbn = 'isbn:9780141439518';
      render(<ResourceActions uri={isbn} spellings={[LINK]} tagsLabel="Tags on this book" linkUrl={LINK} />);

      await mocks.collectionParams?.commitToggle('me:c1', true);
      // `commitUpdateCollectionResource` writes the first spelling a collection can hold.
      expect(PostController.commitUpdateCollectionResource).toHaveBeenCalledWith({
        collectionId: 'me:c1',
        uri: isbn,
        shouldAdd: true,
        spellings: [LINK],
      });
    });

    it('opens the viewer’s bookmark and collections', async () => {
      renderActions(8);

      openMenu(/^Save link/);

      await waitFor(() => expect(screen.getByText('Workout')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Workout'));
      expect(mocks.collectionTargets.toggleCollection).toHaveBeenCalledWith('me:c1');
      fireEvent.click(screen.getByText('Bookmarks'));
      expect(mocks.bookmark.toggle).toHaveBeenCalledTimes(1);
    });

    it('marks the bookmark row when bookmarked and holds it while the bookmark loads', async () => {
      mocks.bookmark.isBookmarked = true;
      mocks.bookmark.isLoading = true;
      renderActions();

      openMenu(/^Save link/);

      const row = (await screen.findByText('Bookmarks')).closest('[data-cy="post-save-bookmarks-option"]');
      expect(row).toHaveAttribute('data-disabled');
    });

    it('asks to sign in instead of opening when signed out', () => {
      mocks.isSignedIn = false;
      renderActions();

      openMenu(/^Save link/);

      expect(screen.queryByText('Workout')).not.toBeInTheDocument();
      expect(mocks.signInRequests).toBeGreaterThan(0);
    });
  });

  describe('post about this', () => {
    it('opens the new-post composer with the link, without a number', () => {
      renderActions();
      expect(screen.queryByTestId('new-post-dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Post about this' })).toHaveTextContent('');

      fireEvent.click(screen.getByRole('button', { name: 'Post about this' }));

      expect(screen.getByTestId('new-post-dialog')).toHaveTextContent(URI);
      expect(mocks.dialog).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, initialContent: URI }));
    });

    it('posts about the web link it is given when the tagged link is not one', () => {
      render(<ResourceActions uri="isbn:9780140328721" postUri={URI} tagsLabel="Tags on this book" />);

      fireEvent.click(screen.getByRole('button', { name: 'Post about this' }));

      expect(mocks.dialog).toHaveBeenLastCalledWith(expect.objectContaining({ open: true, initialContent: URI }));
    });

    it('shows how many posts embed the link when Nexus counts them', () => {
      mocks.counts = { resourceId: 'r1', embeds: 3 };
      renderActions();

      expect(screen.getByRole('button', { name: 'Post about this (3 posts embed it)' })).toHaveTextContent('3');
    });

    it('is disabled for a resource with no web link', () => {
      render(<ResourceActions uri="isbn:9780140328721" postUri={null} tagsLabel="Tags on this book" />);

      const button = screen.getByRole('button', { name: 'Post about this' });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(screen.queryByTestId('new-post-dialog')).not.toBeInTheDocument();
    });

    it('asks to sign in when signed out', () => {
      mocks.isSignedIn = false;
      renderActions();

      fireEvent.click(screen.getByRole('button', { name: 'Post about this' }));

      expect(screen.queryByTestId('new-post-dialog')).not.toBeInTheDocument();
      expect(mocks.signInRequests).toBe(1);
    });
  });

  describe('more', () => {
    const menuLabels = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

    it('copies its link and copies its title, signed out too', async () => {
      mocks.isSignedIn = false;
      renderActions();

      openMenu('More options');

      await waitFor(() => expect(menuLabels()).toEqual(['Copy link', 'Copy link to page', 'Copy title']));
      expect(mocks.signInRequests).toBe(0);
    });

    it('copies the web link and the title', async () => {
      renderActions();

      openMenu('More options');
      fireEvent.click(await screen.findByText('Copy link'));
      await waitFor(() => expect(mocks.shareUrl).toHaveBeenCalledWith(LINK));

      openMenu('More options');
      fireEvent.click(await screen.findByText('Copy title'));
      await waitFor(() => expect(mocks.copyToClipboard).toHaveBeenCalledWith('Bohemian Rhapsody'));
      expect(mocks.copyTitles).toContain('Title copied');
    });

    it('copies the link to the resource’s page on Pubky, as a post’s menu copies the post’s', async () => {
      renderActions();

      openMenu('More options');
      fireEvent.click(await screen.findByText('Copy link to page'));

      await waitFor(() =>
        expect(mocks.shareUrl).toHaveBeenCalledWith(
          `${window.location.origin}/resource?${new URLSearchParams({ uri: URI }).toString()}`,
        ),
      );
    });

    it('copies the URI without a web link, and has no title item without a title', async () => {
      render(<ResourceActions uri="isbn:9780140328721" tagsLabel="Tags on this book" linkUrl={null} />);

      openMenu('More options');

      await waitFor(() => expect(menuLabels()).toEqual(['Copy link', 'Copy link to page']));
      fireEvent.click(screen.getByText('Copy link'));
      await waitFor(() => expect(mocks.shareUrl).toHaveBeenCalledWith('isbn:9780140328721'));
    });

    it('adds the extra entries after its own, in the menu’s variant', async () => {
      const extra = vi.fn(({ variant }: { variant: string }) => <div role="menuitem">{`Also on (${variant})`}</div>);
      render(<ResourceActions uri={URI} tagsLabel="Tags on this song" linkUrl={LINK} extraMenuContent={extra} />);

      openMenu('More options');

      await waitFor(() =>
        expect(menuLabels()).toEqual(['Copy link', 'Copy link to page', `Also on (${MENU_VARIANT.DROPDOWN})`]),
      );
    });

    it('lists the other services last, one row per service under "Also on", in a menu that scrolls', async () => {
      render(
        <ResourceActions
          uri={URI}
          tagsLabel="Tags on this song"
          linkUrl={LINK}
          title="Bohemian Rhapsody"
          extraMenuContent={({ variant, closeMenu }) => (
            <ResourceAlsoOn alsoOn={dedupeAlsoOn(videoFixture.also_on)} variant={variant} closeMenu={closeMenu} />
          )}
        />,
      );

      openMenu('More options');

      const menu = await screen.findByRole('menu');
      expect(menuLabels()).toEqual([
        'Copy link',
        'Copy link to page',
        'Copy title',
        'TIDAL',
        'Apple Music',
        'YouTube',
        'MusicBrainz',
        'Deezer',
        'Spotify',
      ]);
      expect(within(menu).getByRole('group', { name: 'Also on' })).toBeInTheDocument();
      expect(menu).toHaveClass('overflow-y-auto');
    });

    it('opens as a bottom sheet on a phone', async () => {
      mocks.isMobile = true;
      renderActions();

      fireEvent.click(screen.getByRole('button', { name: 'More options' }));

      const sheet = await screen.findByRole('dialog');
      expect(within(sheet).getByRole('button', { name: 'Copy title' })).toBeInTheDocument();
      expect(within(sheet).getByText('External resource actions')).toHaveClass('sr-only');
    });

    it('gives the extra entries the sheet variant and a way to close the sheet', async () => {
      mocks.isMobile = true;
      const extra = vi.fn(({ variant, closeMenu }: { variant: string; closeMenu: () => void }) => (
        <button type="button" onClick={closeMenu}>{`Also on (${variant})`}</button>
      ));
      render(<ResourceActions uri={URI} tagsLabel="Tags on this song" linkUrl={LINK} extraMenuContent={extra} />);

      fireEvent.click(screen.getByRole('button', { name: 'More options' }));
      const sheet = await screen.findByRole('dialog');
      fireEvent.click(within(sheet).getByRole('button', { name: `Also on (${MENU_VARIANT.SHEET})` }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('lists the other services in the sheet as links, which close it once followed', async () => {
      mocks.isMobile = true;
      render(
        <ResourceActions
          uri={URI}
          tagsLabel="Tags on this song"
          linkUrl={LINK}
          extraMenuContent={({ variant, closeMenu }) => (
            <ResourceAlsoOn alsoOn={dedupeAlsoOn(videoFixture.also_on)} variant={variant} closeMenu={closeMenu} />
          )}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'More options' }));
      const sheet = await screen.findByRole('dialog');
      expect(sheet).toHaveClass('overflow-y-auto');
      const group = within(sheet).getByRole('group', { name: 'Also on' });
      fireEvent.click(within(group).getByRole('link', { name: 'TIDAL' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });
});
