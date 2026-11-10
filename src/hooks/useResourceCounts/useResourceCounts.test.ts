import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceController } from '@/controllers/resource/resource';
import type { TResourceCounts } from '@/services/nexus/resource/resource.types';
import { useResourceCounts } from './useResourceCounts';

vi.mock('@/controllers/resource/resource', () => ({
  ResourceController: { fetchCounts: vi.fn(), subscribeCounts: vi.fn(), getCachedCounts: vi.fn() },
}));

const URI = 'https://tidal.com/track/3524506';
const SHARE = `${URI}/u`;
const LINK = { resourceId: 'a', replies: 1, embeds: 0, collections: 0 };
const SPELLING = { resourceId: 'b', replies: 2, embeds: 1, collections: 0 };

describe('useResourceCounts', () => {
  let resolvers: Record<string, { resolve: (counts: TResourceCounts | null) => void; reject: (error: Error) => void }>;
  let listeners: Record<string, (counts: TResourceCounts | null) => void>;

  beforeEach(() => {
    vi.resetAllMocks();
    resolvers = {};
    listeners = {};
    vi.mocked(ResourceController.fetchCounts).mockImplementation(
      ({ uri }) => new Promise((resolve, reject) => (resolvers[uri] = { resolve, reject })),
    );
    vi.mocked(ResourceController.subscribeCounts).mockImplementation((uri, listener) => {
      listeners[uri] = listener;
      return () => {};
    });
  });

  it('on the page, sums the spellings once every one answered', async () => {
    const { result } = renderHook(() => useResourceCounts(URI, { fetch: true, spellings: [SHARE] }));

    await act(async () => resolvers[URI].resolve(LINK));
    expect(result.current).toBeUndefined();
    await act(async () => resolvers[SHARE].resolve(SPELLING));
    expect(result.current).toMatchObject({ resourceId: 'a', resourceIds: ['a', 'b'], replies: 3 });
  });

  it('on the page, counts a spelling whose read failed as none', async () => {
    const { result } = renderHook(() => useResourceCounts(URI, { fetch: true, spellings: [SHARE] }));

    await act(async () => resolvers[SHARE].reject(new Error('down')));
    await act(async () => resolvers[URI].resolve(LINK));
    expect(result.current).toMatchObject({ ...LINK, resourceIds: ['a'] });
  });

  it('on the page, keeps a spelling’s last answer when its read fails', async () => {
    vi.mocked(ResourceController.getCachedCounts).mockImplementation((uri) => (uri === SHARE ? SPELLING : undefined));
    const { result } = renderHook(() => useResourceCounts(URI, { fetch: true, spellings: [SHARE] }));

    await act(async () => resolvers[SHARE].reject(new Error('429')));
    await act(async () => resolvers[URI].resolve(LINK));
    expect(result.current).toMatchObject({ resourceIds: ['a', 'b'], replies: 3 });
  });

  it('on the page, shows no counts from the cache until every spelling is cached', () => {
    vi.mocked(ResourceController.getCachedCounts).mockImplementation((uri) => (uri === URI ? LINK : undefined));
    expect(
      renderHook(() => useResourceCounts(URI, { fetch: true, spellings: [SHARE] })).result.current,
    ).toBeUndefined();

    vi.mocked(ResourceController.getCachedCounts).mockImplementation((uri) => (uri === URI ? LINK : SPELLING));
    expect(renderHook(() => useResourceCounts(URI, { fetch: true, spellings: [SHARE] })).result.current).toMatchObject({
      replies: 3,
    });
  });

  it('on the page, shows no counts when the read of the link itself fails', async () => {
    const { result } = renderHook(() => useResourceCounts(URI, { fetch: true, spellings: [SHARE] }));

    await act(async () => resolvers[URI].reject(new Error('down')));
    await act(async () => resolvers[SHARE].resolve(SPELLING));
    expect(result.current).toBeUndefined();
  });

  it('on a card, shows the link’s counts once read, and adds a spelling’s when it comes in', async () => {
    const { result } = renderHook(() => useResourceCounts(URI, { spellings: [SHARE] }));

    expect(ResourceController.fetchCounts).not.toHaveBeenCalled();
    act(() => listeners[URI](LINK));
    expect(result.current).toMatchObject({ ...LINK, resourceIds: ['a'] });
    act(() => listeners[SHARE](SPELLING));
    expect(result.current).toMatchObject({ resourceIds: ['a', 'b'], replies: 3 });
  });

  it('reads one link as before', async () => {
    const { result } = renderHook(() => useResourceCounts(URI, { fetch: true }));

    await act(async () => resolvers[URI].resolve(LINK));
    expect(result.current).toEqual(LINK);
    expect(ResourceController.fetchCounts).toHaveBeenCalledTimes(1);
  });
});
