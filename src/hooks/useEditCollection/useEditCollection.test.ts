import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';
import { CREATE_COLLECTION_FORM_FIELDS } from '@/hooks/useCreateCollection/useCreateCollection.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import { useEditCollection } from './useEditCollection';

const mocks = vi.hoisted(() => ({
  commitEditCollection: vi.fn(),
  setCollectionCover: vi.fn(),
  useCoverImagePicker: vi.fn(),
  postDetails: null as { content: string } | null,
  localCollections: {} as Record<string, string | undefined>,
  cover: {
    file: null as File | null,
    previewUrl: null as string | null,
    isCleared: false,
    error: null as 'invalid-type' | 'too-large' | null,
    inputRef: { current: null },
    onInputChange: vi.fn(),
    choose: vi.fn(),
    remove: vi.fn(),
    reset: vi.fn(),
  },
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitEditCollection: (...args: unknown[]) => mocks.commitEditCollection(...args),
  },
}));

vi.mock('@/hooks/useCoverImagePicker/useCoverImagePicker', () => ({
  useCoverImagePicker: (params?: { initialPreviewUrl?: string | null }) => {
    mocks.useCoverImagePicker(params);
    return mocks.cover;
  },
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: () => ({ postDetails: mocks.postDetails, isLoading: false }),
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: Object.assign(
    (selector: (state: { collections: Record<string, string | undefined> }) => unknown) =>
      selector({ collections: mocks.localCollections }),
    {
      getState: () => ({ setCollectionCover: mocks.setCollectionCover }),
    },
  ),
}));
const collectionContent = (overrides?: {
  name?: string;
  description?: string;
  cover_image?: string | null;
  layout?: CollectionLayout;
}) =>
  JSON.stringify({
    name: overrides?.name ?? 'Reading list',
    description: overrides?.description ?? 'Top picks',
    items: [],
    cover_image: overrides?.cover_image ?? null,
    layout: overrides?.layout,
  });

const COMPOSITE_ID = 'pk:author/posts/c1';

describe('useEditCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cover.file = null;
    mocks.cover.isCleared = false;
    mocks.cover.reset.mockClear();
    mocks.postDetails = { content: collectionContent() };
    for (const key of Object.keys(mocks.localCollections)) delete mocks.localCollections[key];
  });

  it('prefills the form once the collection envelope loads', async () => {
    mocks.postDetails = { content: collectionContent({ layout: COLLECTION_LAYOUT.LIST }) };
    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));

    await waitFor(() => {
      expect(result.current.form.getValues()).toEqual({
        [CREATE_COLLECTION_FORM_FIELDS.NAME]: 'Reading list',
        [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: 'Top picks',
        [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: COLLECTION_LAYOUT.LIST,
      });
    });
    expect(result.current.isLoaded).toBe(true);
  });

  it('prefills the Visual layout and keeps it on submit when untouched', async () => {
    mocks.postDetails = { content: collectionContent({ layout: COLLECTION_LAYOUT.VISUAL }) };
    mocks.commitEditCollection.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));

    await waitFor(() => {
      expect(result.current.form.getValues()[CREATE_COLLECTION_FORM_FIELDS.LAYOUT]).toBe(COLLECTION_LAYOUT.VISUAL);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(mocks.commitEditCollection).toHaveBeenCalledWith(
      expect.objectContaining({ layout: COLLECTION_LAYOUT.VISUAL }),
    );
  });

  it('submits with the original cover URL when the user does not touch the picker', async () => {
    mocks.postDetails = {
      content: collectionContent({ cover_image: 'pubky://author/files/cover-1' }),
    };
    mocks.commitEditCollection.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, 'New name'));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(mocks.commitEditCollection).toHaveBeenCalledWith({
      compositeCollectionId: COMPOSITE_ID,
      name: 'New name',
      description: 'Top picks',
      coverImage: 'pubky://author/files/cover-1',
      layout: COLLECTION_LAYOUT.GRID,
    });
    // No new file picked → store should NOT be touched (CDN already has it).
    expect(mocks.setCollectionCover).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Collection updated',
    });
  });

  it('uploads the new cover file and seeds the local-files store with a blob URL', async () => {
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    mocks.cover.file = file;
    mocks.commitEditCollection.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(mocks.commitEditCollection).toHaveBeenCalledWith(expect.objectContaining({ coverImage: file }));
    expect(mocks.setCollectionCover).toHaveBeenCalledWith(COMPOSITE_ID, expect.stringMatching(/^blob:/));
  });

  it('passes null when the user explicitly removes the cover and clears the local-files store', async () => {
    mocks.postDetails = {
      content: collectionContent({ cover_image: 'pubky://author/files/cover-1' }),
    };
    mocks.cover.isCleared = true;
    mocks.commitEditCollection.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let ok = false;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(true);
    expect(mocks.commitEditCollection).toHaveBeenCalledWith(expect.objectContaining({ coverImage: null }));
    expect(mocks.setCollectionCover).toHaveBeenCalledWith(COMPOSITE_ID, null);
  });

  it('returns false and toasts an error when the controller throws', async () => {
    mocks.commitEditCollection.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to update collection.',
    });
  });

  it('toasts a localized size-limit message when cover upload exceeds the limit', async () => {
    mocks.commitEditCollection.mockRejectedValue(
      Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to upload collection cover image', {
        service: ErrorService.Local,
        operation: 'commitEditCollection',
        cause: Err.validation(ValidationErrorCode.INVALID_INPUT, 'Image sanitization failed', {
          service: ErrorService.Local,
          operation: 'toFileAttachment',
          context: { imageUploadSizeLimitKind: 'gif' },
          cause: new Error('IMAGE_UPLOAD_SIZE_LIMIT:gif'),
        }),
      }),
    );

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'This GIF exceeds the 5MB upload limit and cannot be compressed. Please use a smaller GIF.',
    });
  });

  it('seeds the cover picker with the local-files-store blob URL when present', async () => {
    mocks.postDetails = {
      content: collectionContent({ cover_image: 'pubky://author/files/cover-1' }),
    };
    mocks.localCollections[COMPOSITE_ID] = 'blob:fresh-cover';

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(mocks.useCoverImagePicker).toHaveBeenCalledWith(
      expect.objectContaining({ initialPreviewUrl: 'blob:fresh-cover' }),
    );
  });

  it('falls back to the resolved envelope cover URL when the local store has no entry', async () => {
    mocks.postDetails = {
      content: collectionContent({ cover_image: 'https://cdn.example.com/cover.png' }),
    };

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    expect(mocks.useCoverImagePicker).toHaveBeenCalledWith(
      expect.objectContaining({ initialPreviewUrl: 'https://cdn.example.com/cover.png' }),
    );
  });

  it('preserves the original cover URL (not the local blob) on submit when the user does not touch the picker', async () => {
    // Regression: after a previous edit replaced the cover, the local store
    // holds a blob URL. The next submit-without-changes must still write the
    // *envelope* URL back, not the blob URL.
    mocks.postDetails = {
      content: collectionContent({ cover_image: 'pubky://author/files/cover-1' }),
    };
    mocks.localCollections[COMPOSITE_ID] = 'blob:fresh-cover';
    mocks.commitEditCollection.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.commitEditCollection).toHaveBeenCalledWith(
      expect.objectContaining({ coverImage: 'pubky://author/files/cover-1' }),
    );
    expect(mocks.setCollectionCover).not.toHaveBeenCalled();
  });

  it('returns false without calling the controller when the collection envelope is missing', async () => {
    mocks.postDetails = null;

    const { result } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));

    let ok = true;
    await act(async () => {
      ok = await result.current.submit();
    });

    expect(ok).toBe(false);
    expect(mocks.commitEditCollection).not.toHaveBeenCalled();
  });

  it('resets to the just-committed envelope when the live query propagates BEFORE close (stale reopen regression)', async () => {
    // Regression (QA find): the local-first commit propagates the committed
    // envelope through the Dexie live query while the save is still awaited,
    // so by the time the dialog closes, the `reset` the close handler captured
    // belongs to the pre-save render. Reading the render-scope values there
    // wrote the page-load layout back into the form, and the prefill effect
    // never re-fired (its deps had already changed while the guard was armed) —
    // so reopening the dialog highlighted the old layout until a page refresh.
    mocks.postDetails = { content: collectionContent({ layout: COLLECTION_LAYOUT.GRID }) };
    const { result, rerender } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));

    await waitFor(() => {
      expect(result.current.form.getValues()[CREATE_COLLECTION_FORM_FIELDS.LAYOUT]).toBe(COLLECTION_LAYOUT.GRID);
    });

    // Capture reset from the pre-save render — this is the closure the dialog's
    // close handler actually holds when the save resolves.
    const staleReset = result.current.reset;

    // User picks Visual and saves; the live query emits the committed envelope
    // before the dialog close runs.
    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.LAYOUT, COLLECTION_LAYOUT.VISUAL));
    await act(async () => {
      mocks.postDetails = { content: collectionContent({ layout: COLLECTION_LAYOUT.VISUAL }) };
      rerender();
    });

    act(() => staleReset());

    expect(result.current.form.getValues()[CREATE_COLLECTION_FORM_FIELDS.LAYOUT]).toBe(COLLECTION_LAYOUT.VISUAL);
  });

  it('re-prefills the form from the latest envelope after reset() — even when the live query updates AFTER close', async () => {
    // Regression: the dialog stays mounted across open/close cycles, so the
    // hook's `hasPrefilledRef` persists. If reset() runs before the post-commit
    // Dexie live query has propagated, `originalName` / `originalDescription`
    // captured in reset's closure are stale and the form gets written back to
    // the pre-save values. The fix has two parts:
    //   1. `reset()` clears `hasPrefilledRef.current` so the next envelope-driven
    //      re-render can prefill again.
    //   2. The prefill effect's deps only watch `originalName` /
    //      `originalDescription` (not `collection`, which is a fresh object on
    //      every render and would otherwise re-arm the guard with stale closure
    //      values via the RHF re-render that `form.reset()` itself schedules).
    mocks.postDetails = { content: collectionContent({ name: 'Old name', description: 'Old description' }) };
    const { result, rerender } = renderHook(() => useEditCollection({ compositeCollectionId: COMPOSITE_ID }));

    await waitFor(() => {
      expect(result.current.form.getValues()).toEqual({
        [CREATE_COLLECTION_FORM_FIELDS.NAME]: 'Old name',
        [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: 'Old description',
        [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: COLLECTION_LAYOUT.GRID,
      });
    });

    // User typed something, then the dialog closes — reset() runs while the
    // envelope is still the stale (pre-commit) value.
    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, 'User in-progress edit'));
    act(() => result.current.reset());

    // Now the Dexie live query catches up with the post-commit envelope.
    await act(async () => {
      mocks.postDetails = { content: collectionContent({ name: 'New name', description: 'New description' }) };
      rerender();
    });

    await waitFor(() => {
      expect(result.current.form.getValues()).toEqual({
        [CREATE_COLLECTION_FORM_FIELDS.NAME]: 'New name',
        [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: 'New description',
        [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: COLLECTION_LAYOUT.GRID,
      });
    });
  });
});
