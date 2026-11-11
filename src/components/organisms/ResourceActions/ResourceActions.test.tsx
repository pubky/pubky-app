import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_VARIANT } from '@/config/ui';
import { PostController } from '@/controllers/post/post';
import type { NexusTag } from '@/services/nexus/nexus.types';
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
  bookmarkActive: [] as (boolean | undefined)[],
  shareUrl: vi.fn(),
  copyToClipboard: vi.fn(),
  copyTitles: [] as (string | undefined)[],
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
  useResourceTags: (uri: string, options?: { enabled?: boolean }) => {
    mocks.tagsUri = uri;
    mocks.tagsEnabled.push(options?.enabled);
    return mocks.tags;
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
  DialogReply: (props: { open: boolean; resourceUri?: string; onOpenChangeAction: (open: boolean) => void }) => {
    mocks.replyDialog(props);
    return props.open ? (
      <div data-testid="reply-dialog" data-resource-uri={props.resourceUri}>
        <button type="button" onClick={() => props.onOpenChangeAction(false)}>
          Close reply
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
  }: {
    resourceTags: { tags: NexusTag[] };
    label: string;
    id?: string;
    isExpanded: boolean;
    isAdding: boolean;
    onAddingChange: (isAdding: boolean) => void;
  }) => (
    <div
      id={id}
      role="group"
      aria-label={label}
      data-testid="resource-tag-bar-stub"
      data-tags={resourceTags.tags.length}
      data-expanded={isExpanded}
      data-adding={isAdding}
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
    mocks.bookmarkActive = [];
  });

  it('lays out the post’s footer: the tags, then the post’s buttons in the post’s order', () => {
    renderActions(8);

    const zone = screen.getByTestId('resource-actions');
    expect(zone).toHaveAttribute('data-resource-controls');
    expect(zone).toHaveClass('flex-col', 'items-start', 'md:flex-row', 'md:justify-between');
    // Stacked in a narrow grid cell, as the post footer is.
    expect(zone).toHaveClass('@max-xl/grid:flex-col!', '@max-xl/grid:items-start!', '@max-xl/grid:gap-3!');
    expect(zone.children).toHaveLength(2);
    const tags = screen.getByTestId('resource-tag-bar-stub');
    expect(zone.firstElementChild).toBe(tags);
    expect(mocks.tagsUri).toBe(URI);
    expect(tags).toHaveAttribute('data-tags', '3');
    const row = screen.getByTestId('resource-action-row');
    expect(zone.lastElementChild).toBe(row);
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

  it('keeps the buttons on one row at their width beside the tags from md, like the post’s', () => {
    renderActions(8);

    const row = screen.getByTestId('resource-action-row');
    // The tags wrap instead: from md the row neither wraps nor shrinks; in a narrow grid cell it is stacked and may wrap.
    expect(row).toHaveClass('md:flex-nowrap', 'md:shrink-0', '@max-xl/grid:flex-wrap!');
    expect(row).not.toHaveClass('md:flex-wrap');
    expect(row).not.toHaveClass('md:shrink');
    expect(screen.getByTestId('resource-tag-bar-stub').nextElementSibling).toBe(row);
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
      const zone = screen.getByTestId('resource-actions');
      expect(zone).toHaveClass('md:items-start');
      expect(zone).not.toHaveClass('md:items-end');

      fireEvent.click(screen.getByTestId('resource-tags-button'));

      expect(zone).toHaveClass('md:items-end');
      expect(zone).not.toHaveClass('md:items-start');
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

      await waitFor(() => expect(menuLabels()).toEqual(['Copy link', 'Copy title']));
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

    it('copies the URI without a web link, and has no title item without a title', async () => {
      render(<ResourceActions uri="isbn:9780140328721" tagsLabel="Tags on this book" linkUrl={null} />);

      openMenu('More options');

      await waitFor(() => expect(menuLabels()).toEqual(['Copy link']));
      fireEvent.click(screen.getByText('Copy link'));
      await waitFor(() => expect(mocks.shareUrl).toHaveBeenCalledWith('isbn:9780140328721'));
    });

    it('adds the extra entries after its own, in the menu’s variant', async () => {
      const extra = vi.fn(({ variant }: { variant: string }) => <div role="menuitem">{`Also on (${variant})`}</div>);
      render(<ResourceActions uri={URI} tagsLabel="Tags on this song" linkUrl={LINK} extraMenuContent={extra} />);

      openMenu('More options');

      await waitFor(() => expect(menuLabels()).toEqual(['Copy link', `Also on (${MENU_VARIANT.DROPDOWN})`]));
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
  });
});
