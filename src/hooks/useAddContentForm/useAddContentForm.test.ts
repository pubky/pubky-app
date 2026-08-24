import { act, renderHook, waitFor } from '@testing-library/react';
import type { ClipboardEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asInvalid } from '@/test-utils/type-assertions';
import { useAddContentForm } from './useAddContentForm';
import { ADD_CONTENT_FORM_FIELDS } from './useAddContentForm.types';

const AUTHOR = 'a'.repeat(52);
const VIEWER = 'v'.repeat(52);
const POST_ID = '00357R34CQ8Q0';
const COMPOSITE_ID = `${AUTHOR}:${POST_ID}`;
const POST_URI = `pubky://${AUTHOR}/pub/pubky.app/posts/${POST_ID}`;
const POST_URL = `https://pubky.app/post/${AUTHOR}/${POST_ID}`;
const COLLECTION_ID = `${VIEWER}:collection-1`;

const mocks = vi.hoisted(() => ({
  currentUserPubky: 'v'.repeat(52) as string | null,
  bookmarkExists: vi.fn(),
  commitCreateBookmark: vi.fn(),
  getOrFetchPost: vi.fn(),
  getCollectionDetails: vi.fn(),
  commitUpdateCollectionItem: vi.fn(),
  onSuccess: vi.fn(),
  toast: vi.fn(),
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

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: mocks.toast,
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
    mocks.bookmarkExists.mockResolvedValue(false);
    mocks.commitCreateBookmark.mockResolvedValue(undefined);
    mocks.getOrFetchPost.mockResolvedValue(livePost());
    mocks.getCollectionDetails.mockResolvedValue(collectionDetails([]));
    mocks.commitUpdateCollectionItem.mockResolvedValue(undefined);
    mocks.onSuccess.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(navigator, 'permissions');
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
    expect(result.current.form.getFieldState(ADD_CONTENT_FORM_FIELDS.POST_URL).error?.message).toBe(
      'Enter a valid post URL.',
    );
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
    expect(mocks.toast).not.toHaveBeenCalled();
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
    expect(mocks.toast).toHaveBeenCalledWith({
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
    expect(mocks.toast).toHaveBeenCalledWith({
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
      'Enter a valid post URL.',
    );
  });
});
