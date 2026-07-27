import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT } from '@/config/collections';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { useCreateCollection } from './useCreateCollection';
import { CREATE_COLLECTION_FORM_FIELDS } from './useCreateCollection.types';

const mocks = vi.hoisted(() => ({
  commitCreateCollection: vi.fn(),
  setCollectionCover: vi.fn(),
  toast: vi.fn(),
  currentUserPubky: 'current-user' as string | null,
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

const translations: Record<string, string> = {
  'collections.new.nameRequired': 'Collection title is required.',
  'collections.new.created': 'Collection created',
  'collections.new.createFailed': 'Failed to create collection.',
  'toast.file.imageTooLargeGif':
    'This GIF exceeds the {maxSize} upload limit and cannot be compressed. Please use a smaller GIF.',
  'toast.success': 'Success',
  'toast.error': 'Error',
};

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitCreateCollection: (...args: unknown[]) => mocks.commitCreateCollection(...args),
  },
}));

vi.mock('@/hooks/useCoverImagePicker/useCoverImagePicker', () => ({
  useCoverImagePicker: () => mocks.cover,
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: mocks.currentUserPubky }),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: {
    getState: () => ({ setCollectionCover: mocks.setCollectionCover }),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string>): string =>
      Object.entries(values ?? {}).reduce(
        (msg, [n, v]) => msg.replace(`{${n}}`, v),
        translations[`${namespace}.${key}`] ?? key,
      ),
}));

describe('useCreateCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cover.file = null;
    mocks.cover.reset.mockClear();
    mocks.currentUserPubky = 'current-user';
  });

  it('exposes an RHF form with empty defaults and an idle cover picker', () => {
    const { result } = renderHook(() => useCreateCollection());

    expect(result.current.form.getValues()).toEqual({
      [CREATE_COLLECTION_FORM_FIELDS.NAME]: '',
      [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: '',
      [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: COLLECTION_LAYOUT.GRID,
    });
    expect(result.current.cover.file).toBeNull();
    expect(result.current.form.formState.isSubmitting).toBe(false);
  });

  it('rejects an empty title via zod and does not call the controller', async () => {
    const { result } = renderHook(() => useCreateCollection());

    let saved: string | null = null;
    await act(async () => {
      saved = await result.current.submit();
    });

    expect(saved).toBeNull();
    expect(mocks.commitCreateCollection).not.toHaveBeenCalled();
    // Whitespace-only also rejected
    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, '   '));

    await act(async () => {
      saved = await result.current.submit();
    });

    expect(saved).toBeNull();
    expect(mocks.commitCreateCollection).not.toHaveBeenCalled();
  });

  it('saves the collection with the picker file and toasts success', async () => {
    mocks.commitCreateCollection.mockResolvedValue('current-user:c1');
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    mocks.cover.file = file;

    const { result } = renderHook(() => useCreateCollection());

    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, '  Proof of Work  '));
    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION, 'Bitcoin writing'));
    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.LAYOUT, COLLECTION_LAYOUT.LIST));

    let saved: string | null = null;
    await act(async () => {
      saved = await result.current.submit();
    });

    expect(saved).toBe('current-user:c1');
    expect(mocks.commitCreateCollection).toHaveBeenCalledWith({
      authorId: 'current-user',
      name: '  Proof of Work  ',
      description: 'Bitcoin writing',
      coverImage: file,
      layout: COLLECTION_LAYOUT.LIST,
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Collection created',
    });
  });

  it('seeds the local-files store with a blob URL of the picked cover File so the cover renders instantly', async () => {
    mocks.commitCreateCollection.mockResolvedValue('current-user:c1');
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    mocks.cover.file = file;
    const createObjectURL = vi.fn(() => 'blob:mock-cover');
    vi.stubGlobal('URL', { ...URL, createObjectURL });

    const { result } = renderHook(() => useCreateCollection());
    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, 'Reading list'));

    await act(async () => {
      await result.current.submit();
    });

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(mocks.setCollectionCover).toHaveBeenCalledWith('current-user:c1', 'blob:mock-cover');

    vi.unstubAllGlobals();
  });

  it('does not touch the local-files store when no cover File is picked', async () => {
    mocks.commitCreateCollection.mockResolvedValue('current-user:c1');
    mocks.cover.file = null;

    const { result } = renderHook(() => useCreateCollection());
    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, 'Reading list'));

    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.setCollectionCover).not.toHaveBeenCalled();
  });

  it('returns null and toasts an error when the controller throws', async () => {
    mocks.commitCreateCollection.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCreateCollection());

    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, 'Reading list'));

    let saved: string | null = null;
    await act(async () => {
      saved = await result.current.submit();
    });

    expect(saved).toBeNull();
    expect(mocks.toast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to create collection.',
    });
  });

  it('toasts a localized size-limit message when cover upload exceeds the limit', async () => {
    mocks.commitCreateCollection.mockRejectedValue(
      Err.validation(ValidationErrorCode.INVALID_INPUT, 'Failed to upload collection cover image', {
        service: ErrorService.Local,
        operation: 'commitCreateCollection',
        cause: Err.validation(ValidationErrorCode.INVALID_INPUT, 'Image sanitization failed', {
          service: ErrorService.Local,
          operation: 'toFileAttachment',
          context: { imageUploadSizeLimitKind: 'gif' },
          cause: new Error('IMAGE_UPLOAD_SIZE_LIMIT:gif'),
        }),
      }),
    );

    const { result } = renderHook(() => useCreateCollection());
    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, 'Reading list'));

    await act(async () => {
      await result.current.submit();
    });

    expect(mocks.toast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'This GIF exceeds the 5MB upload limit and cannot be compressed. Please use a smaller GIF.',
    });
  });

  it('returns null without calling the controller when the user is unauthenticated', async () => {
    mocks.currentUserPubky = null;
    const { result } = renderHook(() => useCreateCollection());

    act(() => result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, 'Reading list'));

    let saved: string | null = null;
    await act(async () => {
      saved = await result.current.submit();
    });

    expect(saved).toBeNull();
    expect(mocks.commitCreateCollection).not.toHaveBeenCalled();
  });

  it('reset() clears form values and resets the cover picker', () => {
    const { result } = renderHook(() => useCreateCollection());

    act(() => {
      result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.NAME, 'Reading list');
      result.current.form.setValue(CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION, 'Some books');
    });

    act(() => result.current.reset());

    expect(result.current.form.getValues()).toEqual({
      [CREATE_COLLECTION_FORM_FIELDS.NAME]: '',
      [CREATE_COLLECTION_FORM_FIELDS.DESCRIPTION]: '',
      [CREATE_COLLECTION_FORM_FIELDS.LAYOUT]: COLLECTION_LAYOUT.GRID,
    });
    expect(mocks.cover.reset).toHaveBeenCalledTimes(1);
  });
});
