import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { useGraphStore } from '@/stores/graph/graph.store';
import { useStreamGraph } from './useStreamGraph';

vi.mock('@/controllers/graph/graph', () => ({
  GraphController: { fetchNeighborhood: vi.fn(), fetchPath: vi.fn() },
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: { getDetailsByIds: vi.fn(), getRelationships: vi.fn(), getTags: vi.fn() },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: { getManyDetails: vi.fn(), getManyRelationships: vi.fn() },
}));
vi.mock('@/molecules/Toaster/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/libs/logger/logger', () => ({
  Logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: () => ({ currentUserPubky: 'mepubky' }),
}));

const AUTHOR = 'author1';
const COMPOSITE = `${AUTHOR}:0032POST1`;

describe('useStreamGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGraphStore.getState().reset();
    vi.mocked(PostController.getDetailsByIds).mockResolvedValue([
      { id: COMPOSITE, content: 'hello graph', kind: 'short', indexed_at: 100, attachments: null },
    ] as never);
    vi.mocked(PostController.getRelationships).mockResolvedValue({ replied: null, reposted: null } as never);
    vi.mocked(PostController.getTags).mockResolvedValue([] as never);
    vi.mocked(UserController.getManyDetails).mockResolvedValue(
      new Map([[AUTHOR, { name: 'Author One', image: null }]]) as never,
    );
    vi.mocked(UserController.getManyRelationships).mockResolvedValue(
      new Map([[AUTHOR, { following: true, followed_by: false }]]) as never,
    );
  });

  it('synthesizes author + post nodes from the cached stream', async () => {
    const { result } = renderHook(() => useStreamGraph([COMPOSITE]));

    await waitFor(() => expect(result.current.rawNodeCount).toBe(2));
    expect(result.current.nodes.map((n) => n.id).sort()).toEqual([`post:${COMPOSITE}`, `user:${AUTHOR}`]);
  });

  it('colors users from Dexie relationship flags read through the live query', async () => {
    const { result } = renderHook(() => useStreamGraph([COMPOSITE]));

    await waitFor(() => expect(result.current.relationships.get(`user:${AUTHOR}`)).toBe('following'));
    expect(UserController.getManyRelationships).toHaveBeenCalledWith({ userIds: [AUTHOR] });
  });
});
