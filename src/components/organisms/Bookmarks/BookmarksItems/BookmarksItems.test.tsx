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
  it('renders the BOOKMARKS TimelineFeed', () => {
    render(<BookmarksItems />);

    expect(screen.getByTestId('timeline-feed')).toHaveAttribute('data-variant', 'bookmarks');
  });

  it('renders the add-content CTA above the feed', () => {
    render(<BookmarksItems />);

    expect(screen.getByRole('button', { name: 'collections.single.addContent' })).toBeInTheDocument();
    expect(screen.getByTestId('timeline-feed')).toBeInTheDocument();
  });
});

describe('BookmarksItems - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<BookmarksItems />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
