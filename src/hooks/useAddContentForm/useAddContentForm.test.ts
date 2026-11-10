import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeOwner } from 'pubky-social-specs/testing';
import type { ClipboardEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import type { AuthStore } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';
import { mockAuthStore } from '@/test-utils/stores';
import { asInvalid } from '@/test-utils/type-assertions';
import { useAddContentForm } from './useAddContentForm';
import { ADD_CONTENT_FORM_FIELDS } from './useAddContentForm.types';

const AUTHOR = fakeOwner(1);
const VIEWER = 'v'.repeat(52);
const POST_ID = '00357R34CQ8Q0';
const COMPOSITE_ID = `${AUTHOR}:${POST_ID}`;
const POST_URI = `pubky://${AUTHOR}/pub/pubky.app/posts/${POST_ID}`;
const POST_URL = `https://pubky.app/post/${AUTHOR}/${POST_ID}`;
const COLLECTION_ID = `${VIEWER}:collection-1`;
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=P65ZQL_m9zs';
const OSM_URL = 'https://www.openstreetmap.org/relation/1682248';

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'v'.repeat(52) as string | null,
  restoreStatus: 'ready' as 'ready' | 'reauth-required',
  showSignIn: vi.fn(),
  bookmarkExists: vi.fn(),
  commitCreateBookmark: vi.fn(),
  getOrFetchPost: vi.fn(),
  getCollectionDetails: vi.fn(),
  commitUpdateCollectionItem: vi.fn(),
  commitUpdateCollectionResource: vi.fn(),
  fetchResourceBookmarks: vi.fn(),
  commitCreateResourceBookmark: vi.fn(),
  invalidateResourceBookmarks: vi.fn(),
  fetchCardByUri: vi.fn(),
  onSuccess: vi.fn(),
}));
vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    exists: (...args: unknown[]) => mocks.bookmarkExists(...args),
    commitCreate: (...args: unknown[]) => mocks.commitCreateBookmark(...args),
    fetchResourceBookmarks: (...args: unknown[]) => mocks.fetchResourceBookmarks(...args),
    commitCreateResource: (...args: unknown[]) => mocks.commitCreateResourceBookmark(...args),
  },
}));

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getOrFetch: (...args: unknown[]) => mocks.getOrFetchPost(...args),
    getDetails: (...args: unknown[]) => mocks.getCollectionDetails(...args),
    commitUpdateCollectionItem: (...args: unknown[]) => mocks.commitUpdateCollectionItem(...args),
    commitUpdateCollectionResource: (...args: unknown[]) => mocks.commitUpdateCollectionResource(...args),
  },
}));

vi.mock('@/controllers/pinakes/pinakes', () => ({
  PinakesController: {
    fetchCardByUri: (...args: unknown[]) => mocks.fetchCardByUri(...args),
  },
}));

vi.mock('@/hooks/useResourceBookmarks/useResourceBookmarks', () => ({
  invalidateResourceBookmarks: () => mocks.invalidateResourceBookmarks(),
}));

vi.mock('@/stores/auth/auth.store', () => {
  const getState = () =>
    mockAuthStore({
      hasHydrated: true,
      currentUserPubky: mocks.currentUserPubky,
      session: mocks.restoreStatus === 'ready' ? mockSession() : null,
      restoreStatus: mocks.restoreStatus,
      setShowSignInDialog: mocks.showSignIn,
    });
  return {
    useAuthStore: Object.assign((selector: (state: AuthStore) => unknown) => selector(getState()), { getState }),
  };
});

vi.mock('@/molecules/Toaster/toast');

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

function collectionDetails(items: string[]) {
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

describe('useAddContentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserPubky = VIEWER;
    mocks.restoreStatus = 'ready';
    mocks.bookmarkExists.mockResolvedValue(false);
    mocks.commitCreateBookmark.mockResolvedValue(true);
    mocks.getOrFetchPost.mockResolvedValue(livePost());
    mocks.getCollectionDetails.mockResolvedValue(collectionDetails([]));
    mocks.commitUpdateCollectionItem.mockResolvedValue(undefined);
    mocks.commitUpdateCollectionResource.mockResolvedValue(undefined);
    mocks.fetchResourceBookmarks.mockResolvedValue([]);
    mocks.commitCreateResourceBookmark.mockResolvedValue(undefined);
    mocks.fetchCardByUri.mockResolvedValue(null);
    mocks.onSuccess.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(navigator, 'permissions');
  });

  it('does not save collection content after authorization is lost during lookup', async () => {
    mocks.getOrFetchPost.mockImplementationOnce(async () => {
      mocks.restoreStatus = 'reauth-required';
      return livePost();
    });
    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'collection', collectionId: COLLECTION_ID } }),
    );
    await act(async () => {
      expect(await result.current.submit(POST_URL)).toBe(false);
    });
    expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
    expect(mocks.showSignIn).toHaveBeenCalledWith(true);
  });

  it('rejects invalid post references', async () => {
    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.submit('not a post url');
    });

    expect(saved).toBe(false);
    expect(mocks.getOrFetchPost).not.toHaveBeenCalled();
    expect(mocks.fetchCardByUri).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'Enter a valid URL.',
    );
  });

  it('keeps showing the invalid URL message while a post URL is typed character by character', async () => {
    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'collection', collectionId: COLLECTION_ID } }),
    );
    const typeValue = async (value: string) => {
      await act(async () => {
        result.current.form.setValue(ADD_CONTENT_FORM_FIELDS.POST_URL, value, { shouldValidate: true });
      });
    };

    for (let length = 1; length < POST_ID.length; length++) {
      await typeValue(`https://pubky.app/post/${AUTHOR}/${POST_ID.slice(0, length)}`);
      expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
        'Enter a valid post URL.',
      );
    }

    await typeValue(POST_URL);
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error).toBeUndefined();
  });

  it('rejects missing and deleted posts', async () => {
    mocks.getOrFetchPost.mockResolvedValueOnce(null);
    const { result, rerender } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(false);
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'We could not find that post.',
    );

    mocks.getOrFetchPost.mockResolvedValueOnce({ ...livePost(), content: '[DELETED]' });
    rerender();

    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(false);
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'We could not find that post.',
    );
  });

  it('rejects already bookmarked posts', async () => {
    mocks.bookmarkExists.mockResolvedValue(true);
    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(false);
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'This post is already added.',
    );
  });

  it('rejects collection posts when adding to bookmarks', async () => {
    mocks.getOrFetchPost.mockResolvedValue(collectionPost());
    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(false);
    expect(mocks.bookmarkExists).not.toHaveBeenCalled();
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'Collection can not be added to a collection.',
    );
  });

  it('commits a bookmark, calls success, and clears the field', async () => {
    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let saved = false;
    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(true);
    expect(mocks.getOrFetchPost).toHaveBeenCalledWith({ compositeId: COMPOSITE_ID, viewerId: VIEWER });
    expect(mocks.bookmarkExists).toHaveBeenCalledWith(COMPOSITE_ID);
    expect(mocks.commitCreateBookmark).toHaveBeenCalledWith({ postId: COMPOSITE_ID, userId: VIEWER });
    expect(mocks.onSuccess).toHaveBeenCalledWith(COMPOSITE_ID);
    expect(result.current.form.getValues(ADD_CONTENT_FORM_FIELDS.POST_URL)).toBe('');
  });

  it('reports nothing saved when the controller skipped the bookmark for a signed-out viewer', async () => {
    mocks.commitCreateBookmark.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(false);
    expect(mocks.commitCreateBookmark).toHaveBeenCalledTimes(1);
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('rejects collection posts when adding to a collection', async () => {
    mocks.getOrFetchPost.mockResolvedValue(collectionPost());
    const { result } = renderHook(() =>
      useAddContentForm({
        target: { type: 'collection', collectionId: COLLECTION_ID },
        onSuccess: mocks.onSuccess,
      }),
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(false);
    expect(mocks.getCollectionDetails).not.toHaveBeenCalled();
    expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(mocks.onSuccess).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'Collection can not be added to a collection.',
    );
  });

  it('rejects posts already in the collection', async () => {
    mocks.getCollectionDetails.mockResolvedValue(collectionDetails([POST_URI]));
    const { result } = renderHook(() =>
      useAddContentForm({
        target: { type: 'collection', collectionId: COLLECTION_ID },
        onSuccess: mocks.onSuccess,
      }),
    );

    let saved = true;
    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(false);
    expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'This post is already added.',
    );
  });

  it('commits collection items and calls success', async () => {
    const { result } = renderHook(() =>
      useAddContentForm({
        target: { type: 'collection', collectionId: COLLECTION_ID },
        onSuccess: mocks.onSuccess,
      }),
    );

    let saved = false;
    await act(async () => {
      saved = await result.current.submit(POST_URL);
    });

    expect(saved).toBe(true);
    expect(mocks.getCollectionDetails).toHaveBeenCalledWith({ compositeId: COLLECTION_ID });
    expect(mocks.commitUpdateCollectionItem).toHaveBeenCalledWith({
      collectionId: COLLECTION_ID,
      postId: COMPOSITE_ID,
      shouldAdd: true,
    });
    expect(mocks.onSuccess).toHaveBeenCalledWith(COMPOSITE_ID);
  });

  it('sets pending while async validation and mutation are running', async () => {
    let resolvePost!: (value: ReturnType<typeof livePost>) => void;
    mocks.getOrFetchPost.mockReturnValue(new Promise((resolve) => (resolvePost = resolve)));

    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    void act(() => {
      void result.current.submit(POST_URL);
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => {
      resolvePost(livePost());
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('handles pasted text by preventing default and submitting it', async () => {
    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );
    const preventDefault = vi.fn();

    act(() => {
      result.current.handlePaste(
        asInvalid<ClipboardEvent<HTMLInputElement>>({
          preventDefault,
          clipboardData: { getData: () => POST_URL },
        }),
      );
    });

    await waitFor(() => expect(mocks.commitCreateBookmark).toHaveBeenCalled());
    expect(preventDefault).toHaveBeenCalled();
  });

  it('submits clipboard text from pasteFromClipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue(POST_URL) },
    });

    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    await act(async () => {
      await result.current.pasteFromClipboard();
    });

    await waitFor(() => expect(mocks.commitCreateBookmark).toHaveBeenCalled());
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('toasts when pasteFromClipboard cannot read the clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    await act(async () => {
      await result.current.pasteFromClipboard();
    });

    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Could not read clipboard.',
    });
  });

  it('explains how to unblock a denied clipboard permission', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
    });

    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    await act(async () => {
      await result.current.pasteFromClipboard();
    });

    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: "Clipboard access is blocked. Allow it in your browser's site settings, or paste manually.",
    });
  });

  it('ignores a second paste click while the first is still reading', async () => {
    let resolveRead!: (value: string) => void;
    const readText = vi.fn(() => new Promise<string>((resolve) => (resolveRead = resolve)));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });

    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.pasteFromClipboard();
      second = result.current.pasteFromClipboard();
      resolveRead(POST_URL);
      await Promise.all([first, second]);
    });

    expect(readText).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.commitCreateBookmark).toHaveBeenCalledTimes(1));
  });

  it('does not clobber text typed while the clipboard read is pending', async () => {
    let resolveRead!: (value: string) => void;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn(() => new Promise<string>((resolve) => (resolveRead = resolve))) },
    });

    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let pastePromise!: Promise<void>;
    await act(async () => {
      pastePromise = result.current.pasteFromClipboard();
      result.current.form.setValue(ADD_CONTENT_FORM_FIELDS.POST_URL, 'typed-while-waiting');
      resolveRead(POST_URL);
      await pastePromise;
    });

    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(result.current.form.getValues(ADD_CONTENT_FORM_FIELDS.POST_URL)).toBe('typed-while-waiting');
  });

  it('does not submit a clipboard read that resolves after unmount', async () => {
    let resolveRead!: (value: string) => void;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn(() => new Promise<string>((resolve) => (resolveRead = resolve))) },
    });

    const { result, unmount } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    let pastePromise!: Promise<void>;
    act(() => {
      pastePromise = result.current.pasteFromClipboard();
    });
    unmount();

    await act(async () => {
      resolveRead(POST_URL);
      await pastePromise;
    });

    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(mocks.onSuccess).not.toHaveBeenCalled();
  });

  it('rejects oversized pasted values without writing them into the form', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue('x'.repeat(5000)) },
    });

    const { result } = renderHook(() =>
      useAddContentForm({ target: { type: 'bookmarks' }, onSuccess: mocks.onSuccess }),
    );

    await act(async () => {
      await result.current.pasteFromClipboard();
    });

    expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
    expect(result.current.form.getValues(ADD_CONTENT_FORM_FIELDS.POST_URL)).toBe('');
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'Enter a valid URL.',
    );
  });

  describe('links', () => {
    const collectionTarget = { type: 'collection', collectionId: COLLECTION_ID } as const;

    async function submitTo(target: Parameters<typeof useAddContentForm>[0]['target'], value: string) {
      const { result } = renderHook(() => useAddContentForm({ target, onSuccess: mocks.onSuccess }));
      let saved: boolean | undefined;
      await act(async () => {
        saved = await result.current.submit(value);
      });
      return {
        saved,
        error: result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message,
        result,
      };
    }

    it.each([
      ['a YouTube link', YOUTUBE_URL],
      ['an OpenStreetMap link', OSM_URL],
      ['a pubky.app page that is no post', 'https://pubky.app/profile/'],
    ])('adds %s to the collection as a link, as written when Pinakes does not know it', async (_, url) => {
      const { saved, error, result } = await submitTo(collectionTarget, url);

      expect(saved).toBe(true);
      expect(error).toBeUndefined();
      expect(mocks.fetchCardByUri).toHaveBeenCalledWith({ uri: url });
      expect(mocks.getOrFetchPost).not.toHaveBeenCalled();
      expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
      expect(mocks.commitUpdateCollectionResource).toHaveBeenCalledWith({
        collectionId: COLLECTION_ID,
        uri: url,
        shouldAdd: true,
      });
      // A link shows from the collection itself: no post id for the feed.
      expect(mocks.onSuccess).toHaveBeenCalledWith();
      expect(result.current.form.getValues(ADD_CONTENT_FORM_FIELDS.POST_URL)).toBe('');
    });

    it("writes the card's canonical link, with the link as written among its spellings", async () => {
      const canonical = 'https://www.youtube.com/watch?v=P65ZQL_m9zs&canonical';
      const shareLink = 'https://youtu.be/P65ZQL_m9zs';
      mocks.fetchCardByUri.mockResolvedValue({ uri: canonical, refs: [shareLink], aliases: [] });

      const { saved } = await submitTo(collectionTarget, YOUTUBE_URL);

      expect(saved).toBe(true);
      expect(mocks.commitUpdateCollectionResource).toHaveBeenCalledWith({
        collectionId: COLLECTION_ID,
        uri: canonical,
        spellings: [YOUTUBE_URL, shareLink],
        shouldAdd: true,
      });
    });

    it('hands a canonical link a collection cannot hold to the collection write with its spellings', async () => {
      const shareLink = 'https://youtu.be/P65ZQL_m9zs';
      mocks.fetchCardByUri.mockResolvedValue({
        uri: 'isbn:9781119473862',
        refs: [YOUTUBE_URL, shareLink],
        aliases: [],
      });

      const { saved } = await submitTo(collectionTarget, YOUTUBE_URL);

      expect(saved).toBe(true);
      // `commitUpdateCollectionResource` writes the first spelling a collection can hold.
      expect(mocks.commitUpdateCollectionResource).toHaveBeenCalledWith({
        collectionId: COLLECTION_ID,
        uri: 'isbn:9781119473862',
        spellings: [YOUTUBE_URL, shareLink],
        shouldAdd: true,
      });
    });

    it('bookmarks the canonical link, whatever its scheme', async () => {
      mocks.fetchCardByUri.mockResolvedValue({ uri: 'isbn:9781119473862', refs: [], aliases: [] });

      const { saved } = await submitTo({ type: 'bookmarks' }, YOUTUBE_URL);

      expect(saved).toBe(true);
      expect(mocks.commitCreateResourceBookmark).toHaveBeenCalledWith({ uri: 'isbn:9781119473862', userId: VIEWER });
    });

    it('adds the link as written when Pinakes fails', async () => {
      mocks.fetchCardByUri.mockRejectedValue(new Error('down'));

      const { saved } = await submitTo(collectionTarget, YOUTUBE_URL);

      expect(saved).toBe(true);
      expect(mocks.commitUpdateCollectionResource).toHaveBeenCalledWith({
        collectionId: COLLECTION_ID,
        uri: YOUTUBE_URL,
        shouldAdd: true,
      });
    });

    it('refuses a link the collection already holds in any spelling', async () => {
      const shareLink = 'https://youtu.be/P65ZQL_m9zs';
      mocks.fetchCardByUri.mockResolvedValue({ uri: YOUTUBE_URL, refs: [], aliases: [shareLink] });
      mocks.getCollectionDetails.mockResolvedValue(collectionDetails([shareLink]));

      const { saved, error } = await submitTo(collectionTarget, YOUTUBE_URL);

      expect(saved).toBe(false);
      expect(error).toBe('This link is already added.');
      expect(mocks.commitUpdateCollectionResource).not.toHaveBeenCalled();
      expect(mocks.onSuccess).not.toHaveBeenCalled();
    });

    it('bookmarks a link and lists the bookmarks again', async () => {
      const { saved } = await submitTo({ type: 'bookmarks' }, YOUTUBE_URL);

      expect(saved).toBe(true);
      expect(mocks.fetchResourceBookmarks).toHaveBeenCalledWith({ userId: VIEWER });
      expect(mocks.commitCreateResourceBookmark).toHaveBeenCalledWith({ uri: YOUTUBE_URL, userId: VIEWER });
      expect(mocks.invalidateResourceBookmarks).toHaveBeenCalled();
      expect(mocks.commitCreateBookmark).not.toHaveBeenCalled();
      expect(mocks.onSuccess).toHaveBeenCalledWith();
    });

    it('refuses a link already bookmarked in another spelling', async () => {
      const shareLink = 'https://youtu.be/P65ZQL_m9zs';
      mocks.fetchCardByUri.mockResolvedValue({ uri: YOUTUBE_URL, refs: [shareLink], aliases: [] });
      mocks.fetchResourceBookmarks.mockResolvedValue([shareLink]);

      const { saved, error } = await submitTo({ type: 'bookmarks' }, YOUTUBE_URL);

      expect(saved).toBe(false);
      expect(error).toBe('This link is already added.');
      expect(mocks.commitCreateResourceBookmark).not.toHaveBeenCalled();
    });

    it('reads a bookmarks listing that fails to load as holding nothing', async () => {
      mocks.fetchResourceBookmarks.mockRejectedValue(new Error('homeserver down'));

      const { saved } = await submitTo({ type: 'bookmarks' }, YOUTUBE_URL);

      expect(saved).toBe(true);
      expect(mocks.commitCreateResourceBookmark).toHaveBeenCalledWith({ uri: YOUTUBE_URL, userId: VIEWER });
    });

    it('does not save a link after authorization is lost during the lookup', async () => {
      mocks.fetchCardByUri.mockImplementationOnce(async () => {
        mocks.restoreStatus = 'reauth-required';
        return null;
      });

      const { saved } = await submitTo(collectionTarget, YOUTUBE_URL);

      expect(saved).toBe(false);
      expect(mocks.commitUpdateCollectionResource).not.toHaveBeenCalled();
      expect(mocks.showSignIn).toHaveBeenCalledWith(true);
    });

    it('shows an error when the write fails', async () => {
      mocks.commitUpdateCollectionResource.mockRejectedValue(new Error('offline'));

      const { saved, error } = await submitTo(collectionTarget, YOUTUBE_URL);

      expect(saved).toBe(false);
      expect(error).toBe('Could not add this link.');
      expect(mocks.onSuccess).not.toHaveBeenCalled();
    });

    it('adds a pubky:// post reference as the post', async () => {
      const { saved } = await submitTo(collectionTarget, POST_URI);

      expect(saved).toBe(true);
      expect(mocks.commitUpdateCollectionItem).toHaveBeenCalledWith({
        collectionId: COLLECTION_ID,
        postId: COMPOSITE_ID,
        shouldAdd: true,
      });
      expect(mocks.commitUpdateCollectionResource).not.toHaveBeenCalled();
    });

    it.each([
      ['text that is no URL', 'youtube video', 'Enter a valid URL.'],
      ['a link without a host', 'https://', 'Enter a valid URL.'],
      ['a scheme a collection cannot hold', 'ftp://example.com/file', 'Enter a valid URL.'],
      [
        'a Pubky object that is no post',
        `pubky://${AUTHOR}/pub/pubky.app/profile.json`,
        'Only Pubky posts can be added.',
      ],
      [
        'a collection link',
        `https://pubky.app/collections/${AUTHOR}/${POST_ID}`,
        'Collection can not be added to a collection.',
      ],
      ['a post link cut short', `https://pubky.app/post/${AUTHOR}/0035`, 'Enter a valid post URL.'],
    ])('refuses %s', async (_, value, message) => {
      const { saved, error } = await submitTo(collectionTarget, value);

      expect(saved).toBe(false);
      expect(error).toBe(message);
      expect(mocks.fetchCardByUri).not.toHaveBeenCalled();
      expect(mocks.getOrFetchPost).not.toHaveBeenCalled();
      expect(mocks.commitUpdateCollectionResource).not.toHaveBeenCalled();
      expect(mocks.commitUpdateCollectionItem).not.toHaveBeenCalled();
    });
  });
});
