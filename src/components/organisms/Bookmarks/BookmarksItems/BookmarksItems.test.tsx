import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarksItems } from './BookmarksItems';

const mocks = vi.hoisted(() => ({ links: undefined as string[] | undefined }));

vi.mock('@/hooks/useResourceBookmarks/useResourceBookmarks', () => ({ useResourceBookmarks: () => mocks.links }));
vi.mock('@/organisms/Collections/CollectionResourceItems/CollectionResourceItems', () => ({
  CollectionResourceItems: ({ uris }: { uris: string[] }) =>
    uris.length > 0 ? <div data-testid="resource-items-stub" data-uris={uris.join(' ')} /> : null,
}));

vi.mock('@/organisms/Collections/DialogAddContent/DialogAddContent', () => ({
  DialogAddContent: ({ dataCy, triggerVariant }: { dataCy?: string; triggerVariant?: string }) => (
    <div data-testid="add-content-dialog" data-cy={dataCy} data-trigger-variant={triggerVariant ?? 'hero'} />
  ),
}));

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/TimelineFeed', () => ({
  TimelineFeed: ({
    variant,
    requestedLayout,
    children,
    emptyState,
    trailingSlot,
  }: {
    variant: string;
    requestedLayout: string;
    children?: ReactNode;
    emptyState?: ReactNode;
    trailingSlot?: ReactNode;
  }) => (
    <div
      data-testid="timeline-feed"
      data-variant={variant}
      data-layout={requestedLayout}
      data-has-empty-state={String(Boolean(emptyState))}
      data-has-trailing-slot={String(Boolean(trailingSlot))}
    >
      {children}
      {trailingSlot}
    </div>
  ),
}));

describe('BookmarksItems', () => {
  beforeEach(() => {
    mocks.links = [];
  });

  it('shows no empty state while the bookmarked links are listed', () => {
    mocks.links = undefined;
    render(<BookmarksItems header={<div />} />);

    expect(screen.queryByTestId('bookmarks-items-empty')).not.toBeInTheDocument();
  });

  it('shows the bookmarked links as a collection shows its links, and no empty state for them', () => {
    mocks.links = ['https://www.openstreetmap.org/node/240109189'];
    render(<BookmarksItems header={<div data-testid="bookmarks-header">header</div>} />);

    expect(screen.getByTestId('resource-items-stub')).toHaveAttribute(
      'data-uris',
      'https://www.openstreetmap.org/node/240109189',
    );
    expect(screen.queryByTestId('bookmarks-items-empty')).not.toBeInTheDocument();
  });

  it('renders the BOOKMARKS TimelineFeed with the header inside the feed context scope', () => {
    render(<BookmarksItems header={<div data-testid="bookmarks-header">header</div>} />);

    const feed = screen.getByTestId('timeline-feed');
    expect(feed).toHaveAttribute('data-variant', 'bookmarks');
    expect(feed).toHaveAttribute('data-layout', 'cards');
    expect(feed).toHaveAttribute('data-has-empty-state', 'true');
    expect(feed).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('bookmarks-header')).toBeInTheDocument();
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-cy', 'bookmarks-add-content-grid');
    expect(screen.getByTestId('add-content-dialog')).toHaveAttribute('data-trigger-variant', 'grid');
  });
});
