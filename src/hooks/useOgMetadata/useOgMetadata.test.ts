import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { useOgMetadata } from './useOgMetadata';

const mockFetch = vi.fn();

describe('useOgMetadata', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', asOpaque<typeof fetch>(mockFetch));
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ url: 'x', title: 'Title', image: null, type: 'website' }), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it.each([
    'https://alice@example.invalid/og-a',
    'https://alice:secret@example.invalid/og-b',
    'https://alice%40home:s%3Acret@example.invalid/og-c',
    '<https://alice@example.invalid/og-d>',
  ])('never sends %s, a link with a username or password', (url) => {
    const { result } = renderHook(() => useOgMetadata(url));

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ metadata: null, isLoading: false, error: null });
  });

  it('reads an ordinary link, @ in its path included', async () => {
    const url = 'https://example.invalid/@alice/og-e';
    const { result } = renderHook(() => useOgMetadata(url));

    await waitFor(() => expect(result.current.metadata?.title).toBe('Title'));
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(`/api/og-metadata?url=${encodeURIComponent(url)}`);
  });
});
