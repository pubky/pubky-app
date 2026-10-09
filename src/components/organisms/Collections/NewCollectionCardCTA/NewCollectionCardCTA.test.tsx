import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { mockSession } from '@/test-utils/pubky';
import { NewCollectionCardCTA } from './NewCollectionCardCTA';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitCreateCollection: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/hooks/useAuthoredCollections/useAuthoredCollections', () => ({
  useAuthoredCollections: () => ({ collections: [{ id: 'seed-collection' }], isLoading: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    ...authInitialState,
    currentUserPubky: 'current-user',
    session: mockSession(),
    restoreStatus: 'ready',
    hasHydrated: true,
  });
});

describe('NewCollectionCardCTA', () => {
  it('renders the new collection trigger', () => {
    render(<NewCollectionCardCTA />);

    const trigger = screen.getByRole('button', { name: 'New Collection' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('data-cy', 'new-collection-card-cta');
  });

  it('opens the new collection dialog when the trigger is clicked', () => {
    render(<NewCollectionCardCTA />);

    fireEvent.click(screen.getByRole('button', { name: 'New Collection' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New Collection' })).toBeInTheDocument();
  });

  it('asks for sign-in when only the previous public identity remains', () => {
    useAuthStore.setState({ session: null, restoreStatus: 'reauth-required' });
    render(<NewCollectionCardCTA />);
    fireEvent.click(screen.getByRole('button', { name: 'New Collection' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useAuthStore.getState().showSignInDialog).toBe(true);
  });
});

describe('NewCollectionCardCTA - Snapshots', () => {
  it('matches the closed trigger snapshot', () => {
    const { container } = render(<NewCollectionCardCTA />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
