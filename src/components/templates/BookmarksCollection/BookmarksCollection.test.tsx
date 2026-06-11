import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBookmarksCollectionSummary } from '@/hooks/useBookmarksCollectionSummary/useBookmarksCollectionSummary';
import { BookmarksCollection } from './BookmarksCollection';

vi.mock('@/hooks/useBookmarksCollectionSummary/useBookmarksCollectionSummary', () => ({
  useBookmarksCollectionSummary: vi.fn(),
}));

vi.mock('@/organisms/Bookmarks/BookmarksHero/BookmarksHero', () => ({
  BookmarksHero: ({
    avatarName,
    avatarSeed,
    avatarUrl,
    bookmarkCount,
    isProfileResolved,
  }: {
    avatarName: string;
    avatarSeed: string;
    avatarUrl?: string;
    bookmarkCount?: number;
    isProfileResolved: boolean;
  }) => (
    <div
      data-testid="bookmarks-hero"
      data-avatar-name={avatarName}
      data-avatar-seed={avatarSeed}
      data-avatar-url={avatarUrl ?? ''}
      data-bookmark-count={String(bookmarkCount)}
      data-is-profile-resolved={String(isProfileResolved)}
    />
  ),
}));

vi.mock('@/organisms/Bookmarks/BookmarksItems/BookmarksItems', () => ({
  BookmarksItems: () => <div data-testid="bookmarks-items" />,
}));

vi.mock('@/organisms/Collections/CollectionsSections/CollectionsSections', () => ({
  CollectionsSections: () => <div data-testid="collections-sections" />,
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    showLeftSidebar,
    showRightSidebar,
    showLeftMobileButton,
    showRightMobileButton,
    className,
  }: {
    children: ReactNode;
    showLeftSidebar?: boolean;
    showRightSidebar?: boolean;
    showLeftMobileButton?: boolean;
    showRightMobileButton?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="content-layout"
      data-show-left-sidebar={String(showLeftSidebar)}
      data-show-right-sidebar={String(showRightSidebar)}
      data-show-left-mobile-button={String(showLeftMobileButton)}
      data-show-right-mobile-button={String(showRightMobileButton)}
      data-class-name={className}
    >
      {children}
    </div>
  ),
}));

const mockUseBookmarksCollectionSummary = vi.mocked(useBookmarksCollectionSummary);

describe('BookmarksCollection', () => {
  it('renders collection-style chrome with hero, items, and collections sections', () => {
    mockUseBookmarksCollectionSummary.mockReturnValue({
      avatarName: 'Alice',
      avatarSeed: 'alice-pubky',
      avatarUrl: 'https://example.com/avatar.png',
      bookmarkCount: 4,
      isProfileResolved: true,
    });

    render(<BookmarksCollection />);

    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-show-left-sidebar', 'false');
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-show-right-sidebar', 'false');
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-show-left-mobile-button', 'false');
    expect(screen.getByTestId('content-layout')).toHaveAttribute('data-show-right-mobile-button', 'false');
    expect(screen.getByTestId('bookmarks-hero')).toHaveAttribute('data-bookmark-count', '4');
    expect(screen.getByTestId('bookmarks-items')).toBeInTheDocument();
    expect(screen.getByTestId('collections-sections')).toBeInTheDocument();
  });
});

describe('BookmarksCollection - Snapshots', () => {
  it('matches the snapshot for the resolved summary state', () => {
    mockUseBookmarksCollectionSummary.mockReturnValue({
      avatarName: 'Alice',
      avatarSeed: 'alice-pubky',
      avatarUrl: 'https://example.com/avatar.png',
      bookmarkCount: 4,
      isProfileResolved: true,
    });

    const { container } = render(<BookmarksCollection />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
