import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAG_MAX_LENGTH } from '@/config/posts';
import { SEARCH_CONTENT_TAGS_MAX_TOTAL, SEARCH_CONTENT_TAGS_PER_TERM_LIMIT } from '@/config/search';
import { SearchController } from '@/controllers/search/search';
import { useContentSearchTags } from './useContentSearchTags';

vi.mock('@/controllers/search/search', () => ({
  SearchController: {
    fetchTagsByPrefix: vi.fn(),
  },
}));

const mockFetchTagsByPrefix = vi.mocked(SearchController.fetchTagsByPrefix);

describe('useContentSearchTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchTagsByPrefix.mockResolvedValue([]);
  });

  it('returns empty tags without fetching when the query is null', () => {
    const { result } = renderHook(() => useContentSearchTags(null));

    expect(result.current.tags).toEqual([]);
    expect(mockFetchTagsByPrefix).not.toHaveBeenCalled();
  });

  it('fetches one prefix lookup per query term with the per-term limit', async () => {
    renderHook(() => useContentSearchTags('bitcoin design'));

    await waitFor(() => expect(mockFetchTagsByPrefix).toHaveBeenCalledTimes(2));

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({
      prefix: 'bitcoin',
      limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT,
    });
    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({ prefix: 'design', limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT });
  });

  it('lowercases terms and dedupes repeated terms before fetching', async () => {
    renderHook(() => useContentSearchTags('Bitcoin bitcoin'));

    await waitFor(() =>
      expect(mockFetchTagsByPrefix).toHaveBeenCalledExactlyOnceWith({
        prefix: 'bitcoin',
        limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT,
      }),
    );
  });

  it('orders exact term matches before prefix extensions and dedupes across terms', async () => {
    mockFetchTagsByPrefix.mockImplementation(async ({ prefix }) => {
      if (prefix === 'bitcoin') return ['bitcoin-maxi', 'bitcoin'];
      if (prefix === 'design') return ['design', 'designer', 'bitcoin-maxi'];
      return [];
    });

    const { result } = renderHook(() => useContentSearchTags('bitcoin design'));

    await waitFor(() => expect(result.current.tags).toEqual(['bitcoin', 'design', 'bitcoin-maxi', 'designer']));
  });

  it('caps the merged row at the total limit', async () => {
    mockFetchTagsByPrefix.mockImplementation(async ({ prefix }) => [`${prefix}1`, `${prefix}2`, `${prefix}3`]);

    const { result } = renderHook(() => useContentSearchTags('aa bb cc dd'));

    await waitFor(() => expect(result.current.tags).toHaveLength(SEARCH_CONTENT_TAGS_MAX_TOTAL));
    expect(result.current.tags.slice(0, 3)).toEqual(['aa1', 'aa2', 'aa3']);
  });

  it('keeps results from healthy terms when another term fails', async () => {
    mockFetchTagsByPrefix.mockImplementation(async ({ prefix }) => {
      if (prefix === 'bitcoin') throw new Error('nexus down');
      return ['design'];
    });

    const { result } = renderHook(() => useContentSearchTags('bitcoin design'));

    await waitFor(() => expect(result.current.tags).toEqual(['design']));
  });

  it('skips terms longer than the tag length cap (they can never prefix-match)', async () => {
    const overlongTerm = 'a'.repeat(TAG_MAX_LENGTH + 1);
    renderHook(() => useContentSearchTags(`${overlongTerm} bitcoin`));

    await waitFor(() =>
      expect(mockFetchTagsByPrefix).toHaveBeenCalledExactlyOnceWith({
        prefix: 'bitcoin',
        limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT,
      }),
    );
  });

  it('strips tag-banned punctuation from terms before fetching', async () => {
    renderHook(() => useContentSearchTags('bitcoin, wallets'));

    await waitFor(() => expect(mockFetchTagsByPrefix).toHaveBeenCalledTimes(2));

    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({
      prefix: 'bitcoin',
      limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT,
    });
    expect(mockFetchTagsByPrefix).toHaveBeenCalledWith({
      prefix: 'wallets',
      limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT,
    });
  });

  it('fetches once when stripping punctuation merges terms', async () => {
    renderHook(() => useContentSearchTags('bitcoin bitcoin,'));

    await waitFor(() =>
      expect(mockFetchTagsByPrefix).toHaveBeenCalledExactlyOnceWith({
        prefix: 'bitcoin',
        limit: SEARCH_CONTENT_TAGS_PER_TERM_LIMIT,
      }),
    );
  });

  it('clears stale tags as soon as the query changes, before the new lookup resolves', async () => {
    mockFetchTagsByPrefix.mockResolvedValue(['bitcoin']);

    const { result, rerender } = renderHook(({ query }: { query: string | null }) => useContentSearchTags(query), {
      initialProps: { query: 'bitcoin' as string | null },
    });
    await waitFor(() => expect(result.current.tags).toEqual(['bitcoin']));

    // The new query's lookup stays pending — the old chips must already be gone.
    mockFetchTagsByPrefix.mockImplementation(() => new Promise(() => {}));
    rerender({ query: 'design' });

    expect(result.current.tags).toEqual([]);
  });

  it('replaces results when the query changes and clears them when it becomes null', async () => {
    mockFetchTagsByPrefix.mockImplementation(async ({ prefix }) => [prefix]);

    const { result, rerender } = renderHook(({ query }: { query: string | null }) => useContentSearchTags(query), {
      initialProps: { query: 'bitcoin' as string | null },
    });
    await waitFor(() => expect(result.current.tags).toEqual(['bitcoin']));

    rerender({ query: 'design' });
    await waitFor(() => expect(result.current.tags).toEqual(['design']));

    rerender({ query: null });
    await waitFor(() => expect(result.current.tags).toEqual([]));
  });
});
