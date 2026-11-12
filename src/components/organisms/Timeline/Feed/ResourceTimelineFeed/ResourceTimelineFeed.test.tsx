import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getResourceRoute } from '@/app/routes';
import type { UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import { LAYOUT } from '@/stores/home/home.types';
import { ResourceTimelineFeed } from './ResourceTimelineFeed';

const mocks = vi.hoisted(() => ({
  infiniteScroll: vi.fn(),
}));

vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({ useInfiniteScroll: mocks.infiniteScroll }));

// The card a post shows for a link has its own tests: here only which links get one, and on which surface.
vi.mock('@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview', async () => {
  const { useResourceSurface } = await import('@/molecules/ResourceCard/ResourceSurfaceContext');
  function GenericResourcePreview({ url }: { url: string }) {
    return <div data-testid="preview" data-url={url} data-surface={useResourceSurface()} />;
  }
  return { GenericResourcePreview };
});

const WEB = 'https://open.spotify.com/track/1';
const BOOK = 'isbn:9780262033848';

const searchResult = (overrides: Partial<UseResourceSearchResult> = {}): UseResourceSearchResult => ({
  uris: [WEB, BOOK],
  typeFacets: null,
  relatedTags: [],
  hostFacets: null,
  categoryFacets: null,
  source: 'pinakes',
  unavailable: false,
  reachTruncated: false,
  retry: vi.fn(),
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(async () => {}),
  ...overrides,
});

describe('ResourceTimelineFeed', () => {
  beforeEach(() => {
    mocks.infiniteScroll.mockReturnValue({ sentinelRef: vi.fn(), isStalled: false, resumeAutoLoad: vi.fn() });
  });

  it('shows each row of the search as its own card or row, under the controls it is given', () => {
    render(
      <ResourceTimelineFeed search={searchResult()} layout={LAYOUT.COLUMNS}>
        <div data-testid="composer" />
      </ResourceTimelineFeed>,
    );

    expect(screen.getByTestId('composer')).toBeInTheDocument();
    const feed = screen.getByRole('feed', { name: 'External resources' });
    expect(feed).toHaveClass('grid-cols-1');
    expect(feed).not.toHaveClass('lg:grid-cols-2');
    // A web link: the card a post shows for it, standing on the post card's surface
    expect(screen.getByTestId('preview')).toHaveAttribute('data-url', WEB);
    expect(screen.getByTestId('preview')).toHaveAttribute('data-surface', 'card');
    // Any other URI: a row opening its resource page
    expect(screen.getByRole('link')).toHaveAttribute('href', getResourceRoute(BOOK));
    expect(getResourceRoute(BOOK)).toBe(`/resource?uri=${encodeURIComponent(BOOK)}`);
    expect(screen.getAllByTestId('resource-feed-item')).toHaveLength(2);
    // Each cell is a grid container, so a card's footer stacks its tags and actions in a narrow cell
    for (const item of screen.getAllByTestId('resource-feed-item')) {
      expect(item).toHaveClass('@container/grid', 'min-w-0');
    }
    expect(screen.getByText("You've reached the end! 🎉")).toBeInTheDocument();
  });

  it('shows two columns from lg in the Cards layout, as a collection’s resources', () => {
    render(<ResourceTimelineFeed search={searchResult()} layout={LAYOUT.CARDS} />);

    expect(screen.getByRole('feed', { name: 'External resources' })).toHaveClass('lg:grid-cols-2');
  });

  it('holds the place of resource cards while the first page loads', () => {
    render(
      <ResourceTimelineFeed
        search={searchResult({ uris: [], loading: true, hasMore: true })}
        layout={LAYOUT.COLUMNS}
      />,
    );

    expect(screen.getByTestId('resource-feed-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('resource-card-skeleton')).toHaveLength(3);
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
  });

  it('says so when no resource carries the tags, or shows the empty state it is given', () => {
    const empty = searchResult({ uris: [] });
    const { rerender } = render(<ResourceTimelineFeed search={empty} layout={LAYOUT.COLUMNS} />);
    expect(screen.getByText('No external resources found')).toBeInTheDocument();

    rerender(
      <ResourceTimelineFeed search={empty} layout={LAYOUT.COLUMNS} emptyState={<div data-testid="custom-empty" />} />,
    );
    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
  });

  it('reports a failed first page with a retry, and a failed later page under the resources already shown', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ResourceTimelineFeed
        search={searchResult({ uris: [], error: 'Nexus is down', retry })}
        layout={LAYOUT.COLUMNS}
      />,
    );
    expect(screen.getByText(/Nexus is down/)).toBeInTheDocument();
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(<ResourceTimelineFeed search={searchResult({ error: 'Nexus is down' })} layout={LAYOUT.COLUMNS} />);
    expect(screen.getByRole('feed', { name: 'External resources' })).toBeInTheDocument();
    expect(screen.getByText(/Nexus is down/)).toBeInTheDocument();
  });

  it('pages in more resources as the list scrolls, while the stream has more', () => {
    const loadMore = vi.fn(async () => {});
    const { container } = render(
      <ResourceTimelineFeed search={searchResult({ hasMore: true, loadMore })} layout={LAYOUT.COLUMNS} />,
    );

    expect(mocks.infiniteScroll).toHaveBeenCalledWith(
      expect.objectContaining({ onLoadMore: loadMore, hasMore: true, itemCount: 2 }),
    );
    expect(container.querySelector('[data-cy="timeline-sentinel"]')).toBeInTheDocument();
    expect(screen.queryByText("You've reached the end! 🎉")).not.toBeInTheDocument();
  });

  it('puts a searched link’s card first, even before the rows are read', () => {
    render(
      <ResourceTimelineFeed
        search={searchResult({ uris: [], loading: true })}
        layout={LAYOUT.COLUMNS}
        leadingItem={<div data-testid="top-card" />}
      />,
    );

    expect(screen.getByRole('feed', { name: 'External resources' }).firstChild).toBe(screen.getByTestId('top-card'));
  });

  it('reports a failed search under a searched link’s card, with a retry', () => {
    const retry = vi.fn();
    render(
      <ResourceTimelineFeed
        search={searchResult({ uris: [], error: 'Pinakes is down', retry })}
        layout={LAYOUT.COLUMNS}
        leadingItem={<div data-testid="top-card" />}
      />,
    );

    expect(screen.getByTestId('top-card')).toBeInTheDocument();
    expect(screen.getByText(/Pinakes is down/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry for a search no source can answer', () => {
    render(
      <ResourceTimelineFeed
        search={searchResult({
          uris: [],
          error: 'Searching external resources is not available right now.',
          unavailable: true,
        })}
        layout={LAYOUT.COLUMNS}
      />,
    );

    expect(screen.getByText(/not available right now/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
