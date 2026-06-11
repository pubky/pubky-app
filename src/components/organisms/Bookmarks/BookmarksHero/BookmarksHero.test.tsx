import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookmarksHero } from './BookmarksHero';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

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
      data-avatar-url={avatarUrl ?? ''}
      data-name={name}
      data-fallback-seed={fallbackSeed}
      data-size={size}
      data-alt={alt}
    >
      {name}
    </div>
  ),
}));

describe('BookmarksHero', () => {
  it('renders the system collection title, owner, count, and description', () => {
    render(
      <BookmarksHero
        avatarName="Alice"
        avatarSeed="alice-pubky"
        avatarUrl="https://example.com/avatar.png"
        bookmarkCount={15}
        isProfileResolved={true}
      />,
    );

    expect(screen.getByRole('heading', { name: 'collections.bookmarks.title' })).toBeInTheDocument();
    expect(screen.getByText('collections.bookmarks.description')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-name', 'Alice');
    expect(screen.getByText('Alice', { selector: 'span' })).toBeInTheDocument();
  });

  it('does not render custom-collection management actions for the system collection', () => {
    render(<BookmarksHero avatarName="Alice" avatarSeed="alice-pubky" bookmarkCount={15} isProfileResolved={true} />);

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reorder/i })).not.toBeInTheDocument();
  });

  it('omits the count label while the count is unresolved', () => {
    render(<BookmarksHero avatarName="Alice" avatarSeed="alice-pubky" isProfileResolved={true} />);

    expect(screen.queryByText('15')).not.toBeInTheDocument();
  });

  it('renders a skeleton in place of the username until the profile resolves', () => {
    render(<BookmarksHero avatarName="U" avatarSeed="alice-pubky" bookmarkCount={15} isProfileResolved={false} />);

    // The avatar still renders, but the username text must not appear yet.
    expect(screen.getByTestId('avatar-with-fallback')).toBeInTheDocument();
    expect(screen.queryByText('U', { selector: 'span' })).not.toBeInTheDocument();
  });
});

describe('BookmarksHero - Snapshots', () => {
  it('matches the snapshot with count and avatar state', () => {
    const { container } = render(
      <BookmarksHero
        avatarName="Alice"
        avatarSeed="alice-pubky"
        avatarUrl="https://example.com/avatar.png"
        bookmarkCount={15}
        isProfileResolved={true}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
