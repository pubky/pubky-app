import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphApplication } from '@/application/graph/graph';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { UserStreamApplication } from '@/application/stream/users/users';
import type { Pubky } from '@/models/models.types';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { NexusGraphService } from '@/services/nexus/graph/graph';
import type { NexusGraph } from '@/services/nexus/graph/graph.types';

vi.mock('@/services/nexus/graph/graph', () => ({
  NexusGraphService: { neighborhood: vi.fn(), path: vi.fn() },
}));
vi.mock('@/services/local/stream/users/users', () => ({
  LocalStreamUsersService: { getNotPersistedUsersInCache: vi.fn() },
}));
vi.mock('@/services/local/stream/posts/posts', () => ({
  LocalStreamPostsService: { getNotPersistedPostsInCache: vi.fn() },
}));
vi.mock('@/application/stream/users/users', () => ({
  UserStreamApplication: { fetchMissingUsersFromNexus: vi.fn() },
}));
vi.mock('@/application/stream/posts/post', () => ({
  PostStreamApplication: { fetchMissingPostsFromNexus: vi.fn() },
}));

const VIEWER = 'viewer00000000000000000000000000000000000000000000000' as Pubky;
const ALICE = 'alice0000000000000000000000000000000000000000000000000' as Pubky;
const BOB = 'bob000000000000000000000000000000000000000000000000000' as Pubky;

const GRAPH: NexusGraph = {
  nodes: [
    { kind: 'user', id: `user:${ALICE}`, pubky: ALICE, name: 'Alice', image: null },
    { kind: 'user', id: `user:${BOB}`, pubky: BOB, name: 'Bob', image: null },
    {
      kind: 'post',
      id: `post:${ALICE}:0032ABC`,
      author_id: ALICE,
      post_id: '0032ABC',
      content: 'hi',
      post_kind: 'short',
      indexed_at: 1,
    },
    { kind: 'tag', id: 'tag:pubky', label: 'pubky', count: 3 },
  ],
  edges: [],
};

/** Resolves once queued microtasks (the fire-and-forget ingestion) have run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('GraphApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(NexusGraphService.neighborhood).mockResolvedValue(GRAPH);
    vi.mocked(NexusGraphService.path).mockResolvedValue(GRAPH);
    vi.mocked(LocalStreamUsersService.getNotPersistedUsersInCache).mockResolvedValue([ALICE]);
    vi.mocked(LocalStreamPostsService.getNotPersistedPostsInCache).mockResolvedValue([`${ALICE}:0032ABC`]);
    vi.mocked(UserStreamApplication.fetchMissingUsersFromNexus).mockResolvedValue(undefined);
    vi.mocked(PostStreamApplication.fetchMissingPostsFromNexus).mockResolvedValue(undefined);
  });

  it('fetchNeighborhood returns the graph and ingests cache-missed entities through the stream pipeline', async () => {
    const result = await GraphApplication.fetchNeighborhood({ kind: 'user', id: ALICE }, VIEWER);
    expect(result).toEqual(GRAPH);
    await flush();

    expect(LocalStreamUsersService.getNotPersistedUsersInCache).toHaveBeenCalledWith([ALICE, BOB]);
    expect(LocalStreamPostsService.getNotPersistedPostsInCache).toHaveBeenCalledWith([`${ALICE}:0032ABC`]);
    expect(UserStreamApplication.fetchMissingUsersFromNexus).toHaveBeenCalledWith({
      cacheMissUserIds: [ALICE],
      viewerId: VIEWER,
    });
    expect(PostStreamApplication.fetchMissingPostsFromNexus).toHaveBeenCalledWith({
      cacheMissPostIds: [`${ALICE}:0032ABC`],
      viewerId: VIEWER,
    });
  });

  it('fetchPath ingests too', async () => {
    await GraphApplication.fetchPath({ from: VIEWER, to: ALICE });
    await flush();
    expect(UserStreamApplication.fetchMissingUsersFromNexus).toHaveBeenCalled();
  });

  it('skips the post fetch when everything is already persisted', async () => {
    vi.mocked(LocalStreamUsersService.getNotPersistedUsersInCache).mockResolvedValue([]);
    vi.mocked(LocalStreamPostsService.getNotPersistedPostsInCache).mockResolvedValue([]);
    await GraphApplication.fetchNeighborhood({ kind: 'user', id: ALICE });
    await flush();
    expect(PostStreamApplication.fetchMissingPostsFromNexus).not.toHaveBeenCalled();
  });

  it('never rejects the caller when ingestion fails', async () => {
    vi.mocked(LocalStreamUsersService.getNotPersistedUsersInCache).mockRejectedValue(new Error('dexie down'));
    const result = await GraphApplication.fetchNeighborhood({ kind: 'user', id: ALICE });
    expect(result).toEqual(GRAPH);
    await flush();
  });
});
