import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostSavePicker } from './PostSavePicker';

const mockState = vi.hoisted(() => ({
  isMobile: false,
  toggleBookmark: vi.fn(),
  toggleCollection: vi.fn(),
  createCollectionWithPost: vi.fn(),
  setShowSignInDialog: vi.fn(),
}));

const translations: Record<string, string> = {
  'postSave.title': 'Save post',
  'postSave.description': 'Choose where this post should be saved.',
  'postSave.open': 'Save post',
  'postSave.loading': 'Loading save options',
  'postSave.bookmarks': 'Bookmarks',
  'postSave.newCollection': 'New Collection',
  'postSave.collectionNamePlaceholder': 'Collection name',
  'postSave.createCollection': 'Create collection',
  'postSave.loadingCollections': 'Loading collections...',
};

vi.mock('@/hooks/usePostSaveTargets/usePostSaveTargets', () => ({
  usePostSaveTargets: () => ({
    isBookmarked: true,
    isBookmarkLoading: false,
    isBookmarkToggling: false,
    collections: [
      {
        id: 'author:collection1',
        name: 'Proof of Work',
        description: 'Bitcoin writing',
        isSaved: true,
        isUpdating: false,
      },
      {
        id: 'author:collection2',
        name: 'AI Papers',
        description: '',
        isSaved: false,
        isUpdating: false,
      },
    ],
    isCollectionsLoading: false,
    isCreatingCollection: false,
    toggleBookmark: mockState.toggleBookmark,
    toggleCollection: mockState.toggleCollection,
    createCollectionWithPost: mockState.createCollectionWithPost,
  }),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockState.isMobile,
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({
    isAuthenticated: true,
    requireAuth: <T,>(action: () => T) => action(),
  }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: () => ({
      currentUserPubky: 'current-user',
      setShowSignInDialog: mockState.setShowSignInDialog,
    }),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      translations[`${namespace}.${key}`] ?? key,
}));

describe('PostSavePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.isMobile = false;
  });

  const renderPicker = () => render(<PostSavePicker postId="author:post1" buttonClassName="border-none shadow-xs" />);

  const openPicker = () => {
    const trigger = screen.getByRole('button', { name: 'Save post' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
  };

  it('opens the desktop save menu with bookmarks and collections', async () => {
    renderPicker();

    openPicker();

    await waitFor(() => {
      expect(screen.getByText('Bookmarks')).toBeInTheDocument();
      expect(screen.getByText('Proof of Work')).toBeInTheDocument();
      expect(screen.getByText('AI Papers')).toBeInTheDocument();
    });
  });

  it('toggles bookmark and collection targets from the desktop menu', async () => {
    renderPicker();

    openPicker();

    fireEvent.click(await screen.findByText('Bookmarks'));
    expect(mockState.toggleBookmark).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Proof of Work'));
    expect(mockState.toggleCollection).toHaveBeenCalledWith('author:collection1');
  });

  it('creates a collection from the inline field', async () => {
    renderPicker();

    openPicker();
    fireEvent.change(await screen.findByPlaceholderText('Collection name'), { target: { value: 'Reading list' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    });

    expect(mockState.createCollectionWithPost).toHaveBeenCalledWith('Reading list');
  });

  it('keeps inline field keyboard events from bubbling to the menu', async () => {
    const keyDownListener = vi.fn();

    renderPicker();

    openPicker();
    const input = await screen.findByPlaceholderText('Collection name');

    document.addEventListener('keydown', keyDownListener);

    try {
      fireEvent.keyDown(input, { key: 'V', code: 'KeyV', metaKey: true });
      fireEvent.keyDown(input, { key: 'V', code: 'KeyV' });

      expect(keyDownListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', keyDownListener);
    }
  });

  it('uses a bottom sheet on mobile', async () => {
    mockState.isMobile = true;

    renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Save post' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Save post')).toBeInTheDocument();
    });
    expect(screen.queryByText('Choose where this post should be saved.')).not.toBeInTheDocument();
  });

  it('matches desktop picker snapshot when open', async () => {
    renderPicker();

    openPicker();

    await screen.findByText('Bookmarks');

    expect(document.body).toMatchSnapshot();
  });
});
