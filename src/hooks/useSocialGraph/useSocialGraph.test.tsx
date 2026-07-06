import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphController } from '@/controllers/graph/graph';
import type { NexusGraph } from '@/services/nexus/graph/graph.types';
import { useGraphStore } from '@/stores/graph/graph.store';
import { useSocialGraph } from './useSocialGraph';

vi.mock('@/controllers/graph/graph', () => ({
  GraphController: { fetchNeighborhood: vi.fn(), fetchPath: vi.fn() },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: () => ({ currentUserPubky: 'mepubky' }),
}));

const mockGetNeighborhood = vi.mocked(GraphController.fetchNeighborhood);
const mockGetPath = vi.mocked(GraphController.fetchPath);

const ME = 'mepubky';
const initialGraph: NexusGraph = {
  nodes: [
    { kind: 'user', id: `user:${ME}`, pubky: ME, name: 'Me', image: null },
    { kind: 'user', id: 'user:friend', pubky: 'friend', name: 'Friend', image: null },
    {
      kind: 'post',
      id: `post:${ME}:p1`,
      author_id: ME,
      post_id: 'p1',
      content: 'hi',
      post_kind: 'short',
      indexed_at: 1,
    },
    { kind: 'tag', id: 'tag:pubky', label: 'pubky', count: 3 },
  ],
  edges: [
    { source: `user:${ME}`, target: 'user:friend', type: 'FOLLOWS', indexed_at: 10 },
    { source: 'user:friend', target: `user:${ME}`, type: 'FOLLOWS', indexed_at: 20 },
    { source: `user:${ME}`, target: `post:${ME}:p1`, type: 'AUTHORED' },
    { source: 'tag:pubky', target: `user:${ME}`, type: 'TAGGED', label: 'pubky' },
  ],
};

async function loadedHook() {
  mockGetNeighborhood.mockResolvedValueOnce(initialGraph);
  const rendered = renderHook(() => useSocialGraph());
  act(() => {
    rendered.result.current.load(ME);
  });
  await waitFor(() => expect(rendered.result.current.nodes).toHaveLength(4));
  return rendered;
}

describe('useSocialGraph', () => {
  beforeEach(() => {
    mockGetNeighborhood.mockReset();
    mockGetPath.mockReset();
    // View preferences live in a persisted store shared across tests
    useGraphStore.getState().reset();
  });

  it('loads a neighborhood, starts the trail, and derives the visual model', async () => {
    const { result } = await loadedHook();

    expect(mockGetNeighborhood).toHaveBeenCalledWith({ kind: 'user', id: ME, depth: 1 }, ME);
    expect(result.current.focusId).toBe(`user:${ME}`);
    expect(result.current.trail.map((t) => t.id)).toEqual([`user:${ME}`]);
    expect(result.current.edges.filter((e) => e.type === 'FRIEND')).toHaveLength(1);
    expect(result.current.relationships.get('user:friend')).toBe('friend');
    expect(result.current.classCounts.get('friend')).toBe(1);
    expect(result.current.classCounts.get('post')).toBe(1);
    expect(result.current.timeBounds).toEqual({ min: 1, max: 20 });
  });

  it('expands a node by merging its neighborhood and is idempotent', async () => {
    const { result } = await loadedHook();

    mockGetNeighborhood.mockResolvedValueOnce({
      nodes: [
        { kind: 'user', id: 'user:friend', pubky: 'friend', name: 'Friend', image: null },
        { kind: 'user', id: 'user:new', pubky: 'new', name: 'New', image: null },
      ],
      edges: [{ source: 'user:friend', target: 'user:new', type: 'FOLLOWS' }],
    });

    await act(async () => {
      await result.current.expand('user:friend');
    });

    expect(mockGetNeighborhood).toHaveBeenLastCalledWith({ kind: 'user', id: 'friend', depth: 1 }, ME);
    expect(result.current.nodes).toHaveLength(5);
    expect(result.current.expandedIds.has('user:friend')).toBe(true);

    await act(async () => {
      await result.current.expand('user:friend');
    });
    expect(mockGetNeighborhood).toHaveBeenCalledTimes(2);
  });

  it('refreshNode bypasses the expanded guard', async () => {
    const { result } = await loadedHook();

    mockGetNeighborhood.mockResolvedValue({ nodes: [], edges: [] });
    await act(async () => {
      await result.current.expand('user:friend');
    });
    await act(async () => {
      await result.current.refreshNode('user:friend');
    });

    expect(mockGetNeighborhood).toHaveBeenCalledTimes(3);
  });

  it('keeps the graph untouched when an expansion fails', async () => {
    const { result } = await loadedHook();

    mockGetNeighborhood.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await result.current.expand('user:friend');
    });

    expect(result.current.nodes).toHaveLength(4);
    expect(result.current.expandedIds.has('user:friend')).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it('legend class toggles hide nodes and their edge families', async () => {
    const { result } = await loadedHook();

    act(() => {
      result.current.toggleClass('post');
      result.current.toggleClass('tag');
    });

    expect(result.current.nodes.every((n) => n.kind === 'user')).toBe(true);
    expect(result.current.edges.every((e) => e.type === 'FRIEND' || e.type === 'FOLLOWS')).toBe(true);

    act(() => {
      result.current.toggleClass('friend');
    });
    expect(result.current.nodes.map((n) => n.id)).toEqual([`user:${ME}`]);
  });

  it('time cap hides newer edges and re-derives relationships', async () => {
    const { result } = await loadedHook();

    act(() => {
      result.current.setTimeCap(15);
    });

    // Only the me->friend edge (ts 10) survives; the return edge (ts 20) is in the future
    expect(result.current.relationships.get('user:friend')).toBe('following');
    expect(result.current.edges.filter((e) => e.type === 'FRIEND')).toHaveLength(0);

    act(() => {
      result.current.setTimeCap(null);
    });
    expect(result.current.relationships.get('user:friend')).toBe('friend');
  });

  it('focus pushes trail hops without consecutive duplicates', async () => {
    const { result } = await loadedHook();

    act(() => {
      result.current.focus('user:friend');
    });
    act(() => {
      result.current.focus('user:friend');
    });

    expect(result.current.trail.map((t) => t.id)).toEqual([`user:${ME}`, 'user:friend']);
    expect(result.current.relationships.get('user:friend')).toBe('self');
  });

  it('tracePath merges the path and exposes its ordered ids', async () => {
    const { result } = await loadedHook();

    mockGetPath.mockResolvedValueOnce({
      nodes: [
        { kind: 'user', id: `user:${ME}`, pubky: ME, name: 'Me', image: null },
        { kind: 'user', id: 'user:mid', pubky: 'mid', name: 'Mid', image: null },
        { kind: 'user', id: 'user:far', pubky: 'far', name: 'Far', image: null },
      ],
      edges: [
        { source: `user:${ME}`, target: 'user:mid', type: 'FOLLOWS' },
        { source: 'user:mid', target: 'user:far', type: 'FOLLOWS' },
      ],
    });

    await act(async () => {
      await result.current.tracePath('far');
    });

    expect(mockGetPath).toHaveBeenCalledWith({ from: ME, to: 'far' }, ME);
    expect(result.current.pathIds).toEqual([`user:${ME}`, 'user:mid', 'user:far']);
    expect(result.current.nodes.map((n) => n.id)).toContain('user:far');

    act(() => {
      result.current.clearPath();
    });
    expect(result.current.pathIds).toBeNull();
  });
});
