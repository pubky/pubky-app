import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchXPost, resetXPostReads, useXPost, X_POST_RETRY_AFTER_MS } from './useXPost';

const POST = {
  id: '20',
  text: 'hello',
  authorName: null,
  handle: null,
  published: null,
  image: null,
  images: [],
  hasVideo: false,
};

describe('useXPost', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    resetXPostReads();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the post from the app’s own route, once per page load', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(POST), { status: 200 }));

    const first = renderHook(() => useXPost('20'));
    expect(first.result.current).toEqual({ post: null, pending: true });
    await waitFor(() => expect(first.result.current).toEqual({ post: POST, pending: false }));
    const second = renderHook(() => useXPost('20'));
    await waitFor(() => expect(second.result.current.post).toEqual(POST));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/x-post?id=20');
  });

  it('answers no post when the route has none or fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 })).mockRejectedValueOnce(new Error('offline'));

    const missing = renderHook(() => useXPost('21'));
    const failed = renderHook(() => useXPost('22'));

    await waitFor(() => expect(missing.result.current).toEqual({ post: null, pending: false }));
    await waitFor(() => expect(failed.result.current).toEqual({ post: null, pending: false }));
  });

  it('asks once more on a preview shown a while after a read that may pass later (502, 503, no answer), not after a 404', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(POST), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const busy = renderHook(() => useXPost('20'));
    await waitFor(() => expect(busy.result.current).toEqual({ post: null, pending: false }));
    busy.unmount();
    // Right after: not asked again.
    const soon = renderHook(() => useXPost('20'));
    await waitFor(() => expect(soon.result.current.pending).toBe(false));
    soon.unmount();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + X_POST_RETRY_AFTER_MS);
    const again = renderHook(() => useXPost('20'));
    await waitFor(() => expect(again.result.current.post).toEqual(POST));
    now.mockRestore();

    const missing = renderHook(() => useXPost('23'));
    await waitFor(() => expect(missing.result.current.pending).toBe(false));
    missing.unmount();
    renderHook(() => useXPost('23'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reads a post ahead of its preview, which then shows it at once, with no second read', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(POST), { status: 200 }));

    prefetchXPost('https://x.com/jack/status/20');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { result } = renderHook(() => useXPost('20'));

    expect(result.current).toEqual({ post: POST, pending: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads nothing ahead for a link that is no X post', () => {
    prefetchXPost('https://example.com/jack/status/20');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads nothing without an ID', () => {
    const { result } = renderHook(() => useXPost(null));

    expect(result.current).toEqual({ post: null, pending: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
