import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewCollectionCardCTA } from './NewCollectionCardCTA';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: {
    commitCreateCollection: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useAuthoredCollections/useAuthoredCollections', () => ({
  useAuthoredCollections: () => ({ collections: [{ id: 'seed-collection' }], isLoading: false }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'current-user' }),
}));

describe('NewCollectionCardCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
});

describe('NewCollectionCardCTA - Snapshots', () => {
  it('matches the closed trigger snapshot', () => {
    const { container } = render(<NewCollectionCardCTA />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
