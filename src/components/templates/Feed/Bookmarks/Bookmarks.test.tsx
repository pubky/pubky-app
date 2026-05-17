import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Bookmarks } from './Bookmarks';

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({ variant }: { variant: string }) => (
    <div data-testid="timeline-feed" data-variant={variant}>
      TimelineFeed
    </div>
  ),
}));

vi.mock('@/config/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/feed')>();
  return {
    ...actual,
    TIMELINE_FEED_VARIANT: {
      ...actual.TIMELINE_FEED_VARIANT,
      BOOKMARKS: 'bookmarks',
    },
  };
});

describe('Bookmarks', () => {
  it('renders TimelineFeed with BOOKMARKS variant', () => {
    render(<Bookmarks />);
    const timelineFeed = screen.getByTestId('timeline-feed');
    expect(timelineFeed).toBeInTheDocument();
    expect(timelineFeed).toHaveAttribute('data-variant', 'bookmarks');
  });

  it('does not render a ContentLayout shell (hoisted into (feeds)/layout.tsx)', () => {
    render(<Bookmarks />);
    expect(screen.queryByTestId('content-layout')).not.toBeInTheDocument();
  });
});

describe('Bookmarks - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Bookmarks />);
    expect(container).toMatchSnapshot();
  });
});
