import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionNotFound } from './CollectionNotFound';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock IllustratedEmptyState to avoid `next/image` while still exposing the
// title, subtitle, and the action buttons rendered as children.
vi.mock('@/molecules/IllustratedEmptyState/IllustratedEmptyState', () => ({
  IllustratedEmptyState: ({
    title,
    subtitle,
    children,
  }: {
    title: ReactNode;
    subtitle: ReactNode;
    children?: ReactNode;
  }) => (
    <div data-testid="illustrated-empty-state">
      <div data-testid="title">{title}</div>
      <div data-testid="subtitle">{subtitle}</div>
      {children}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTHOR_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0034BBBDFK83G';
const COMPOSITE = `${AUTHOR_PUBKY}:${POST_ID}`;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionNotFound', () => {
  it('renders the namespaced title and subtitle copy', () => {
    render(<CollectionNotFound postId={COMPOSITE} />);

    expect(screen.getByText('collections.single.notFound.title')).toBeInTheDocument();
    // subtitle1 and subtitle2 share one node split by a <br />.
    const subtitle = screen.getByTestId('subtitle');
    expect(subtitle).toHaveTextContent('collections.single.notFound.subtitle1');
    expect(subtitle).toHaveTextContent('collections.single.notFound.subtitle2');
  });

  it('navigates back to the collections landing route when "Back to Collections" is clicked', () => {
    render(<CollectionNotFound postId={COMPOSITE} />);

    const button = screen.getByText('collections.single.notFound.backToCollections').closest('button');
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLButtonElement);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/collections');
  });

  it('shows a "View profile" control when the composite resolves to a valid author pubky', () => {
    render(<CollectionNotFound postId={COMPOSITE} />);

    const viewProfile = screen.getByText('collections.single.notFound.viewProfile');
    expect(viewProfile).toBeInTheDocument();

    fireEvent.click(viewProfile.closest('button') as HTMLButtonElement);
    expect(mockPush).toHaveBeenCalledWith(`/profile/${AUTHOR_PUBKY}`);
  });

  it('hides the "View profile" control when the composite does not parse to a valid author', () => {
    render(<CollectionNotFound postId="not-a-composite" />);

    expect(screen.queryByText('collections.single.notFound.viewProfile')).not.toBeInTheDocument();
    // The back action is always available.
    expect(screen.getByText('collections.single.notFound.backToCollections')).toBeInTheDocument();
  });
});
