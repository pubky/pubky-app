import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookmarksItems } from './BookmarksItems';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({ variant, children }: { variant: string; children?: ReactNode }) => (
    <div data-testid="timeline-feed" data-variant={variant}>
      {children}
    </div>
  ),
  useTimelineFeedContext: () => null,
}));

describe('BookmarksItems', () => {
  it('renders the BOOKMARKS TimelineFeed', () => {
    render(<BookmarksItems />);

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'bookmarks');
  });

  it('renders the add-content CTA above the feed', () => {
    render(<BookmarksItems />);

    const feed = screen.getByTestId('timeline-feed');
    expect(within(feed).getByRole('button', { name: 'collections.single.addContent' })).toBeInTheDocument();
  });
});

describe('BookmarksItems - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<BookmarksItems />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
