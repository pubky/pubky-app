import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookmarksItems } from './BookmarksItems';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

// The mock renders the `emptyState` slot inline so we can assert what the feed
// would show when the bookmarks stream resolves empty.
vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({ variant, emptyState }: { variant: string; emptyState?: ReactNode }) => (
    <div data-testid="timeline-feed" data-variant={variant}>
      {emptyState}
    </div>
  ),
}));

describe('BookmarksItems', () => {
  it('renders the BOOKMARKS TimelineFeed', () => {
    render(<BookmarksItems />);

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'bookmarks');
  });

  it('passes the add-content CTA as the feed empty-state slot (stream-driven, not count-driven)', () => {
    const { container } = render(<BookmarksItems />);

    expect(container.querySelector('[data-cy="bookmarks-items-empty"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'collections.single.addContent' })).toBeInTheDocument();
    expect(screen.getByText('collections.single.addContent')).toBeInTheDocument();
  });
});

describe('BookmarksItems - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<BookmarksItems />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
