import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_RESOURCES_PREVIEW_COUNT } from '@/config/search';
import type { UseResourceSearchResult } from '@/hooks/useResourceSearch/useResourceSearch';
import { toast } from '@/molecules/Toaster/toast';
import type { TResourceQuery } from '@/pipes/resource/resource.search';
import { useHomeStore } from '@/stores/home/home.store';
import { CONTENT } from '@/stores/home/home.types';
import { SearchResources } from './SearchResources';

const QUERY: TResourceQuery = {
  input: { kind: 'tags', tags: ['music'] },
  sort: 'activity',
  reach: 'all',
  viewer: null,
  collapse: true,
};

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  query: vi.fn(),
  visual: { value: false },
}));

vi.mock('@/hooks/useResourceSearch/useResourceSearch', () => ({ useResourceSearch: mocks.search }));
vi.mock('@/hooks/useSearchResourceQuery/useSearchResourceQuery', () => ({ useSearchResourceQuery: mocks.query }));
vi.mock('@/hooks/useFeedLayoutResolution/useFeedLayoutResolution', () => ({
  useFeedLayoutResolution: () => ({ isVisualActive: mocks.visual.value }),
}));
vi.mock('@/molecules/Toaster/toast');
vi.mock('@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview', () => ({
  GenericResourcePreview: ({ url }: { url: string }) => <div data-testid="preview" data-url={url} />,
}));

const links = (count: number) => Array.from({ length: count }, (_, i) => `https://example.com/${i}`);
const searchResult = (overrides: Partial<UseResourceSearchResult> = {}): UseResourceSearchResult => ({
  uris: links(SEARCH_RESOURCES_PREVIEW_COUNT),
  cards: [],
  typeFacets: null,
  relatedTags: [],
  hostFacets: null,
  categoryFacets: null,
  source: 'pinakes',
  unavailable: false,
  reachTruncated: false,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  loadMore: vi.fn(async () => {}),
  retry: vi.fn(),
  ...overrides,
});

describe('SearchResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockReturnValue({ query: QUERY, url: null, isReachIgnored: false });
    mocks.visual.value = false;
    mocks.search.mockReturnValue(searchResult());
    useHomeStore.setState({ content: CONTENT.ALL });
  });

  it('shows the first rows of the search, and "Show all" opens the External resources tab', () => {
    render(<SearchResources />);

    expect(mocks.search).toHaveBeenCalledWith(QUERY, { limit: SEARCH_RESOURCES_PREVIEW_COUNT });
    expect(screen.getByRole('heading', { name: 'External resources' })).toBeInTheDocument();
    expect(screen.getAllByTestId('search-resource-item')).toHaveLength(SEARCH_RESOURCES_PREVIEW_COUNT);
    // Each cell of the two-column grid is a grid container, so a card's footer stacks in it
    for (const item of screen.getAllByTestId('search-resource-item')) {
      expect(item).toHaveClass('@container/grid', 'min-w-0');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));

    expect(useHomeStore.getState().content).toBe(CONTENT.RESOURCES);
  });

  it('puts a searched link’s card on top of what is related to it', () => {
    mocks.query.mockReturnValue({
      query: { ...QUERY, input: { kind: 'related', id: 'card' } },
      url: 'https://example.com/0',
    });

    render(<SearchResources />);

    expect(screen.getByTestId('search-resource-top')).toBeInTheDocument();
    // The link itself is not listed again among the related rows
    expect(screen.getAllByTestId('search-resource-item')).toHaveLength(SEARCH_RESOURCES_PREVIEW_COUNT - 1);
  });

  it('holds the place of resource cards while loading', () => {
    mocks.search.mockReturnValue(searchResult({ uris: [], loading: true }));

    render(<SearchResources />);

    expect(screen.getAllByTestId('resource-card-skeleton')).toHaveLength(SEARCH_RESOURCES_PREVIEW_COUNT);
  });

  it('renders nothing when no resource matches, or without a search', () => {
    mocks.search.mockReturnValue(searchResult({ uris: [], hasMore: false }));
    const { container, rerender } = render(<SearchResources />);
    expect(container).toBeEmptyDOMElement();

    mocks.query.mockReturnValue({ query: null, url: null, isReachIgnored: false });
    rerender(<SearchResources />);
    expect(container).toBeEmptyDOMElement();
  });

  it('vanishes and says so once when the read fails', () => {
    mocks.search.mockReturnValue(searchResult({ uris: [], hasMore: false, error: 'Pinakes is down' }));

    const { container } = render(<SearchResources />);

    expect(container).toBeEmptyDOMElement();
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to load external resources. Please try again.',
    });
  });

  it('is simply not there, with no toast, when no source can answer the search', () => {
    mocks.search.mockReturnValue(
      searchResult({
        uris: [],
        hasMore: false,
        error: 'Searching external resources is not available right now.',
        unavailable: true,
      }),
    );

    const { container } = render(<SearchResources />);

    expect(container).toBeEmptyDOMElement();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('shows the resources from everyone, with no note, when the Search reach has no resource counterpart', () => {
    mocks.query.mockReturnValue({ query: QUERY, url: null, isReachIgnored: true });
    render(<SearchResources />);
    expect(screen.queryByText(/My network/)).not.toBeInTheDocument();
  });

  it('offers no "Show all" while Visual is active, where the tab resolves back to All', () => {
    mocks.visual.value = true;

    render(<SearchResources />);

    expect(screen.getAllByTestId('search-resource-item')).toHaveLength(SEARCH_RESOURCES_PREVIEW_COUNT);
    expect(screen.queryByRole('button', { name: 'Show all' })).not.toBeInTheDocument();
  });
});
