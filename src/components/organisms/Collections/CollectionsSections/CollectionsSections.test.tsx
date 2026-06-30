import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CollectionsSections } from './CollectionsSections';

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
  it('renders My, Followed, and Discover sections in canonical order', () => {
    render(<CollectionsSections />);

    const my = screen.getByTestId('my-collections');
    const followed = screen.getByTestId('followed-collections');
    const discover = screen.getByTestId('discover-collections');

    expect(my).toBeInTheDocument();
    expect(followed).toBeInTheDocument();
    expect(discover).toBeInTheDocument();

    // My precedes Followed precedes Discover in DOM order.
    expect(my.compareDocumentPosition(followed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(followed.compareDocumentPosition(discover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('matches the snapshot', () => {
    const { container } = render(<CollectionsSections />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
