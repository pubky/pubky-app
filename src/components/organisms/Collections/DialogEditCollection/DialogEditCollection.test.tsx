import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogEditCollection } from './DialogEditCollection';

const mocks = vi.hoisted(() => ({
  commitEditCollection: vi.fn(),
  setCollectionCover: vi.fn(),
  toast: vi.fn(),
  postDetails: null as { content: string } | null,
}));

const translations: Record<string, string> = {
  'collections.edit.title': 'Edit Collection',
  'collections.edit.save': 'Save changes',
  'collections.edit.updated': 'Collection updated',
  'collections.edit.updateFailed': 'Failed to update collection.',
  'collections.new.nameLabel': 'Title',
  'collections.new.namePlaceholder': 'Name your collection',
  'collections.new.descriptionLabel': 'Description',
  'collections.new.descriptionPlaceholder': 'What will people find here?',
  'collections.new.backgroundLabel': 'Background',
  'collections.new.addImage': 'Add image',
  'collections.new.removeImage': 'Remove image',
  'collections.new.coverImageInvalid': 'Cover image must be an image file.',
  'collections.new.coverImageTooLarge': 'Cover image is too large.',
  'collections.new.nameRequired': 'Collection title is required.',
  'collections.new.cancel': 'Cancel',
  'collections.new.saving': 'Saving...',
  'toast.success': 'Success',
  'toast.error': 'Error',
};

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitEditCollection: (...args: unknown[]) => mocks.commitEditCollection(...args),
  },
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: () => ({ postDetails: mocks.postDetails, isLoading: false }),
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/stores/localFiles/localFiles.store', () => ({
  useLocalFilesStore: Object.assign(
    (selector: (state: { collections: Record<string, string | undefined> }) => unknown) =>
      selector({ collections: {} }),
    {
      getState: () => ({ setCollectionCover: mocks.setCollectionCover }),
    },
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string>): string => {
      const translation = translations[`${namespace}.${key}`] ?? key;
      return Object.entries(values ?? {}).reduce((msg, [n, v]) => msg.replace(`{${n}}`, v), translation);
    },
}));

const COMPOSITE_ID = 'pk:author/posts/c1';

const collectionContent = (overrides?: { name?: string; description?: string; cover_image?: string | null }) =>
  JSON.stringify({
    name: overrides?.name ?? 'Reading list',
    description: overrides?.description ?? 'Top picks',
    items: [],
    cover_image: overrides?.cover_image ?? null,
  });

describe('DialogEditCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postDetails = { content: collectionContent() };
  });

  it('renders the edit-specific title and submit label', async () => {
    const onOpenChange = vi.fn();
    render(<DialogEditCollection open onOpenChange={onOpenChange} compositeCollectionId={COMPOSITE_ID} />);

    expect(await screen.findByRole('heading', { name: 'Edit Collection' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('does not show the create-form Save collection label on edit', async () => {
    render(<DialogEditCollection open onOpenChange={vi.fn()} compositeCollectionId={COMPOSITE_ID} />);

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save collection' })).not.toBeInTheDocument();
  });

  it('prefills the form with the current collection name and description from the envelope', async () => {
    mocks.postDetails = {
      content: collectionContent({ name: 'Proof of Work', description: 'Bitcoin essays' }),
    };
    render(<DialogEditCollection open onOpenChange={vi.fn()} compositeCollectionId={COMPOSITE_ID} />);

    await waitFor(() => {
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Proof of Work');
      expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Bitcoin essays');
    });
  });

  it('suppresses the autofocus highlight on the prefilled title field', async () => {
    mocks.postDetails = {
      content: collectionContent({ name: 'Proof of Work', description: 'Bitcoin essays' }),
    };
    render(<DialogEditCollection open onOpenChange={vi.fn()} compositeCollectionId={COMPOSITE_ID} />);

    await screen.findByLabelText('Title');
    // The wrapper passes `disableOpenAutoFocus` so Radix's open-autofocus is
    // intercepted; the title input should not own focus on first paint.
    expect(document.activeElement).not.toBe(screen.getByLabelText('Title'));
  });

  it('submits via PostController.commitEditCollection and closes the dialog on success', async () => {
    mocks.commitEditCollection.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<DialogEditCollection open onOpenChange={onOpenChange} compositeCollectionId={COMPOSITE_ID} />);

    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Reading list'));

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocks.commitEditCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          compositeCollectionId: COMPOSITE_ID,
          name: 'New name',
        }),
      );
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Collection updated',
    });
  });

  it('keeps the dialog open and toasts an error when the controller throws', async () => {
    mocks.commitEditCollection.mockRejectedValue(new Error('boom'));
    const onOpenChange = vi.fn();
    render(<DialogEditCollection open onOpenChange={onOpenChange} compositeCollectionId={COMPOSITE_ID} />);

    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Reading list'));

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Failed to update collection.',
      });
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('disables inputs and the picker while the collection envelope is loading', async () => {
    // Until `usePostDetails` resolves, the hook returns isLoaded=false. The
    // dialog wires that through DialogCollectionForm so the user can't type
    // into fields that the prefill effect is about to overwrite.
    mocks.postDetails = null;

    render(<DialogEditCollection open onOpenChange={vi.fn()} compositeCollectionId={COMPOSITE_ID} />);

    expect(await screen.findByLabelText('Title')).toBeDisabled();
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    // Cancel stays available so the user can dismiss while loading.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('calls onOpenChange(false) when the Cancel button is clicked', async () => {
    const onOpenChange = vi.fn();
    render(<DialogEditCollection open onOpenChange={onOpenChange} compositeCollectionId={COMPOSITE_ID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('DialogEditCollection - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.postDetails = { content: collectionContent() };
  });

  it('matches snapshot when open with the envelope prefilled', async () => {
    mocks.postDetails = {
      content: collectionContent({ name: 'Proof of Work', description: 'Bitcoin essays' }),
    };

    render(<DialogEditCollection open onOpenChange={vi.fn()} compositeCollectionId={COMPOSITE_ID} />);

    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Proof of Work'));
    expect(document.body).toMatchSnapshot();
  });
});
