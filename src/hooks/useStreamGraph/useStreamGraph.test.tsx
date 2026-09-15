import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphController } from '@/controllers/graph/graph';
import { PostController } from '@/controllers/post/post';
import { UserController } from '@/controllers/user/user';
import { useGraphStore } from '@/stores/graph/graph.store';
import { useStreamGraph } from './useStreamGraph';

vi.mock('@/controllers/graph/graph', () => ({
  GraphController: { fetchNeighborhood: vi.fn(), fetchPath: vi.fn(), hydrateEntities: vi.fn() },
}));
vi.mock('@/controllers/post/post', () => ({
  PostController: { getDetailsByIds: vi.fn(), getRelationships: vi.fn(), getTags: vi.fn() },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: { getManyDetails: vi.fn(), getManyRelationships: vi.fn() },
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));
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

  it('synthesizes author + post nodes and always seeds the viewer node', async () => {
    const { result } = renderHook(() => useStreamGraph([COMPOSITE]));

    // Stream nodes plus the locally synthesized signed-in user (no edges)
    await waitFor(() => expect(result.current.rawNodeCount).toBe(3));
    expect(result.current.nodes.map((n) => n.id).sort()).toEqual([
      `post:${COMPOSITE}`,
      `user:${AUTHOR}`,
      'user:mepubky',
    ]);
    // The seed is a bare node: no neighborhood fetch, no FOLLOWS flood
    expect(result.current.edges.filter((e) => e.type === 'FOLLOWS')).toHaveLength(0);
  });

  it('colors users from Dexie relationship flags read through the live query', async () => {
    const { result } = renderHook(() => useStreamGraph([COMPOSITE]));

    await waitFor(() => expect(result.current.relationships.get(`user:${AUTHOR}`)).toBe('following'));
    // The live query covers every user on canvas, viewer included
    expect(UserController.getManyRelationships).toHaveBeenCalledWith({
      userIds: expect.arrayContaining([AUTHOR]) as string[],
    });
  });

  it('keeps every stream post (no design tier cap on the feed)', async () => {
    const posts = [0, 1, 2, 3, 4].map((i) => `${AUTHOR}:0032POST${i}`);
    vi.mocked(PostController.getDetailsByIds).mockResolvedValue(
      posts.map((id, i) => ({ id, content: `p${i}`, kind: 'short', indexed_at: 100 + i, attachments: null })) as never,
    );
    const { result } = renderHook(() => useStreamGraph(posts));

    // All five posts of one author stay visible; the explorer would cap at 3
    await waitFor(() => expect(result.current.nodes.filter((n) => n.kind === 'post')).toHaveLength(5));
  });

  it('keeps the searched tags visible without a click, and reveals a hub when its chip is clicked', async () => {
    vi.mocked(PostController.getTags).mockResolvedValue([
      { id: COMPOSITE, tags: [{ label: 'dev', taggers: [], taggers_count: 3, relationship: false }] },
    ] as never);

    const { result, rerender } = renderHook(({ pinned }: { pinned: string[] }) => useStreamGraph([COMPOSITE], pinned), {
      initialProps: { pinned: [] as string[] },
    });

    // The stream synthesizes the hub, but shared hubs stay hidden by default
    await waitFor(() => expect(result.current.rawNodeCount).toBe(4));
    expect(result.current.nodes.some((n) => n.id === 'tag:dev')).toBe(false);

    // A searched tag is the reason the results exist: pin it and it shows
    rerender({ pinned: ['dev'] });
    await waitFor(() => expect(result.current.nodes.some((n) => n.id === 'tag:dev')).toBe(true));
    expect(result.current.expandedIds.has('tag:dev')).toBe(true);
  });

  it('marks an already-synthesized hub expanded when addTag short-circuits', async () => {
    vi.mocked(PostController.getTags).mockResolvedValue([
      { id: COMPOSITE, tags: [{ label: 'dev', taggers: [], taggers_count: 3, relationship: false }] },
    ] as never);

    const { result } = renderHook(() => useStreamGraph([COMPOSITE]));
    await waitFor(() => expect(result.current.rawNodeCount).toBe(4));

    await act(async () => {
      await result.current.addTag('dev');
    });

    // No neighborhood fetch: the hub is already on the raw graph, it was only hidden
    expect(GraphController.fetchNeighborhood).not.toHaveBeenCalled();
    expect(result.current.expandedIds.has('tag:dev')).toBe(true);
    expect(result.current.nodes.some((n) => n.id === 'tag:dev')).toBe(true);
    expect(result.current.selectedNode?.id).toBe('tag:dev');
  });
});
