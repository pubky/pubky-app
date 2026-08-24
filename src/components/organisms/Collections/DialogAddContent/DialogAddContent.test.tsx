import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogAddContent } from './DialogAddContent';

const AUTHOR = 'a'.repeat(52);
const VIEWER = 'v'.repeat(52);
const POST_ID = '00357R34CQ8Q0';
const COMPOSITE_ID = `${AUTHOR}:${POST_ID}`;
const POST_URI = `pubky://${AUTHOR}/pub/pubky.app/posts/${POST_ID}`;
const POST_URL = `https://pubky.app/post/${AUTHOR}/${POST_ID}`;

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'v'.repeat(52) as string | null,
  bookmarkExists: vi.fn(),
  commitCreateBookmark: vi.fn(),
  getOrFetchPost: vi.fn(),
  getCollectionDetails: vi.fn(),
  commitUpdateCollectionItem: vi.fn(),
  prependPosts: vi.fn(),
  prependOptimisticPosts: vi.fn(),
  routerPush: vi.fn(),
  toast: vi.fn(),
}));

const COLLECTION_ID = `${VIEWER}:collection-1`;
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.routerPush,
  }),
}));

vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    exists: (...args: unknown[]) => mocks.bookmarkExists(...args),
    commitCreate: (...args: unknown[]) => mocks.commitCreateBookmark(...args),
  },
}));

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getOrFetch: (...args: unknown[]) => mocks.getOrFetchPost(...args),
    getDetails: (...args: unknown[]) => mocks.getCollectionDetails(...args),
    commitUpdateCollectionItem: (...args: unknown[]) => mocks.commitUpdateCollectionItem(...args),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.currentUserPubky }),
}));

vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: () => ({
    currentUserPubky: mocks.currentUserPubky,
    userDetails: mocks.currentUserPubky
      ? {
          id: mocks.currentUserPubky,
          name: 'Viewer',
          bio: '',
          links: null,
          status: null,
          image: null,
          indexed_at: 0,
        }
      : null,
  }),
}));

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: () => undefined,
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: mocks.toast,
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/organisms/DialogNewPost/DialogNewPost', () => ({
  DialogNewPost: ({
    open,
    onOpenChangeAction,
    onPostCreated,
  }: {
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
    onPostCreated?: (createdPostId: string) => void | Promise<void>;
  }) =>
    open ? (
      <div role="dialog" aria-label="new post">
        <button type="button" onClick={() => void onPostCreated?.('author:new-post')}>
          create post success
        </button>
        <button type="button" onClick={() => onOpenChangeAction(false)}>
          close new post
        </button>
      </div>
    ) : null,
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  useTimelineFeedContext: () => ({
    variant: 'bookmarks',
    prependPosts: mocks.prependPosts,
    prependOptimisticPosts: mocks.prependOptimisticPosts,
    removePosts: vi.fn(),
  }),
}));

function livePost() {
  return {
    id: COMPOSITE_ID,
    content: 'hello',
    kind: 'short',
    uri: POST_URI,
    indexed_at: 0,
    attachments: null,
  };
}

function collectionPost() {
  return {
    ...livePost(),
    content: JSON.stringify({ name: 'Nested', description: '', items: [] }),
    kind: 'collection',
  };
}

function collectionDetails(items: string[] = []) {
  return {
    id: COLLECTION_ID,
    content: JSON.stringify({
      name: 'Saved',
      description: '',
      items,
    }),
    kind: 'collection',
    uri: '',
    indexed_at: 0,
    attachments: null,
  };
}

describe('DialogAddContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserPubky = VIEWER;
    mocks.bookmarkExists.mockResolvedValue(false);
    mocks.commitCreateBookmark.mockResolvedValue(undefined);
    mocks.getOrFetchPost.mockResolvedValue(livePost());
    mocks.getCollectionDetails.mockResolvedValue(collectionDetails());
    mocks.commitUpdateCollectionItem.mockResolvedValue(undefined);
    mocks.prependPosts.mockResolvedValue(undefined);
    mocks.prependOptimisticPosts.mockReturnValue(undefined);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('renders the Content trigger', () => {
    render(<DialogAddContent />);

    expect(screen.getByRole('button', { name: 'Add Post' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Post' })).toHaveAttribute('data-cy', 'add-content');
  });

  it('disables the Content trigger and does not open the dialog when disabled', () => {
    render(<DialogAddContent disabled />);

    const trigger = screen.getByRole('button', { name: 'Add Post' });
    expect(trigger).toBeDisabled();

    fireEvent.click(trigger);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the Add Content grid trigger when triggerVariant is grid', () => {
    render(<DialogAddContent triggerVariant="grid" dataCy="bookmarks-add-content-grid" />);

    const trigger = screen.getByRole('button', { name: 'Add Post' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('data-cy', 'bookmarks-add-content-grid');
  });

  it('disables the Add Content grid trigger when disabled', () => {
    render(<DialogAddContent triggerVariant="grid" disabled />);

    expect(screen.getByRole('button', { name: 'Add Post' })).toBeDisabled();
  });

  it('renders a compact full-width Add Content row when triggerVariant is list', () => {
    render(<DialogAddContent triggerVariant="list" dataCy="collection-add-content-list" />);

    const trigger = screen.getByRole('button', { name: 'Add Post' });
    expect(trigger).toHaveAttribute('data-cy', 'collection-add-content-list');
    expect(trigger).toHaveClass('h-16', 'w-full');
    expect(trigger).not.toHaveClass('h-full');
  });

  it('renders a dashed mosaic tile when triggerVariant is visual', () => {
    render(<DialogAddContent triggerVariant="visual" dataCy="collection-add-content-visual" />);

    const trigger = screen.getByRole('button', { name: 'Add Post' });
    expect(trigger).toHaveAttribute('data-cy', 'collection-add-content-visual');
    expect(trigger).toHaveClass('h-full', 'w-full', 'border-dashed');
    expect(trigger).not.toHaveClass('h-16');
  });

  it('opens the dialog with the four add-post options in responsive grid order', () => {
    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));

    expect(screen.getByRole('dialog')).toHaveClass(
      'overflow-y-auto',
      'outline-none',
      'focus:outline-none',
      'focus-visible:outline-none',
    );
    expect(screen.getByRole('dialog')).not.toHaveClass('overflow-hidden');
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Add Post');
    expect(screen.getByText('Choose how to add posts to your collection.')).toHaveClass('sm:hidden');
    expect(screen.getByText('There are several ways to add posts to your collection.')).toHaveClass(
      'hidden',
      'sm:inline',
    );
    expect(screen.getByText('Add from feed')).toBeInTheDocument();
    expect(screen.getByText('Select from posts')).toBeInTheDocument();
    expect(screen.getByText('Paste post url')).toBeInTheDocument();
    expect(screen.getByText('Create new post')).toBeInTheDocument();
    expect(screen.getByText('Start writing')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paste' })).toBeInTheDocument();

    const options = document.querySelector('[data-cy="add-content-options"]');
    expect(options).toHaveClass('grid', 'grid-cols-1', 'gap-3', 'sm:grid-cols-2');

    const cards = options?.querySelectorAll('[data-slot="card"]');
    expect(Array.from(cards ?? []).map((card) => card.querySelector('[data-slot="card-title"]')?.textContent)).toEqual([
      'Add from feed',
      'Select from posts',
      'Paste post url',
      'Create new post',
    ]);
  });

  it('closes the dialog and navigates to profile posts without mutating content when Select is clicked', async () => {
    render(<DialogAddContent target={{ type: 'collection', collectionId: COLLECTION_ID }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));

    const selectButton = screen.getByRole('button', { name: 'Select' });
    expect(selectButton).toHaveAttribute('data-cy', 'add-content-select-from-posts');
    fireEvent.click(selectButton);

    expect(mocks.routerPush).toHaveBeenCalledWith('/profile/posts');
    expect(mocks.getOrFetchPost).not.toHaveBeenCalled();
    expect(mocks.bookmarkExists).not.toHaveBeenCalled();
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(mocks.getCollectionDetails).not.toHaveBeenCalled();
    expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
    expect(mocks.prependOptimisticPosts).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each(['add-content-feed-reply-pill', 'add-content-feed-repost-pill', 'add-content-feed-save-pill'])(
    'closes the dialog and navigates home when clicking %s',
    async (dataCy) => {
      render(<DialogAddContent />);

      fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
      const feedPill = document.querySelector(`[data-cy="${dataCy}"]`);
      if (!(feedPill instanceof HTMLElement)) {
        throw new Error(`Expected ${dataCy} to render`);
      }

      fireEvent.click(feedPill);

      expect(mocks.routerPush).toHaveBeenCalledWith('/home');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    },
  );

  it('stacks URL validation messages below the input', () => {
    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));

    const footer = screen.getByPlaceholderText('https://').closest('[data-slot="card-footer"]');
    expect(footer).toHaveClass('flex-col', 'items-stretch');
  });

  it('shows a red dashed border when the pasted URL is invalid', async () => {
    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.paste(screen.getByPlaceholderText('https://'), {
      clipboardData: {
        getData: () => 'not a post url',
      },
    });

    const errorMessage = await screen.findByText('Enter a valid post URL.');
    const inputContainer = screen.getByPlaceholderText('https://').closest('[data-testid="container"]');

    expect(errorMessage).toBeInTheDocument();
    expect(inputContainer).toHaveClass('has-[input[aria-invalid=true]]:border-red-500');
  });

  it('keeps the dialog open when a collection URL is pasted into bookmarks', async () => {
    mocks.getOrFetchPost.mockResolvedValue(collectionPost());
    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.paste(screen.getByPlaceholderText('https://'), {
      clipboardData: {
        getData: () => POST_URL,
      },
    });

    expect(await screen.findByText('Collection can not be added to a collection.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.bookmarkExists).not.toHaveBeenCalled();
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(mocks.prependOptimisticPosts).not.toHaveBeenCalled();
  });

  it('keeps the dialog open when a collection URL is pasted into a collection', async () => {
    mocks.getOrFetchPost.mockResolvedValue(collectionPost());
    render(<DialogAddContent target={{ type: 'collection', collectionId: COLLECTION_ID }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.paste(screen.getByPlaceholderText('https://'), {
      clipboardData: {
        getData: () => POST_URL,
      },
    });

    expect(await screen.findByText('Collection can not be added to a collection.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.getCollectionDetails).not.toHaveBeenCalled();
    expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
    expect(mocks.prependOptimisticPosts).not.toHaveBeenCalled();
  });

  it('adds pasted bookmark content, prepends it, and closes the dialog', async () => {
    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.paste(screen.getByPlaceholderText('https://'), {
      clipboardData: {
        getData: () => POST_URL,
      },
    });

    await waitFor(() =>
      expect(mocks.commitCreateBookmark).toHaveBeenCalledWith({ postId: COMPOSITE_ID, userId: VIEWER }),
    );
    expect(mocks.prependOptimisticPosts).toHaveBeenCalledWith(COMPOSITE_ID);
    expect(mocks.prependPosts).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('adds clipboard content when the paste button is clicked', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue(POST_URL) },
    });

    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));

    await waitFor(() =>
      expect(mocks.commitCreateBookmark).toHaveBeenCalledWith({ postId: COMPOSITE_ID, userId: VIEWER }),
    );
    expect(mocks.prependOptimisticPosts).toHaveBeenCalledWith(COMPOSITE_ID);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows an error toast when the paste button cannot read the clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not read clipboard.',
      }),
    );
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('disables the input and shows loading text while paste processing is pending', async () => {
    let resolvePost!: (value: ReturnType<typeof livePost>) => void;
    mocks.getOrFetchPost.mockReturnValue(new Promise((resolve) => (resolvePost = resolve)));

    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.paste(screen.getByPlaceholderText('https://'), {
      clipboardData: {
        getData: () => POST_URL,
      },
    });

    await waitFor(() => {
      const input = screen.getByDisplayValue('Adding...');
      expect(input).toBeDisabled();
      expect(input.closest('[data-testid="container"]')).toHaveClass('gap-3');
      expect(screen.getByRole('button', { name: 'Paste' })).toHaveAttribute('aria-disabled', 'true');
    });

    resolvePost(livePost());
    await waitFor(() => expect(mocks.commitCreateBookmark).toHaveBeenCalled());
  });

  it('adds pasted content to a collection and closes the dialog', async () => {
    render(<DialogAddContent target={{ type: 'collection', collectionId: COLLECTION_ID }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.paste(screen.getByPlaceholderText('https://'), {
      clipboardData: {
        getData: () => POST_URL,
      },
    });

    await waitFor(() =>
      expect(mocks.commitUpdateCollectionItem).toHaveBeenCalledWith({
        collectionId: COLLECTION_ID,
        postId: COMPOSITE_ID,
        shouldAdd: true,
      }),
    );
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(mocks.prependOptimisticPosts).toHaveBeenCalledWith(COMPOSITE_ID);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes Add Content and opens New Post when Create new post is clicked', async () => {
    render(<DialogAddContent target={{ type: 'collection', collectionId: COLLECTION_ID }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.click(screen.getByRole('button', { name: /Start writing/ }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'new post' })).toBeInTheDocument();
    });
    expect(screen.queryByTestId('dialog-title')).not.toBeInTheDocument();
  });

  it('adds a newly created post to a collection and prepends it optimistically', async () => {
    render(<DialogAddContent target={{ type: 'collection', collectionId: COLLECTION_ID }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.click(screen.getByRole('button', { name: /Start writing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'create post success' }));

    await waitFor(() =>
      expect(mocks.commitUpdateCollectionItem).toHaveBeenCalledWith({
        collectionId: COLLECTION_ID,
        postId: 'author:new-post',
        shouldAdd: true,
      }),
    );
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(mocks.prependOptimisticPosts).toHaveBeenCalledWith('author:new-post');
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Success',
      description: 'Post added to collection.',
    });
  });

  it('bookmarks a newly created post and prepends it optimistically', async () => {
    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));
    fireEvent.click(screen.getByRole('button', { name: /Start writing/ }));
    fireEvent.click(screen.getByRole('button', { name: 'create post success' }));

    await waitFor(() =>
      expect(mocks.commitCreateBookmark).toHaveBeenCalledWith({ postId: 'author:new-post', userId: VIEWER }),
    );
    expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
    expect(mocks.prependOptimisticPosts).toHaveBeenCalledWith('author:new-post');
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'Post saved to bookmarks' });
  });
});

describe('DialogAddContent - Snapshots', () => {
  it('matches the closed trigger snapshot', () => {
    const { container } = render(<DialogAddContent />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the closed grid trigger snapshot', () => {
    const { container } = render(<DialogAddContent triggerVariant="grid" />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the closed list trigger snapshot', () => {
    const { container } = render(<DialogAddContent triggerVariant="list" />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the closed visual trigger snapshot', () => {
    const { container } = render(<DialogAddContent triggerVariant="visual" dataCy="collection-add-content-visual" />);

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the opened desktop dialog snapshot', () => {
    render(<DialogAddContent />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Post' }));

    expect(document.body).toMatchSnapshot();
  });
});
