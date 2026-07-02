import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookmarksItems } from './BookmarksItems';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

vi.mock('@/organisms/Collections/DialogAddContent/DialogAddContent', () => ({
  DialogAddContent: ({ dataCy, triggerVariant }: { dataCy?: string; triggerVariant?: string }) => (
    <div data-testid="add-content-dialog" data-cy={dataCy} data-trigger-variant={triggerVariant ?? 'hero'} />
  ),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({
    variant,
    children,
    emptyState,
    gridTrailingSlot,
  }: {
    variant: string;
    children?: ReactNode;
    emptyState?: ReactNode;
    gridTrailingSlot?: ReactNode;
  }) => (
    <div
      data-testid="timeline-feed"
      data-variant={variant}
      data-has-empty-state={String(Boolean(emptyState))}
      data-has-grid-trailing-slot={String(Boolean(gridTrailingSlot))}
    >
      {children}
      {gridTrailingSlot}
    </div>
  ),
}));

describe('BookmarksItems', () => {
  it('renders the BOOKMARKS TimelineFeed with the header inside the feed context scope', () => {
    render(<BookmarksItems header={<div data-testid="bookmarks-header">header</div>} />);

    const feed = screen.getByTestId('timeline-feed');
    expect(feed).toHaveAttribute('data-variant', 'bookmarks');
    expect(feed).toHaveAttribute('data-has-empty-state', 'true');
    expect(feed).toHaveAttribute('data-has-grid-trailing-slot', 'true');
    expect(screen.getByTestId('bookmarks-header')).toBeInTheDocument();
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-cy', 'bookmarks-add-content-grid');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-trigger-variant', 'grid');
  });
});

describe('BookmarksItems - Snapshots', () => {
  it('matches the snapshot', () => {
    const { container } = render(<BookmarksItems header={<div>Bookmarks header</div>} />);

    expect(container.firstChild).toMatchSnapshot();
  });
});
