import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/atoms/Button/Button';
import { DialogNewCollection } from './DialogNewCollection';

const mocks = vi.hoisted(() => ({
  commitCreateCollection: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
  useAuthoredCollections: vi.fn(),
}));

const translations: Record<string, string> = {
  'collections.new.title': 'New Collection',
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
  'collections.new.save': 'Save collection',
  'collections.new.saving': 'Saving...',
  'collections.new.created': 'Collection created',
  'collections.new.createFailed': 'Failed to create collection.',
  'collections.intro.title': 'Welcome to Collections',
  'collections.intro.description':
    'Save posts worth keeping. Collect the best content from your network. Curate ideas, filter signal from noise, and share what matters.',
  'collections.intro.imageAlt': 'Collections',
  'collections.intro.cancel': 'Cancel',
  'collections.intro.continue': 'Continue',
  'toast.success': 'Success',
  'toast.error': 'Error',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitCreateCollection: (...args: unknown[]) => mocks.commitCreateCollection(...args),
  },
}));

vi.mock('@/hooks/useAuthoredCollections/useAuthoredCollections', () => ({
  useAuthoredCollections: () => mocks.useAuthoredCollections(),
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

describe('DialogNewCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to an existing collection so the onboarding intro is skipped and
    // the form opens directly; intro-gate tests override this with an empty list.
    mocks.useAuthoredCollections.mockReturnValue({ collections: [{ id: 'seed-collection' }], isLoading: false });
  });

  it('opens from the trigger and renders collection fields', () => {
    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New Collection' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('placeholder', 'Name your collection');
    expect(screen.getByLabelText('Description')).toHaveAttribute('placeholder', 'What will people find here?');
  });

  it('disables save until a title is entered', () => {
    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(screen.getByRole('button', { name: 'Save collection' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Proof of Work' } });

    expect(screen.getByRole('button', { name: 'Save collection' })).toBeEnabled();
  });

  it('does not show the edit-form Save changes label on create', () => {
    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(screen.getByRole('button', { name: 'Save collection' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('does not show required title feedback when the user only focuses then blurs an untouched title field', async () => {
    // The form is configured with `mode: 'onChange'` (not `'all'`) precisely so
    // clicking the dialog's X close button — which blurs the autofocused title
    // input — doesn't fire the required-field error, grow the dialog, and shift
    // the X button out from under the user's mouseup.
    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(screen.queryByText('Collection title is required.')).not.toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText('Title'));

    expect(screen.queryByText('Collection title is required.')).not.toBeInTheDocument();
  });

  it('shows required title feedback once the user types then erases the title', async () => {
    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Proof of Work' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });

    expect(await screen.findByText('Collection title is required.')).toBeInTheDocument();
  });

  it('clears required title feedback when a valid title is entered', async () => {
    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Draft' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });

    expect(await screen.findByText('Collection title is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Proof of Work' } });

    await waitFor(() => {
      expect(screen.queryByText('Collection title is required.')).not.toBeInTheDocument();
    });
  });

  it('shows required title feedback for whitespace-only titles', async () => {
    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } });
    fireEvent.blur(screen.getByLabelText('Title'));

    expect(await screen.findByText('Collection title is required.')).toBeInTheDocument();
  });

  it('creates a collection with title and description', async () => {
    mocks.commitCreateCollection.mockResolvedValue('current-user:collection1');

    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
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
      title: 'Collection created',
    });
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith('/collections/current-user/collection1');
    });
  });

  it('forwards a chosen cover image file to commitCreateCollection', async () => {
    mocks.commitCreateCollection.mockResolvedValue('current-user:collection1');
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL out of the box.
    const createObjectURL = vi.fn(() => 'blob:mock-cover');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
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
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const fileInput = document.getElementById('new-collection-cover-image') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText('Cover image must be an image file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeInTheDocument();
  });

  describe('controlled mode', () => {
    it('honors the controlled open prop without a trigger child', () => {
      const { rerender } = render(<DialogNewCollection open={false} onOpenChange={vi.fn()} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      rerender(<DialogNewCollection open onOpenChange={vi.fn()} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'New Collection' })).toBeInTheDocument();
    });

    it('calls onOpenChange when dismissed in controlled mode', () => {
      const onOpenChange = vi.fn();
      render(<DialogNewCollection open onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('onboarding intro gate', () => {
    it('shows the intro instead of the form for users with no collections', () => {
      mocks.useAuthoredCollections.mockReturnValue({ collections: [], isLoading: false });
      render(
        <DialogNewCollection>
          <Button>Open dialog</Button>
        </DialogNewCollection>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

      expect(screen.getByRole('heading', { name: 'Welcome to Collections' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'New Collection' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });

    it('waits for authored collections to load before showing either dialog state', () => {
      mocks.useAuthoredCollections.mockReturnValue({ collections: [], isLoading: true });
      render(
        <DialogNewCollection>
          <Button>Open dialog</Button>
        </DialogNewCollection>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

      expect(screen.queryByRole('heading', { name: 'Welcome to Collections' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'New Collection' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });

    it('advances from the intro to the form on Continue', () => {
      mocks.useAuthoredCollections.mockReturnValue({ collections: [], isLoading: false });
      render(
        <DialogNewCollection>
          <Button>Open dialog</Button>
        </DialogNewCollection>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(screen.getByRole('heading', { name: 'New Collection' })).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Welcome to Collections' })).not.toBeInTheDocument();
    });

    it('skips the intro for users who already have at least one collection', () => {
      mocks.useAuthoredCollections.mockReturnValue({ collections: [{ id: 'c1' }], isLoading: false });
      render(
        <DialogNewCollection>
          <Button>Open dialog</Button>
        </DialogNewCollection>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

      expect(screen.getByRole('heading', { name: 'New Collection' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Welcome to Collections' })).not.toBeInTheDocument();
    });

    it('does not open the form when the intro is dismissed', () => {
      mocks.useAuthoredCollections.mockReturnValue({ collections: [], isLoading: false });
      render(
        <DialogNewCollection>
          <Button>Open dialog</Button>
        </DialogNewCollection>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('heading', { name: 'Welcome to Collections' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'New Collection' })).not.toBeInTheDocument();
    });

    it('shows the intro in controlled mode for users with no collections', () => {
      mocks.useAuthoredCollections.mockReturnValue({ collections: [], isLoading: false });
      render(<DialogNewCollection open onOpenChange={vi.fn()} />);

      expect(screen.getByRole('heading', { name: 'Welcome to Collections' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });
  });
});

describe('DialogNewCollection - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuthoredCollections.mockReturnValue({ collections: [{ id: 'seed-collection' }], isLoading: false });
  });

  it('matches snapshot when open', () => {
    render(
      <DialogNewCollection>
        <Button>Open dialog</Button>
      </DialogNewCollection>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));

    expect(document.body).toMatchSnapshot();
  });
});
