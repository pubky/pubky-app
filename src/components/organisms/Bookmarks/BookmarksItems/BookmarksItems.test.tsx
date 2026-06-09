import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookmarksItems } from './BookmarksItems';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({ variant }: { variant: string }) => <div data-testid="timeline-feed" data-variant={variant} />,
}));

describe('BookmarksItems', () => {
  it('renders the BOOKMARKS TimelineFeed while count is loading', () => {
    render(<BookmarksItems bookmarkCount={undefined} isBookmarkCountLoading={true} />);

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'bookmarks');
    expect(screen.queryByTestId('bookmarks-items-empty')).not.toBeInTheDocument();
  });

  it('renders the BOOKMARKS TimelineFeed for non-empty bookmarks', () => {
    render(<BookmarksItems bookmarkCount={2} isBookmarkCountLoading={false} />);

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'bookmarks');
    expect(screen.queryByTestId('bookmarks-items-empty')).not.toBeInTheDocument();
  });

  it('renders the empty state when the bookmark count is confirmed empty', () => {
    const { container } = render(<BookmarksItems bookmarkCount={0} isBookmarkCountLoading={false} />);

    expect(container.querySelector('[data-cy="bookmarks-items-empty"]')).toBeInTheDocument();
    expect(screen.getByText('collections.bookmarks.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('collections.bookmarks.emptyDescription')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-feed')).not.toBeInTheDocument();
  });
});

describe('BookmarksItems - Snapshots', () => {
  it('matches the snapshot for the empty state', () => {
    const { container } = render(<BookmarksItems bookmarkCount={0} isBookmarkCountLoading={false} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
