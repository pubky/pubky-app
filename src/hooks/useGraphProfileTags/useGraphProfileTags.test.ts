import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserController } from '@/controllers/user/user';
import type { Pubky } from '@/models/models.types';
import type { NexusTag } from '@/services/nexus/nexus.types';
import { useGraphProfileTags } from './useGraphProfileTags';

vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getManyTags: vi.fn(),
    getManyTagsOrFetch: vi.fn(),
  },
}));

const mockGetManyTags = vi.mocked(UserController.getManyTags);
const mockGetManyTagsOrFetch = vi.mocked(UserController.getManyTagsOrFetch);

const PK_A = 'a'.repeat(52) as Pubky;
const PK_B = 'b'.repeat(52) as Pubky;

describe('useGraphProfileTags', () => {
  beforeEach(() => {
    mockGetManyTags.mockReset();
    mockGetManyTagsOrFetch.mockReset();
  });

  it('reads tags for the canvas users through the local-only bulk reader', async () => {
    const tags = new Map<Pubky, NexusTag[]>([
      [PK_A, [{ label: 'dev', taggers: [], taggers_count: 3, relationship: false }]],
    ]);
    mockGetManyTags.mockResolvedValue(tags);

    const { result } = renderHook(() => useGraphProfileTags([PK_A, PK_B]));

    await waitFor(() => expect(result.current.get(PK_A)?.[0]?.label).toBe('dev'));
    expect(mockGetManyTags).toHaveBeenCalledWith({ userIds: [PK_A, PK_B] });
  });

  it('never fires the network-capable fetch path (zero-network-on-hover contract)', async () => {
    mockGetManyTags.mockResolvedValue(new Map());

    const { result } = renderHook(() => useGraphProfileTags([PK_A]));

    await waitFor(() => expect(mockGetManyTags).toHaveBeenCalled());
    expect(result.current.size).toBe(0);
    expect(mockGetManyTagsOrFetch).not.toHaveBeenCalled();
  });

  it('returns an empty map for an empty pubky list without querying', async () => {
    const { result } = renderHook(() => useGraphProfileTags([]));
    await waitFor(() => expect(result.current.size).toBe(0));
    expect(mockGetManyTags).not.toHaveBeenCalled();
  });
});
