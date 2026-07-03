import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionsSections } from './CollectionsSections';

const authState = vi.hoisted(() => ({
  hasHydrated: true,
  currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy' as string | null,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('@/organisms/Collections/MyCollections/MyCollections', () => ({
  MyCollections: ({ showPublicNote }: { showPublicNote?: boolean }) => (
    <div data-testid="my-collections" data-show-public-note={String(showPublicNote ?? false)} />
  ),
}));

vi.mock('@/organisms/Collections/FollowedCollections/FollowedCollections', () => ({
  FollowedCollections: () => <div data-testid="followed-collections" />,
}));

vi.mock('@/organisms/Collections/DiscoverCollections/DiscoverCollections', () => ({
  DiscoverCollections: () => <div data-testid="discover-collections" />,
}));

describe('CollectionsSections', () => {
  beforeEach(() => {
    authState.hasHydrated = true;
    authState.currentUserPubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
  });

  it('renders My, Followed, and Discover sections in canonical order for authenticated users', () => {
    render(<CollectionsSections />);

    const my = screen.getByTestId('my-collections');
    const followed = screen.getByTestId('followed-collections');
    const discover = screen.getByTestId('discover-collections');

    expect(my).toBeInTheDocument();
    expect(followed).toBeInTheDocument();
    expect(discover).toBeInTheDocument();

    expect(my.compareDocumentPosition(followed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(followed.compareDocumentPosition(discover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders only Discover for guests after auth hydration', () => {
    authState.currentUserPubky = null;

    render(<CollectionsSections />);

    expect(screen.queryByTestId('my-collections')).not.toBeInTheDocument();
    expect(screen.queryByTestId('followed-collections')).not.toBeInTheDocument();
    expect(screen.getByTestId('discover-collections')).toBeInTheDocument();
  });

  it('renders only Discover while auth is still hydrating', () => {
    authState.hasHydrated = false;
    authState.currentUserPubky = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

    render(<CollectionsSections />);

    expect(screen.queryByTestId('my-collections')).not.toBeInTheDocument();
    expect(screen.queryByTestId('followed-collections')).not.toBeInTheDocument();
    expect(screen.getByTestId('discover-collections')).toBeInTheDocument();
  });

  it('applies a custom className to the outer container', () => {
    const { container } = render(<CollectionsSections className="custom-sections-class" />);

    const outer = container.firstElementChild;
    expect(outer).not.toBeNull();
    expect(outer?.className).toContain('custom-sections-class');
  });

  it('forwards showMyCollectionsPublicNote=false to MyCollections by default', () => {
    render(<CollectionsSections />);

    expect(screen.getByTestId('my-collections')).toHaveAttribute('data-show-public-note', 'false');
  });

  it('forwards showMyCollectionsPublicNote=true to MyCollections when set', () => {
    render(<CollectionsSections showMyCollectionsPublicNote />);

    expect(screen.getByTestId('my-collections')).toHaveAttribute('data-show-public-note', 'true');
  });

  it('matches the snapshot for authenticated users', () => {
    const { container } = render(<CollectionsSections />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot for guests', () => {
    authState.currentUserPubky = null;

    const { container } = render(<CollectionsSections />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
