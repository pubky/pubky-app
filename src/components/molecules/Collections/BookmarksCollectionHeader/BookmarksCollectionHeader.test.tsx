import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookmarksCollectionHeader } from './BookmarksCollectionHeader';

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({
    avatarUrl,
    name,
    fallbackSeed,
    size,
    alt,
  }: {
    avatarUrl?: string;
    name: string;
    fallbackSeed?: string;
    size?: string;
    alt?: string;
  }) => (
    <div
      data-testid="avatar-with-fallback"
      data-avatar-url={avatarUrl}
      data-name={name}
      data-fallback-seed={fallbackSeed}
      data-size={size}
      data-alt={alt}
    >
      {name}
    </div>
  ),
}));

const defaultProps = {
  title: 'Bookmarks',
  description: 'Everything you saved for later',
  ownerName: 'Test User',
  visibilityLabel: 'PRIVATE',
  postCount: 29,
  ownerAvatarUrl: 'https://example.com/avatar.png',
  ownerSeed: 'test-pubky',
};

describe('BookmarksCollectionHeader', () => {
  it('renders the collection title, owner, count, visibility, and description', () => {
    render(<BookmarksCollectionHeader {...defaultProps} />);

    const header = screen.getByTestId('bookmarks-collection-header');
    expect(screen.getByRole('heading', { name: 'Bookmarks' })).toBeInTheDocument();
    expect(screen.getByText('Everything you saved for later')).toBeInTheDocument();
    expect(header).toHaveTextContent('Test User');
    expect(header).toHaveTextContent('29');
    expect(header).toHaveTextContent('PRIVATE');
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute(
      'data-avatar-url',
      'https://example.com/avatar.png',
    );
    expect(document.querySelector('.lucide-sticky-note')).toBeInTheDocument();
    expect(document.querySelector('.lucide-circle-user-round')).toBeInTheDocument();
  });

  it('does not render collection management actions', () => {
    render(<BookmarksCollectionHeader {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reorder/i })).not.toBeInTheDocument();
  });
});

describe('BookmarksCollectionHeader - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<BookmarksCollectionHeader {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
