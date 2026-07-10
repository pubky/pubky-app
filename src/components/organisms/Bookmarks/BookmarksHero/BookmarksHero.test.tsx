import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../../messages/en.json';
import { BookmarksHero } from './BookmarksHero';

const BOOKMARKS_COPY = enMessages.collections.bookmarks;

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: { count?: number }) => {
    if (namespace !== 'collections') {
      return `${namespace ?? ''}.${key}`;
    }

    if (key === 'postCount') {
      return values?.count === 1 ? 'post' : 'posts';
    }

    const nestedKeys: Record<string, string> = {
      'bookmarks.title': BOOKMARKS_COPY.title,
      'bookmarks.description': BOOKMARKS_COPY.description,
    };

    return nestedKeys[key] ?? `collections.${key}`;
  },
  useFormatter: () => ({
    number: (value: number, _options?: Intl.NumberFormatOptions) => String(value),
  }),
}));

vi.mock('@/organisms/HeroOwner/HeroOwner', () => ({
  HeroOwner: ({
    name,
    fallbackSeed,
    avatarUrl,
    size,
    isResolved,
  }: {
    name: string;
    fallbackSeed: string;
    avatarUrl?: string;
    size?: string;
    isResolved: boolean;
  }) => (
    <div
      data-testid="hero-owner"
      data-name={name}
      data-fallback-seed={fallbackSeed}
      data-avatar-url={avatarUrl ?? ''}
      data-size={size}
      data-resolved={String(isResolved)}
    >
      {isResolved ? name : 'skeleton'}
    </div>
  ),
}));

vi.mock('@/organisms/Collections/DialogAddContent/DialogAddContent', () => ({
  DialogAddContent: ({ dataCy }: { dataCy?: string }) => (
    <button type="button" data-testid={dataCy ?? 'add-content-dialog'} aria-label="collections.single.content">
      collections.single.content
    </button>
  ),
}));

describe('BookmarksHero', () => {
  it('renders the system collection title, owner, and description', () => {
    render(
      <BookmarksHero
        avatarName="Alice"
        avatarSeed="alice-pubky"
        avatarUrl="https://example.com/avatar.png"
        bookmarkCount={15}
        isProfileResolved={true}
      />,
    );

    expect(screen.getByRole('heading', { name: BOOKMARKS_COPY.title })).toBeInTheDocument();
    expect(screen.getByText(BOOKMARKS_COPY.description)).toBeInTheDocument();
    expect(screen.queryByText('15 posts')).toBeInTheDocument();
    expect(screen.getByTestId('hero-owner')).toHaveAttribute('data-name', 'Alice');
    expect(screen.getByText('Alice', { selector: 'div' })).toBeInTheDocument();
  });

  it('renders the Content action in the hero', () => {
    render(<BookmarksHero avatarName="Alice" avatarSeed="alice-pubky" bookmarkCount={15} isProfileResolved={true} />);

    expect(screen.getByTestId('bookmarks-add-content')).toBeInTheDocument();
    expect(screen.getByLabelText('collections.single.content')).toBeInTheDocument();
  });

  it('does not render custom-collection management actions for the system collection', () => {
    render(<BookmarksHero avatarName="Alice" avatarSeed="alice-pubky" bookmarkCount={15} isProfileResolved={true} />);

    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reorder/i })).not.toBeInTheDocument();
  });

  it('omits the count label while the count is unresolved', () => {
    render(<BookmarksHero avatarName="Alice" avatarSeed="alice-pubky" isProfileResolved={true} />);

    expect(screen.queryByText('15 posts')).not.toBeInTheDocument();
  });

  it('renders a skeleton in place of the username until the profile resolves', () => {
    render(<BookmarksHero avatarName="U" avatarSeed="alice-pubky" bookmarkCount={15} isProfileResolved={false} />);

    // The avatar still renders, but the username text must not appear yet.
    expect(screen.getByTestId('hero-owner')).toBeInTheDocument();
    expect(screen.queryByText('U', { selector: 'div' })).not.toBeInTheDocument();
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
