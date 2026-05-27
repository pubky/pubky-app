import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/atoms/Button/Button';
import { NewCollectionDialog } from './NewCollectionDialog';

const mocks = vi.hoisted(() => ({
  commitCreateCollection: vi.fn(),
  toast: vi.fn(),
}));

const translations: Record<string, string> = {
  'collections.new.title': 'New Collection',
  'collections.new.nameLabel': 'Title',
  'collections.new.namePlaceholder': 'Proof of Work',
  'collections.new.descriptionLabel': 'Description',
  'collections.new.descriptionPlaceholder': 'The best from the biggest contributors in Bitcoin',
  'collections.new.backgroundLabel': 'Background',
  'collections.new.addImage': 'Add image',
  'collections.new.removeImage': 'Remove image',
  'collections.new.coverImageInvalid': 'Cover image must be an image file.',
  'collections.new.coverImageTooLarge': 'Cover image is too large.',
  'collections.new.nameRequired': 'Collection title is required.',
  'collections.new.cancel': 'Cancel',
  'collections.new.save': 'Save collection',
  'collections.new.saving': 'Saving...',
  'collections.new.created': 'Collection {name} created',
  'collections.new.createFailed': 'Failed to create collection.',
  'toast.success': 'Success',
  'toast.error': 'Error',
};

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitCreateCollection: (...args: unknown[]) => mocks.commitCreateCollection(...args),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'current-user' }),
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string>): string => {
      const translation = translations[`${namespace}.${key}`] ?? key;
      return Object.entries(values ?? {}).reduce(
        (message, [name, value]) => message.replace(`{${name}}`, value),
        translation,
      );
    },
}));

describe('NewCollectionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens from the trigger and renders collection fields', () => {
    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New Collection' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('placeholder', 'Proof of Work');
    expect(screen.getByLabelText('Description')).toHaveAttribute(
      'placeholder',
      'The best from the biggest contributors in Bitcoin',
    );
  });

  it('disables save until a title is entered', () => {
    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(screen.getByRole('button', { name: 'Save collection' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Proof of Work' } });

    expect(screen.getByRole('button', { name: 'Save collection' })).toBeEnabled();
  });

  it('shows required title feedback after blurring an empty title field', async () => {
    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(screen.queryByText('Collection title is required.')).not.toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText('Title'));

    expect(await screen.findByText('Collection title is required.')).toBeInTheDocument();
  });

  it('clears required title feedback when a valid title is entered', async () => {
    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.blur(screen.getByLabelText('Title'));

    expect(await screen.findByText('Collection title is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Proof of Work' } });

    await waitFor(() => {
      expect(screen.queryByText('Collection title is required.')).not.toBeInTheDocument();
    });
  });

  it('shows required title feedback for whitespace-only titles', async () => {
    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } });
    fireEvent.blur(screen.getByLabelText('Title'));

    expect(await screen.findByText('Collection title is required.')).toBeInTheDocument();
  });

  it('creates a collection with title and description', async () => {
    mocks.commitCreateCollection.mockResolvedValue('current-user:collection1');

    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Proof of Work' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Bitcoin writing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save collection' }));

    await waitFor(() => {
      expect(mocks.commitCreateCollection).toHaveBeenCalledWith({
        authorId: 'current-user',
        name: 'Proof of Work',
        description: 'Bitcoin writing',
        coverImage: null,
      });
    });
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Success',
      description: 'Collection Proof of Work created',
    });
  });

  it('forwards a chosen cover image file to commitCreateCollection', async () => {
    mocks.commitCreateCollection.mockResolvedValue('current-user:collection1');
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL out of the box.
    const createObjectURL = vi.fn(() => 'blob:mock-cover');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Cover collection' } });

    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    const fileInput = document.getElementById('new-collection-cover-image') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByRole('button', { name: 'Remove image' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save collection' }));

    await waitFor(() => {
      expect(mocks.commitCreateCollection).toHaveBeenCalledWith({
        authorId: 'current-user',
        name: 'Cover collection',
        description: '',
        coverImage: file,
      });
    });

    vi.unstubAllGlobals();
  });

  it('rejects non-image files for the cover image picker', () => {
    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const fileInput = document.getElementById('new-collection-cover-image') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText('Cover image must be an image file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeInTheDocument();
  });

  it('matches snapshot when open', () => {
    render(
      <NewCollectionDialog>
        <Button>Open dialog</Button>
      </NewCollectionDialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(document.body).toMatchSnapshot();
  });
});
