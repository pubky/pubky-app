import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichedPostDetails } from '@/application/moderation/moderation.types';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { PostController } from '@/controllers/post/post';
import { CollectionResourceItems } from '@/organisms/Collections/CollectionResourceItems/CollectionResourceItems';
import { DialogReply } from '@/organisms/DialogReply/DialogReply';
import { DialogRepost } from '@/organisms/DialogRepost/DialogRepost';
import { PostContent } from '@/organisms/PostContent/PostContent';
import { PostInput } from '@/organisms/PostInput/PostInput';
import { POST_INPUT_VARIANT } from '@/organisms/PostInput/PostInput.constants';
import type { NexusTag } from '@/services/nexus/nexus.types';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { defaultMediaPreferences } from '@/stores/settings/settings.types';

/**
 * A post's external resource where the post is shown inside another surface: a quote in the feed, the
 * Repost dialog's original post, the new-post and edit composers. The real render path runs end to
 * end (PostContent → PostPreviewCard → PostContentBase → PostLinkEmbeds → the Native and Generic
 * providers → the resource frame → ResourceActions, ResourceTagBar and TagInput; PostInput and
 * DialogRepost for the composers). Only IO is replaced: post rows, Pinakes cards, the resource's
 * tags and counts, the quoted post's own tags, counts and save targets, auth, controllers and the
 * editor-heavy composer leaves.
 */

const mocks = vi.hoisted(() => ({
  isSignedIn: true,
  signInRequests: 0,
  navigateToPost: vi.fn(),
  routerPush: vi.fn(),
  posts: new Map<string, unknown>(),
  reposts: new Map<string, { originalPostId: string | null; embedUrl: string | null }>(),
  cards: new Map<string, unknown>(),
  postDetailsIds: [] as string[],
  tagUris: [] as string[],
  tags: [] as NexusTag[],
  addTag: vi.fn(),
  toggleTag: vi.fn(),
  postTagIds: [] as string[],
  togglePostTag: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: mocks.isSignedIn,
    isWaiting: false,
    requireAuth: (action: () => unknown) => {
      if (mocks.isSignedIn) return action();
      mocks.signInRequests += 1;
      return undefined;
    },
    waitForAuth: async () => mocks.isSignedIn,
  }),
}));

// Post rows (local-first reads) and the post's own navigation
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: (postId: string) => {
    mocks.postDetailsIds.push(postId);
    return { postDetails: mocks.posts.get(postId) ?? null, isLoading: false };
  },
}));
vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => ({
  useRepostInfo: (postId: string) => {
    const info = mocks.reposts.get(postId) ?? { originalPostId: null, embedUrl: null };
    return {
      ...info,
      isRepost: info.originalPostId !== null,
      isReply: false,
      repostAuthorId: null,
      isCurrentUserRepost: false,
      isLoading: false,
      hasError: false,
    };
  },
}));
vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: () => ({ navigateToPost: mocks.navigateToPost }),
}));
vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: () => ({ ref: () => {}, isVisible: true }),
}));
// Db-backed author row; not what is tested here.
vi.mock('@/organisms/PostHeader/PostHeader', () => ({ PostHeader: () => null }));

// Pinakes and the resource's social data
vi.mock('@/config/pinakes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/pinakes')>()),
  isPinakesConfigured: () => true,
}));
vi.mock('@/hooks/usePinakesCard/usePinakesCard', () => ({
  usePinakesCard: (url: string | null) => ({
    data: url ? mocks.cards.get(url) : undefined,
    isLoading: false,
    isError: false,
    isResolving: false,
  }),
}));
vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: () => {}, isVisible: true }),
}));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));
vi.mock('@/molecules/ResourcePlayer/ResourcePlayerFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/molecules/ResourcePlayer/ResourcePlayerFrame')>()),
  AnimatedHeight: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/useResourceTags/useResourceTags', () => ({
  useResourceTags: (uri: string) => {
    mocks.tagUris.push(uri);
    return {
      tags: mocks.tags,
      isLoading: false,
      isError: false,
      isAtReadLimit: false,
      addTag: mocks.addTag,
      toggleTag: mocks.toggleTag,
    };
  },
}));
vi.mock('@/hooks/useResourceCounts/useResourceCounts', () => ({
  useResourceCounts: (uri: string) => ({ resourceId: uri, replies: 0, embeds: 0, collections: 0 }),
}));
vi.mock('@/hooks/useResourceBookmark/useResourceBookmark', () => ({
  useResourceBookmark: () => ({ isBookmarked: false, isLoading: false, isToggling: false, toggle: vi.fn() }),
}));
vi.mock('@/hooks/useCollectionSaveTargets/useCollectionSaveTargets', () => ({
  useCollectionSaveTargets: () => ({
    collections: [],
    isCollectionsLoading: false,
    isCreatingCollection: false,
    hasMoreCollections: false,
    isCollectionsLoadingMore: false,
    loadMoreCollections: vi.fn(),
    toggleCollection: vi.fn(),
    createCollectionWithItem: vi.fn(),
  }),
}));
vi.mock('@/hooks/useEnrichedTags/useEnrichedTags', () => ({
  useEnrichedTags: (tags: unknown[]) => ({ enrichedTags: tags, isLoading: false }),
}));
vi.mock('@/hooks/useTagSuggestions/useTagSuggestions', () => ({ useTagSuggestions: () => ({ suggestions: [] }) }));
vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({ useIsMobile: () => false }));

// The composer's IO boundary, as in PostInput.edit.integration.test.tsx
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitCreate: vi.fn(),
    commitEdit: vi.fn(),
    getDetails: vi.fn(),
    commitUpdateCollectionResource: vi.fn(),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    commitCreate: vi.fn(),
    commitDelete: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue([]),
    fetchFiles: vi.fn().mockResolvedValue(undefined),
    getFileUrl: vi.fn(() => 'https://cdn.example.com/file'),
  },
}));
vi.mock('@/hooks/useAttachmentsMetadata/useAttachmentsMetadata', () => ({
  useAttachmentsMetadata: () => ({ files: [], isLoading: false }),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' }),
}));
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => ({ currentUserPubky: null, userDetails: null }),
}));
vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({ useSessionNeedsUpgrade: () => false }));
vi.mock('@/stores/locksAuth/locksAuth.store', () => ({
  useLocksAuthStore: {
    getState: () => ({ selectIsLocksAuthenticated: () => false, selectIsPaykitConnected: () => false }),
  },
}));
vi.mock('@/config/network', () => ({ getLockServer: () => undefined, getPaykitServerUrl: () => undefined }));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/useLockFile/useLockFile', () => ({ useLockFile: () => ({ lockFile: null, price: null }) }));
vi.mock('@/hooks/useMentionAutocomplete/useMentionAutocomplete', () => ({
  useMentionAutocomplete: () => ({
    users: [],
    isOpen: false,
    selectedIndex: 0,
    setSelectedIndex: vi.fn(),
    handleKeyDown: vi.fn(),
  }),
}));
vi.mock('@/hooks/useUndoRepost/useUndoRepost', () => ({ useUndoRepost: () => ({ undoRepost: vi.fn() }) }));
// The quoted post's own footer (PostInlineTagsActions): the post's tags and counts.
vi.mock('@/hooks/usePostTags/usePostTags', () => ({
  usePostTags: (postId: string | null) => {
    if (postId) mocks.postTagIds.push(postId);
    return {
      tags: [{ label: 'quoted', taggers: [], taggers_count: 1, relationship: false }],
      count: 1,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      handleTagAdd: vi.fn(),
      handleTagToggle: mocks.togglePostTag,
    };
  },
}));
vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: () => ({ postCounts: { tags: 0, unique_tags: 0, replies: 4, reposts: 0 }, isLoading: false }),
}));
vi.mock('@/hooks/usePostSaveTargets/usePostSaveTargets', async () => {
  const { idlePostSaveTargets } = await import('@/test/mocks/usePostSaveTargets');
  return { usePostSaveTargets: () => idlePostSaveTargets };
});
vi.mock('@/molecules/MarkdownEditor/MarkdownEditor', () => ({ MarkdownEditor: () => null }));
vi.mock('@/molecules/DialogLockContent/DialogLockContent', () => ({ DialogLockContent: () => null }));
vi.mock('@/organisms/DialogLocksAuth/DialogLocksAuth', () => ({ DialogLocksAuth: () => null }));
vi.mock('@/molecules/MentionPopover/MentionPopover', () => ({ MentionPopover: () => null }));
vi.mock('@/molecules/PostInputAttachments/PostInputAttachments', () => ({ PostInputAttachments: () => null }));

const OUTER_AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const QUOTED_AUTHOR = '3jubjyq4fkh4dq38exrpuo8we6xta8a6rhxnjjzyoo7j4r3f4rjo';
const OUTER = `${OUTER_AUTHOR}:0034OUTER0001`;
const QUOTED = `${QUOTED_AUTHOR}:0034QUOTED001`;
const BURIED = `${OUTER_AUTHOR}:0034BURIED001`;
const LINKED = `${QUOTED_AUTHOR}:0034LINKED001`;

// Each resource is written as an alias: its tags, replies and saves go to the card's canonical link.
const VIDEO_WRITTEN = 'https://youtu.be/dQw4w9WgXcQ';
const VIDEO_CARD: TPinakesResourceDetail = {
  ...videoFixture,
  also_on: [],
  refs: [videoFixture.uri, VIDEO_WRITTEN],
};
const ARTICLE_WRITTEN = 'https://en.m.wikipedia.org/wiki/Bitcoin';
const ARTICLE_CARD: TPinakesResourceDetail = { ...articleFixture, refs: [articleFixture.uri, ARTICLE_WRITTEN] };

// How many third-party frames the resource loads up front: the video's platform embed (no Also
// on), none for the article.
const RESOURCES = [
  { name: 'a video (Native provider)', written: VIDEO_WRITTEN, card: VIDEO_CARD, frames: 1 },
  { name: 'a web article (Generic provider)', written: ARTICLE_WRITTEN, card: ARTICLE_CARD, frames: 0 },
];
// A song on Spotify, also on TIDAL and YouTube (players) and Apple Music: its player up front, with a switch.
const SONG_WRITTEN = musicFixture.uri;
const SONG_CARD: TPinakesResourceDetail = {
  ...musicFixture,
  also_on: [
    { id: 'a', uri: 'https://music.apple.com/song/1624945512', site: 'Apple Music' },
    { id: 't', uri: 'https://tidal.com/track/490851477', site: 'TIDAL' },
    { id: 'y', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', site: 'YouTube' },
  ],
};

const SHORT_TAGS: NexusTag[] = ['punk', 'rock', '2000s', 'video', 'band', 'live', 'cover'].map((label) => ({
  label,
  taggers: ['a'],
  taggers_count: 1,
  relationship: false,
  tag_uri: null,
}));

const post = (compositeId: string, content: string): EnrichedPostDetails => {
  const [author, id] = compositeId.split(':');
  return {
    id: compositeId,
    content,
    indexed_at: 1,
    kind: 'short',
    uri: `pubky://${author}/pub/social/v1/posts/${id}`,
    attachments: null,
    is_moderated: false,
    is_blurred: false,
  };
};

/** `OUTER` quotes `QUOTED`, which embeds `written`. */
const givenQuoteOfResource = (written: string, card: TPinakesResourceDetail | null) => {
  mocks.posts.set(OUTER, post(OUTER, 'Look at this'));
  mocks.reposts.set(OUTER, { originalPostId: QUOTED, embedUrl: null });
  mocks.posts.set(QUOTED, post(QUOTED, `Sum41 ${written}`));
  mocks.reposts.set(QUOTED, { originalPostId: null, embedUrl: written });
  if (card) mocks.cards.set(written, card);
};

const quoteCard = () => {
  const cards = document.querySelectorAll<HTMLElement>('[data-cy="post-preview-card"]');
  expect(cards).toHaveLength(1);
  return cards[0];
};
/** The resource's box: the Native provider's, or the Generic one's. */
const resourceIn = (container: HTMLElement) => {
  const box = container.querySelector<HTMLElement>(
    '[data-testid="native-embed-resource"], [data-testid="resource-preview"]',
  );
  if (!box) throw new Error('No external resource rendered');
  return box;
};
const chipLabels = (scope: HTMLElement) =>
  Array.from(within(scope).getByTestId('resource-tag-bar').querySelectorAll('[data-cy="post-tag"]')).map((chip) =>
    chip.getAttribute('data-tag-label'),
  );
/** Expanded, the bar is the post's tags panel: one `Tag` per line, named by its `tag-name`. */
const panelTagLabels = (scope: HTMLElement) =>
  within(within(scope).getByTestId('resource-tag-bar'))
    .getAllByTestId('tag-name')
    .map((name) => name.textContent);
const tagInputIn = (scope: HTMLElement) => {
  const input = scope.querySelector<HTMLInputElement>('[data-cy="add-tag-input"]');
  if (!input) throw new Error('No resource tag input');
  return input;
};
/** "+", then a tag typed and Enter, inside the resource's footer. */
const addResourceTag = async (resource: HTMLElement, label: string) => {
  fireEvent.click(within(resource).getByRole('button', { name: 'Add new tag' }));
  const input = tagInputIn(resource);
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: label } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mocks.addTag).toHaveBeenCalledWith(label));
  return input;
};
const iframes = () => document.querySelectorAll('iframe');
/** Rendered under the app root's tooltip provider. */
const show = (ui: ReactElement) => render(ui, { wrapper: TooltipProvider });
/**
 * A press inside a player's frame (the pointer is over it, it takes the focus, the page blurs), as
 * `useFramePress` reads it.
 */
const pressInside = async (frame: HTMLElement) => {
  act(() => {
    fireEvent.mouseOver(frame);
    frame.focus();
    window.dispatchEvent(new Event('blur'));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
};
/** A player that may dock once it scrolls away (`PlayerDock`'s keep-playing mark). */
const dockablePlayer = () => document.querySelector('[data-keep-playing]');
/**
 * Inside a post being written (a composer's preview, a dialog's original), Reply and "Post about
 * this" would open another composer over it: shown disabled, with their counts, opening nothing.
 */
const expectWritingActionsDisabled = (resource: HTMLElement) => {
  const reply = within(resource).getByTestId('resource-reply-button');
  const postAbout = within(resource).getByTestId('resource-post-button');
  for (const button of [reply, postAbout]) {
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName(expect.stringContaining('not available while writing a post'));
    expect(button).toHaveTextContent('0');
  }
  const dialogs = screen.queryAllByRole('dialog').length;
  fireEvent.click(reply);
  fireEvent.click(postAbout);
  expect(screen.queryAllByRole('dialog')).toHaveLength(dialogs);
  // Tags, Save and ⋯ stay usable
  expect(within(resource).getByTestId('resource-tags-button')).toBeEnabled();
  expect(within(resource).getByRole('button', { name: /^Save/ })).toBeEnabled();
  expect(within(resource).getByRole('button', { name: /^More/ })).toBeEnabled();
};
const expectNoPostTargets = () => {
  for (const uri of mocks.tagUris) {
    expect(uri.startsWith('pubky://')).toBe(false);
    expect([OUTER, QUOTED, BURIED, LINKED]).not.toContain(uri);
  }
};

describe('PostLinkEmbeds - an external resource inside a post preview (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSignedIn = true;
    mocks.signInRequests = 0;
    mocks.posts.clear();
    mocks.reposts.clear();
    mocks.cards.clear();
    mocks.postDetailsIds = [];
    mocks.tagUris = [];
    mocks.postTagIds = [];
    mocks.tags = SHORT_TAGS.slice(0, 2);
    mocks.addTag.mockResolvedValue({ success: true });
    useSettingsStore.setState({ media: defaultMediaPreferences });
  });

  afterEach(() => {
    useSettingsStore.setState({ media: defaultMediaPreferences });
  });

  describe('outer post → quoted post → external resource', () => {
    it.each(RESOURCES)(
      'keeps the full resource frame with its own footer on the canonical link for $name',
      ({ written, card, frames }) => {
        givenQuoteOfResource(written, card);
        show(<PostContent postId={OUTER} />);

        const quote = quoteCard();
        const resource = resourceIn(quote);
        const frame = within(resource).getByTestId(/^resource-(card|embed-frame)$/);
        // The footer belongs to the resource's own frame, not to the quote or the outer post
        expect(within(frame).getByTestId('resource-actions')).toBeInTheDocument();
        expect(within(frame).getByTestId('resource-tag-bar')).toBeInTheDocument();
        expect(new Set(mocks.tagUris)).toEqual(new Set([card.uri]));
        expect(card.uri).not.toBe(written);
        expectNoPostTargets();
        // The quoted post has its own footer, on its own id, outside the resource's frame
        expect(mocks.postTagIds).toContain(QUOTED);
        expect(mocks.postTagIds).not.toContain(OUTER);
        expect(frame).not.toContainElement(within(quote).getByRole('button', { name: 'Reply to post (4)' }));
        const quoteTag = quote.querySelector<HTMLElement>('[data-cy="post-tag"][data-tag-label="quoted"]');
        expect(quoteTag).not.toBeNull();
        expect(frame).not.toContainElement(quoteTag);
        // Its tag toggles the quoted post's tag, without opening the quoted post
        fireEvent.click(quoteTag as HTMLElement);
        expect(mocks.togglePostTag).toHaveBeenCalledTimes(1);
        expect(mocks.navigateToPost).not.toHaveBeenCalled();
        // Exactly the frames of its own post: the embed is kept, and the quote never adds a second
        expect(iframes()).toHaveLength(frames);
        // A feed quote is no post being written: Reply and Post about this are open
        expect(within(frame).getByTestId('resource-reply-button')).toBeEnabled();
        expect(within(frame).getByTestId('resource-post-button')).toBeEnabled();

        // The quote itself still opens the quoted post, not the resource
        fireEvent.click(quote);
        expect(mocks.navigateToPost).toHaveBeenCalledWith(QUOTED);
      },
    );

    it.each(RESOURCES)('tags $name from the quote without navigating to the quoted post', async ({ written, card }) => {
      givenQuoteOfResource(written, card);
      show(<PostContent postId={OUTER} />);

      const resource = resourceIn(quoteCard());
      const input = await addResourceTag(resource, 'punk');

      expect(mocks.tagUris.at(-1)).toBe(card.uri);
      // Neither the "+" click nor Enter in the input reaches the quote's click/keyboard navigation
      expect(mocks.navigateToPost).not.toHaveBeenCalled();
      expect(mocks.routerPush).not.toHaveBeenCalled();
      expect(input).toHaveFocus();
    });
  });

  describe('outer post → quoted post → song (Generic provider)', () => {
    it('shows the song’s player, its switch and its footer, as its own post does', () => {
      givenQuoteOfResource(SONG_WRITTEN, SONG_CARD);
      show(<PostContent postId={OUTER} />);

      const quote = quoteCard();
      const frame = within(resourceIn(quote)).getByTestId('resource-embed-frame');
      expect(within(frame).getByTestId('resource-player-frame')).toHaveAttribute(
        'src',
        'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP',
      );
      expect(within(frame).getByRole('button', { name: /choose another service$/ })).toBeInTheDocument();
      expect(within(frame).getByTestId('resource-actions')).toBeInTheDocument();
      expect(new Set(mocks.tagUris)).toEqual(new Set([SONG_CARD.uri]));
      expect(iframes()).toHaveLength(1);

      // The quote's own surface still opens the quoted post
      fireEvent.click(quote);
      expect(mocks.navigateToPost).toHaveBeenCalledWith(QUOTED);
    });

    it('shows the stand-in and loads nothing with platform embeds up front off', () => {
      act(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } }));
      givenQuoteOfResource(SONG_WRITTEN, SONG_CARD);
      show(<PostContent postId={OUTER} />);

      const resource = resourceIn(quoteCard());
      expect(
        within(within(resource).getByTestId('embed-player')).getByRole('button', { name: 'Play on Spotify' }),
      ).toBeInTheDocument();
      expect(within(resource).getByTestId('resource-actions')).toBeInTheDocument();
      expect(iframes()).toHaveLength(0);
    });

    it('lets a feed quote’s pressed player dock, as in its own post', async () => {
      givenQuoteOfResource(SONG_WRITTEN, SONG_CARD);
      show(<PostContent postId={OUTER} />);

      await pressInside(within(resourceIn(quoteCard())).getByTestId('resource-player-frame'));
      expect(dockablePlayer()).not.toBeNull();
    });

    it('never docks the player of the Repost dialog’s original, also once pressed', async () => {
      givenQuoteOfResource(SONG_WRITTEN, SONG_CARD);
      show(<DialogRepost postId={QUOTED} open onOpenChangeAction={vi.fn()} />);

      const resource = resourceIn(quoteCard());
      const player = within(resource).getByTestId('resource-player-frame');
      expect(player).toHaveAttribute('src', 'https://open.spotify.com/embed/track/1YQWosTIljIvxAgHWTp7KP');
      await pressInside(player);
      expect(dockablePlayer()).toBeNull();
    });
  });

  describe('outer post → quoted post → quoted post', () => {
    const givenQuoteOfQuote = () => {
      const linkedUrl = `${window.location.origin}/post/${QUOTED_AUTHOR}/0034LINKED001`;
      mocks.posts.set(OUTER, post(OUTER, 'Outer'));
      mocks.reposts.set(OUTER, { originalPostId: QUOTED, embedUrl: null });
      // The quoted post quotes another post (with an external resource) and links a third in its text
      mocks.posts.set(QUOTED, post(QUOTED, `test ${linkedUrl}`));
      mocks.reposts.set(QUOTED, { originalPostId: BURIED, embedUrl: null });
      mocks.posts.set(BURIED, post(BURIED, `Buried ${VIDEO_WRITTEN}`));
      mocks.reposts.set(BURIED, { originalPostId: null, embedUrl: VIDEO_WRITTEN });
      mocks.posts.set(LINKED, post(LINKED, 'Linked post'));
      mocks.cards.set(VIDEO_WRITTEN, VIDEO_CARD);
    };
    const expectOneLayer = () => {
      quoteCard();
      expect(screen.queryByText(/Buried/)).not.toBeInTheDocument();
      expect(screen.queryByText('Linked post')).not.toBeInTheDocument();
      expect(mocks.postDetailsIds).not.toContain(BURIED);
      expect(mocks.postDetailsIds).not.toContain(LINKED);
      // The buried post's resource is not promoted into the visible quote
      expect(screen.queryByTestId('native-embed-resource')).not.toBeInTheDocument();
      expect(screen.queryByTestId('resource-actions')).not.toBeInTheDocument();
      expect(iframes()).toHaveLength(0);
    };

    it('shows one quoted post in the feed, without the second quote, its resource or an in-app link', () => {
      givenQuoteOfQuote();
      show(<PostContent postId={OUTER} />);

      expectOneLayer();
    });

    it('shows one quoted post as the Repost dialog’s original, not navigable', () => {
      givenQuoteOfQuote();
      show(<DialogRepost postId={QUOTED} open onOpenChangeAction={vi.fn()} />);

      const original = quoteCard();
      expect(original).not.toHaveAttribute('role', 'link');
      expect(original).not.toHaveAttribute('tabindex');
      // Its tags show read-only; no action row opens another dialog over this one
      expect(within(original).queryByRole('button', { name: /^Reply to post/ })).not.toBeInTheDocument();
      const tag = original.querySelector<HTMLElement>('[data-cy="post-tag"][data-tag-label="quoted"]');
      expect(tag).not.toBeNull();
      fireEvent.click(tag as HTMLElement);
      expect(mocks.togglePostTag).not.toHaveBeenCalled();
      expectOneLayer();
    });
  });

  describe('the Repost dialog’s original post', () => {
    it.each(RESOURCES)(
      'shows the full frame of $name and tags it before the repost is sent',
      async ({ written, card }) => {
        givenQuoteOfResource(written, card);
        show(<DialogRepost postId={QUOTED} open onOpenChangeAction={vi.fn()} />);

        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'My take' } });
        const resource = resourceIn(quoteCard());
        expect(within(resource).getByTestId('resource-actions')).toBeInTheDocument();

        const input = await addResourceTag(resource, 'punk');

        expect(mocks.tagUris.at(-1)).toBe(card.uri);
        expectNoPostTargets();
        expect(PostController.commitCreate).not.toHaveBeenCalled();
        expect(mocks.navigateToPost).not.toHaveBeenCalled();
        expect(textarea).toHaveValue('My take');
        expect(input).toHaveFocus();
        expect(input.closest('form')).toBeNull();
        expectWritingActionsDisabled(resource);
        expect(textarea).toHaveValue('My take');
      },
    );
  });

  describe('the Reply dialog of an external resource', () => {
    it.each(RESOURCES)(
      'shows $name with its footer, tags it on its canonical link, and opens no other composer',
      async ({ written, card }) => {
        mocks.cards.set(written, card);
        show(<DialogReply resourceUri={written} open onOpenChangeAction={vi.fn()} />);

        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'My reply' } });
        const resource = resourceIn(screen.getByRole('dialog'));
        expect(within(resource).getByTestId('resource-actions')).toBeInTheDocument();

        const input = await addResourceTag(resource, 'punk');

        expect(mocks.tagUris.at(-1)).toBe(card.uri);
        expectNoPostTargets();
        expect(PostController.commitCreate).not.toHaveBeenCalled();
        expect(mocks.routerPush).not.toHaveBeenCalled();
        expect(textarea).toHaveValue('My reply');
        expect(input).toHaveFocus();
        expectWritingActionsDisabled(resource);
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
      },
    );
  });

  describe('normal posts and collection resources', () => {
    it.each(RESOURCES)('keeps $name on a normal post independently taggable', async ({ written, card }) => {
      givenQuoteOfResource(written, card);
      const { container } = show(<PostContent postId={QUOTED} />);
      expect(document.querySelectorAll('[data-cy="post-preview-card"]')).toHaveLength(0);
      await addResourceTag(resourceIn(container), 'punk');
      expect(new Set(mocks.tagUris)).toEqual(new Set([card.uri]));
      expect(mocks.navigateToPost).not.toHaveBeenCalled();
    });

    it.each(
      RESOURCES.flatMap((resource) =>
        [COLLECTION_LAYOUT.LIST, COLLECTION_LAYOUT.CARDS].map((layout) => ({ ...resource, layout })),
      ),
    )('keeps $name taggable in collection $layout items', async ({ written, card, frames, layout }) => {
      mocks.cards.set(written, card);
      show(<CollectionResourceItems uris={[written]} layout={layout} />);
      const resource = resourceIn(screen.getByTestId('collection-resource-items'));
      expect(within(resource).getByTestId('resource-actions')).toBeInTheDocument();
      await addResourceTag(resource, 'punk');
      expect(new Set(mocks.tagUris)).toEqual(new Set([card.uri]));
      expect(mocks.routerPush).not.toHaveBeenCalled();
      expect(iframes()).toHaveLength(frames);
    });
  });

  describe('the composer’s embedded resource (new post and edit)', () => {
    const composers = RESOURCES.flatMap((resource) => [
      {
        ...resource,
        composer: 'a new post',
        ui: <PostInput variant={POST_INPUT_VARIANT.POST} expanded />,
        type: true,
      },
      {
        ...resource,
        composer: 'an edit',
        ui: (
          <PostInput
            variant={POST_INPUT_VARIANT.EDIT}
            expanded
            editPostId={QUOTED}
            editContent={`Sum41 ${resource.written}`}
            editIsArticle={false}
            editAttachments={[]}
            editEmbedUrl={resource.written}
          />
        ),
        type: false,
      },
    ]);

    it.each(composers)(
      'tags $name in $composer on its canonical link, keeping the draft, its embed and focus',
      async ({ written, card, ui, type }) => {
        mocks.cards.set(written, card);
        show(ui);
        const textarea = screen.getByRole('textbox');
        if (type) fireEvent.change(textarea, { target: { value: `Sum41 ${written}` } });
        const draft = `Sum41 ${written}`;
        expect(textarea).toHaveValue(draft);

        const embed = screen.getByTestId('post-input-link-embed');
        const resource = resourceIn(embed);
        expect(within(resource).getByTestId('resource-actions')).toBeInTheDocument();

        const input = await addResourceTag(resource, 'punk');

        expect(mocks.tagUris.at(-1)).toBe(card.uri);
        expectNoPostTargets();
        expect(PostController.commitCreate).not.toHaveBeenCalled();
        expect(PostController.commitEdit).not.toHaveBeenCalled();
        expect(mocks.routerPush).not.toHaveBeenCalled();
        expect(textarea).toHaveValue(draft);
        // Still the same embed, not switched or removed
        expect(within(embed).getByText(`Embedded link · ${written.replace(/^https?:\/\//, '')}`)).toBeInTheDocument();
        expect(input).toHaveFocus();
        expect(input.closest('form')).toBeNull();
        expectWritingActionsDisabled(resource);
        expect(textarea).toHaveValue(draft);
      },
    );
  });

  describe('the resource’s tags in a quoted post', () => {
    it.each(RESOURCES)(
      'shows 3 tags of $name at a time, all on expand, 3 again on collapse, with the total count',
      ({ written, card }) => {
        mocks.tags = SHORT_TAGS;
        givenQuoteOfResource(written, card);
        show(<PostContent postId={OUTER} />);

        const resource = resourceIn(quoteCard());
        const tagsButton = within(resource).getByTestId('resource-tags-button');
        expect(chipLabels(resource)).toEqual(['punk', 'rock', '2000s']);
        expect(tagsButton).toHaveAccessibleName(expect.stringMatching(/\(7\)$/));

        fireEvent.click(tagsButton);
        expect(panelTagLabels(resource)).toEqual(SHORT_TAGS.map((tag) => tag.label));
        // More than 3 tags is no write limit: the input still takes another
        const input = tagInputIn(resource);
        expect(input).toBeEnabled();
        expect(input).toHaveAttribute('placeholder', 'add tag');

        fireEvent.click(tagsButton);
        expect(chipLabels(resource)).toEqual(['punk', 'rock', '2000s']);
        expect(mocks.navigateToPost).not.toHaveBeenCalled();
      },
    );
  });

  describe('signed out', () => {
    beforeEach(() => {
      mocks.isSignedIn = false;
      mocks.tags = SHORT_TAGS;
    });

    const expectReadsFreeWritesGated = (resource: HTMLElement) => {
      // Counted from here: the Repost composer's autofocused textarea asks to sign in on mount
      const before = mocks.signInRequests;
      // Showing every tag is a read: no sign-in, by the resource or by the composer around it
      const tagsButton = within(resource).getByTestId('resource-tags-button');
      fireEvent.click(tagsButton);
      expect(tagsButton).toHaveAttribute('aria-expanded', 'true');
      expect(panelTagLabels(resource)).toHaveLength(SHORT_TAGS.length);
      expect(mocks.signInRequests - before).toBe(0);

      // A write asks to sign in and writes nothing
      fireEvent.click(within(resource).getByTitle('punk'));
      expect(mocks.signInRequests - before).toBe(1);
      expect(mocks.toggleTag).not.toHaveBeenCalled();
      expect(mocks.addTag).not.toHaveBeenCalled();
      expect(tagInputIn(resource)).toBeDisabled();
    };

    it.each(
      RESOURCES.flatMap((resource) =>
        [POST_INPUT_VARIANT.POST, POST_INPUT_VARIANT.EDIT].map((variant) => ({ ...resource, variant })),
      ),
    )('keeps reads open and gates writes on $name in the $variant composer', ({ written, card, variant }) => {
      mocks.cards.set(written, card);
      show(
        variant === POST_INPUT_VARIANT.EDIT ? (
          <PostInput
            variant={POST_INPUT_VARIANT.EDIT}
            expanded
            editPostId={QUOTED}
            editContent={`Draft ${written}`}
            editIsArticle={false}
            editAttachments={[]}
            editEmbedUrl={written}
          />
        ) : (
          <PostInput variant={POST_INPUT_VARIANT.POST} expanded initialContent={`Draft ${written}`} />
        ),
      );
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue(`Draft ${written}`);
      expectReadsFreeWritesGated(resourceIn(screen.getByTestId('post-input-link-embed')));
      expect(textarea).toHaveValue(`Draft ${written}`);
      expect(PostController.commitCreate).not.toHaveBeenCalled();
      expect(PostController.commitEdit).not.toHaveBeenCalled();
    });

    it.each(RESOURCES)('gates writes on $name in a feed quote, reads stay open', ({ written, card }) => {
      givenQuoteOfResource(written, card);
      show(<PostContent postId={OUTER} />);

      expectReadsFreeWritesGated(resourceIn(quoteCard()));
      expect(mocks.navigateToPost).not.toHaveBeenCalled();
    });

    it.each(RESOURCES)('gates writes on $name in the Repost dialog, reads stay open', ({ written, card }) => {
      givenQuoteOfResource(written, card);
      show(<DialogRepost postId={QUOTED} open onOpenChangeAction={vi.fn()} />);

      expectReadsFreeWritesGated(resourceIn(quoteCard()));
    });
  });

  describe('platform embeds up front turned off (Settings, Links & Media)', () => {
    beforeEach(() => {
      act(() => useSettingsStore.setState({ media: { ...defaultMediaPreferences, embedsUpFront: false } }));
    });

    it.each([
      { name: 'with a card', card: VIDEO_CARD },
      { name: 'without a card', card: null },
    ])('loads no third-party frame for a quoted video $name', ({ card }) => {
      givenQuoteOfResource(VIDEO_WRITTEN, card);
      show(<PostContent postId={OUTER} />);

      quoteCard();
      expect(iframes()).toHaveLength(0);
    });

    it.each([
      { name: 'with a card', card: VIDEO_CARD },
      { name: 'without a card', card: null },
    ])('loads no third-party frame for a post’s own video $name', ({ card }) => {
      givenQuoteOfResource(VIDEO_WRITTEN, card);
      show(<PostContent postId={QUOTED} />);

      expect(screen.getByTestId('native-embed-resource')).toBeInTheDocument();
      expect(iframes()).toHaveLength(0);
    });
  });
});
