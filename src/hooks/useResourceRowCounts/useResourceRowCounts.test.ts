import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NexusTag } from '@/services/nexus/nexus.types';
import type { TResourceCounts } from '@/services/nexus/resource/resource.types';
import { useResourceRowCounts } from './useResourceRowCounts';

const mocks = vi.hoisted(() => ({
  viewerId: 'viewer' as string | null,
  tags: new Map<string, unknown>(),
  counts: new Map<string, unknown>(),
  tagListeners: new Map<string, () => void>(),
  countListeners: new Map<string, (counts: unknown) => void>(),
  fetchResourceTags: vi.fn(),
  fetchCounts: vi.fn(),
}));

vi.mock('@/controllers/tag/tag', () => ({
  TagController: {
    fetchResourceTags: mocks.fetchResourceTags,
    getCachedResourceTags: vi.fn(({ uri, viewerId }: { uri: string; viewerId?: string | null }) =>
      mocks.tags.get(`${uri} ${viewerId ?? ''}`),
    ),
    subscribeResourceTags: vi.fn(
      ({ uri, viewerId }: { uri: string; viewerId?: string | null }, listener: () => void) => {
        mocks.tagListeners.set(`${uri} ${viewerId ?? ''}`, listener);
        return () => mocks.tagListeners.delete(`${uri} ${viewerId ?? ''}`);
      },
    ),
  },
}));
vi.mock('@/controllers/resource/resource', () => ({
  ResourceController: {
    fetchCounts: mocks.fetchCounts,
    getCachedCounts: vi.fn((uri: string) => mocks.counts.get(uri)),
    subscribeCounts: vi.fn((uri: string, listener: (counts: unknown) => void) => {
      mocks.countListeners.set(uri, listener);
      return () => mocks.countListeners.delete(uri);
    }),
  },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (select: (state: { currentUserPubky: string | null }) => unknown) =>
    select({ currentUserPubky: mocks.viewerId }),
}));

const URI = 'https://musicbrainz.org/artist/b5416a54-4941-4fcf-b2a0-7f98da6f9344';
const tag = (label: string): NexusTag => ({
  label,
  taggers: ['ann'],
  taggers_count: 1,
  relationship: false,
  tag_uri: null,
});
const COUNTS: TResourceCounts = { resourceId: 'abc', replies: 4, embeds: 2, collections: 1 };

describe('useResourceRowCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.viewerId = 'viewer';
    mocks.tags.clear();
    mocks.counts.clear();
    mocks.tagListeners.clear();
    mocks.countListeners.clear();
  });

  it('shows nothing for a link not read yet, and asks Nexus nothing', () => {
    const { result } = renderHook(() => useResourceRowCounts(URI));

    expect(result.current).toBeNull();
    expect(mocks.fetchResourceTags).not.toHaveBeenCalled();
    expect(mocks.fetchCounts).not.toHaveBeenCalled();
  });

  it('counts the tags, comments and posts another reader brought in, for the viewer', () => {
    mocks.tags.set(`${URI} viewer`, [tag('test')]);
    mocks.counts.set(URI, COUNTS);

    const { result } = renderHook(() => useResourceRowCounts(URI));

    expect(result.current).toEqual({ tags: 1, isTagsAtReadLimit: false, replies: 4, posts: 2 });
    expect(mocks.fetchResourceTags).not.toHaveBeenCalled();
    expect(mocks.fetchCounts).not.toHaveBeenCalled();
  });

  it('follows the read when it arrives after the row', () => {
    const { result } = renderHook(() => useResourceRowCounts(URI));
    expect(result.current).toBeNull();

    act(() => {
      mocks.tags.set(`${URI} viewer`, [tag('test'), tag('rap')]);
      mocks.counts.set(URI, COUNTS);
      mocks.tagListeners.get(`${URI} viewer`)?.();
      mocks.countListeners.get(URI)?.(COUNTS);
    });

    expect(result.current).toEqual({ tags: 2, isTagsAtReadLimit: false, replies: 4, posts: 2 });
    expect(mocks.fetchResourceTags).not.toHaveBeenCalled();
    expect(mocks.fetchCounts).not.toHaveBeenCalled();
  });

  it('counts 0 for a link Nexus does not know, and leaves out counts it does not serve', () => {
    mocks.tags.set(`${URI} viewer`, []);
    mocks.counts.set(URI, null);
    const { result, rerender } = renderHook(() => useResourceRowCounts(URI));
    expect(result.current).toEqual({ tags: 0, isTagsAtReadLimit: false, replies: 0, posts: 0 });

    mocks.counts.set(URI, { resourceId: 'abc' });
    mocks.tags.set(`${URI} viewer`, [tag('test')]);
    rerender();
    expect(result.current).toEqual({ tags: 1, isTagsAtReadLimit: false, replies: 0, posts: 0 });
  });

  it('waits for the tag read when only the counts were read', () => {
    mocks.counts.set(URI, COUNTS);

    const { result } = renderHook(() => useResourceRowCounts(URI));

    expect(result.current).toBeNull();
  });

  it('marks a full tag answer as a lower bound', () => {
    mocks.tags.set(
      `${URI} viewer`,
      Array.from({ length: 20 }, (_, index) => tag(`t${index}`)),
    );

    const { result } = renderHook(() => useResourceRowCounts(URI));

    expect(result.current).toEqual({ tags: 20, isTagsAtReadLimit: true, replies: 0, posts: 0 });
  });

  it('reads the signed-out answer for a signed-out viewer', () => {
    mocks.viewerId = null;
    mocks.tags.set(`${URI} viewer`, [tag('test')]);
    mocks.tags.set(`${URI} `, [tag('test'), tag('rap'), tag('pop')]);

    const { result } = renderHook(() => useResourceRowCounts(URI));

    expect(result.current?.tags).toBe(3);
  });
});
