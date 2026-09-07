import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamUserController } from '@/controllers/stream/users/users';
import { db } from '@/database/franky/franky';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { useBulkUserAvatars } from './useBulkUserAvatars';

vi.mock('@/controllers/stream/users/users', () => ({ StreamUserController: { getOrFetchUsers: vi.fn() } }));

describe('useBulkUserAvatars with reactive local data', () => {
  beforeEach(async () => {
    await db.initialize();
    await UserDetailsModel.table.clear();
    vi.mocked(StreamUserController.getOrFetchUsers)
      .mockReset()
      .mockImplementation(async ({ userIds }) => {
        await UserDetailsModel.table.bulkPut(
          userIds.map((id) => ({ id, name: id, bio: '', image: null, indexed_at: 0, links: null, status: null })),
        );
      });
  });

  // Twenty sequential database/reactivity round trips need more than the
  // default five seconds when the full suite shares busy CI workers.
  it('hydrates only the new page and still reacts to edits to existing users', async () => {
    const ids = Array.from({ length: 1000 }, (_, index) => `user-${index}`);
    const { result, rerender } = renderHook(({ userIds }) => useBulkUserAvatars(userIds), {
      initialProps: { userIds: ids.slice(0, 50) },
    });
    for (let size = 50; size <= ids.length; size += 50) {
      if (size > 50) rerender({ userIds: ids.slice(0, size) });
      await waitFor(() => expect(result.current.usersMap.get(ids[size - 1])?.name).toBe(ids[size - 1]));
    }
    expect(vi.mocked(StreamUserController.getOrFetchUsers).mock.calls.flatMap(([args]) => args.userIds)).toEqual(ids);
    await act(async () => {
      await UserDetailsModel.table.update(ids[0], { name: 'Updated name' });
    });
    await waitFor(() => expect(result.current.usersMap.get(ids[0])?.name).toBe('Updated name'));
    expect(StreamUserController.getOrFetchUsers).toHaveBeenCalledTimes(20);
  }, 15_000);
  it('retries users omitted by a successful request when another page arrives', async () => {
    vi.mocked(StreamUserController.getOrFetchUsers).mockResolvedValueOnce(undefined);
    const { result, rerender } = renderHook(({ ids }) => useBulkUserAvatars(ids), {
      initialProps: { ids: ['missing'] },
    });
    await waitFor(() => expect(StreamUserController.getOrFetchUsers).toHaveBeenCalledTimes(1));
    rerender({ ids: ['missing', 'new'] });
    await waitFor(() => expect(result.current.usersMap.get('missing')?.name).toBe('missing'));
    expect(StreamUserController.getOrFetchUsers).toHaveBeenLastCalledWith({ userIds: ['missing', 'new'] });
  });
});
