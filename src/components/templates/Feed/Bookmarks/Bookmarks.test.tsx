import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollectionsOwner } from '@/hooks/useCollectionsOwner/useCollectionsOwner';
import { Bookmarks } from './Bookmarks';

vi.mock('@/hooks/useCollectionsOwner/useCollectionsOwner', () => ({
  useCollectionsOwner: vi.fn(),
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({
    avatarUrl,
    name,
    fallbackSeed,
    size,
  }: {
    avatarUrl?: string;
    name: string;
    fallbackSeed?: string;
    size?: string;
  }) => (
    <div
      data-testid="avatar-with-fallback"
      data-avatar-url={avatarUrl}
      data-name={name}
      data-fallback-seed={fallbackSeed}
      data-size={size}
    >
      {name}
    </div>
  ),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({
    children,
    showLeftSidebar,
    showLeftMobileButton,
    showRightMobileButton,
    showRightSidebar,
    className,
  }: {
    children: ReactNode;
    showLeftSidebar?: boolean;
    showLeftMobileButton?: boolean;
    showRightMobileButton?: boolean;
    showRightSidebar?: boolean;
    className?: string;
  }) => (
    <div
      data-testid="content-layout"
      data-show-left-sidebar={String(showLeftSidebar)}
      data-show-left-mobile-button={String(showLeftMobileButton)}
      data-show-right-sidebar={String(showRightSidebar)}
      data-show-right-mobile-button={String(showRightMobileButton)}
      className={className}
    >
      {children}
    </div>
  ),
}));

vi.mock('@/organisms/Collections/BookmarksCollectionPosts/BookmarksCollectionPosts', () => ({
  BookmarksCollectionPosts: ({ emptyComponent }: { emptyComponent: ReactNode }) => (
    <div data-testid="bookmarks-collection-posts">
      <div data-testid="bookmarks-empty-prop">{emptyComponent}</div>
    </div>
  ),
}));

const defaultOwner = {
  currentUserPubky: 'test-pubky',
  avatarUrl: 'https://example.com/avatar/test-pubky?v=123',
  avatarName: 'Test User',
  avatarSeed: 'test-pubky',
  bookmarkCount: 29,
  isCountsLoading: false,
};

describe('Bookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCollectionsOwner).mockReturnValue(defaultOwner);
  });

  it('renders the dedicated bookmarks collection posts list', () => {
    render(<Bookmarks />);
    expect(screen.getByTestId('bookmarks-collection-posts')).toBeInTheDocument();
  });

  it('renders its own collection detail shell outside the feeds route group', () => {
    render(<Bookmarks />);
    const contentLayout = screen.getByTestId('content-layout');
    expect(contentLayout).toHaveAttribute('data-show-left-sidebar', 'false');
    expect(contentLayout).toHaveAttribute('data-show-left-mobile-button', 'false');
    expect(contentLayout).toHaveAttribute('data-show-right-sidebar', 'false');
    expect(contentLayout).toHaveAttribute('data-show-right-mobile-button', 'false');
  });

  it('renders the Bookmarks system collection header', () => {
    render(<Bookmarks />);
    const header = screen.getByTestId('bookmarks-collection-header');
    expect(header).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bookmarks' })).toBeInTheDocument();
    expect(screen.getByText('Everything you saved for later')).toBeInTheDocument();
    expect(header).toHaveTextContent('Test User');
    expect(header).toHaveTextContent('29');
    expect(header).toHaveTextContent('PRIVATE');
  });

  it('does not render system collection edit actions', () => {
    render(<Bookmarks />);
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
  });

  it('passes the Bookmarks empty state to the dedicated posts list', () => {
    render(<Bookmarks />);
    expect(screen.getByTestId('bookmarks-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No bookmarks yet')).toBeInTheDocument();
  });
});

describe('Bookmarks - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Bookmarks />);
    expect(container).toMatchSnapshot();
  });
});
