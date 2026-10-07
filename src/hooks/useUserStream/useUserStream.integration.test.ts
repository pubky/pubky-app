import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamUserController } from '@/controllers/stream/users/users';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { useUserStream } from './useUserStream';

vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: { getOrFetchStreamSlice: vi.fn() },
}));

describe('useUserStream with reactive local data', () => {
  beforeEach(() => {
    vi.mocked(StreamUserController.getOrFetchStreamSlice).mockResolvedValue({
      nextPageIds: ['stream-user'],
      skip: 1,
      isExhausted: true,
    });
  });

  it('changes the avatar URL when a cached user is re-indexed without refetching the stream', async () => {
    const before = {
      id: 'stream-user',
      name: 'Old name',
      bio: 'Old bio',
      image: 'old.jpg',
      indexed_at: 1,
      status: null,
      links: null,
    };
    await UserDetailsModel.table.put(before);

    // Keep the hook, local controller reads, Dexie subscription and URL builder real.
    const { result } = renderHook(() => useUserStream({ streamId: UserStreamTypes.RECOMMENDED }));

    await waitFor(() => expect(result.current.users[0]?.name).toBe('Old name'));
    const oldUrl = result.current.users[0].avatarUrl;
    expect(oldUrl).toMatch(/\/avatar\/stream-user\?v=1$/);

    await act(async () => {
      await UserDetailsModel.table.put({
        ...before,
        name: 'New name',
        bio: 'New bio',
        image: 'new.jpg',
        indexed_at: 2,
      });
    });

    await waitFor(() => expect(result.current.users[0]?.name).toBe('New name'));
    expect(result.current.users[0].bio).toBe('New bio');
    expect(result.current.users[0].avatarUrl).toMatch(/\/avatar\/stream-user\?v=2$/);
    expect(result.current.users[0].avatarUrl).not.toBe(oldUrl);
    expect(StreamUserController.getOrFetchStreamSlice).toHaveBeenCalledTimes(1);

    await act(async () => {
      await UserDetailsModel.table.update(before.id, { image: null, indexed_at: 3 });
    });

    await waitFor(() => expect(result.current.users[0]?.avatarUrl).toBeNull());
  });
});
