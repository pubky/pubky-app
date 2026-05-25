import { render, screen } from '@testing-library/react';
import { Bookmark } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { CollectionCard } from './CollectionCard';

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

describe('CollectionCard', () => {
  it('renders the collection link with title, description, and icon', () => {
    render(
      <CollectionCard
        href="/collections/bookmarks"
        title="Bookmarks"
        description="Everything you want to save for later."
        icon={Bookmark}
        count={29}
        visibilityLabel="PRIVATE"
        avatarUrl="https://example.com/avatar.png"
        avatarName="Test User"
        avatarSeed="test-user"
      />,
    );

    const link = screen.getByRole('link', { name: 'Bookmarks' });
    expect(link).toHaveAttribute('href', '/collections/bookmarks');
    expect(screen.getByText('Bookmarks')).toBeInTheDocument();
    expect(screen.getByText('Everything you want to save for later.')).toBeInTheDocument();
    expect(screen.getByText('29')).toBeInTheDocument();
    expect(screen.getByText('PRIVATE')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute(
      'data-avatar-url',
      'https://example.com/avatar.png',
    );
    expect(document.querySelector('.lucide-bookmark')).toBeInTheDocument();
    expect(document.querySelector('.lucide-sticky-note')).toBeInTheDocument();
    expect(document.querySelector('.lucide-circle-user-round')).toBeInTheDocument();
  });
});

describe('CollectionCard - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <CollectionCard
        href="/collections/bookmarks"
        title="Bookmarks"
        description="Everything you want to save for later."
        icon={Bookmark}
        count={29}
        visibilityLabel="PRIVATE"
        avatarUrl="https://example.com/avatar.png"
        avatarName="Test User"
        avatarSeed="test-user"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
