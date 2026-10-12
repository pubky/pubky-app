import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamUserController } from '@/controllers/stream/users/users';
import { db } from '@/database/franky/franky';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { useBulkUserAvatars } from './useBulkUserAvatars';

vi.mock('@/controllers/stream/users/users', () => ({ StreamUserController: { getOrFetchUsers: vi.fn() } }));

const { mockGetAvatarUrl } = vi.hoisted(() => ({ mockGetAvatarUrl: vi.fn() }));
vi.mock('@/controllers/file/file', () => ({
  FileController: { getAvatarUrl: (...args: unknown[]) => mockGetAvatarUrl(...args) },
}));

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
  it('labels a tombstoned user as [DELETED] instead of an empty name', async () => {
    vi.mocked(StreamUserController.getOrFetchUsers).mockImplementationOnce(async ({ userIds }) => {
      await UserDetailsModel.table.bulkPut(
        userIds.map((id) => ({
          id,
          name: '',
          bio: '',
          image: null,
          indexed_at: 0,
          links: null,
          status: null,
          deleted: true,
        })),
      );
    });
    const { result } = renderHook(() => useBulkUserAvatars(['tombstone']));

    await waitFor(() => expect(result.current.usersMap.get('tombstone')?.name).toBe('[DELETED]'));
  });

  it('versions avatars by indexed_at and still reacts to a name/bio edit on an existing user', async () => {
    // This user is already cached, so the hook must not re-fetch over the row.
    vi.mocked(StreamUserController.getOrFetchUsers).mockResolvedValue(undefined);
    mockGetAvatarUrl.mockImplementation((id: string, version?: string | number) => `avatar:${id}:${version}`);

    await act(async () => {
      await UserDetailsModel.table.bulkPut([
        {
          id: 'user-edit',
          name: 'Old name',
          bio: 'Old bio',
          image: 'old.jpg',
          indexed_at: 1,
          links: null,
          status: null,
        },
      ]);
    });

    const { result } = renderHook(() => useBulkUserAvatars(['user-edit']));

    await waitFor(() => expect(result.current.usersMap.get('user-edit')?.name).toBe('Old name'));
    expect(result.current.usersMap.get('user-edit')?.avatarUrl).toBe('avatar:user-edit:1');

    // The other user edits their profile; the TTL refresh writes the new row.
    await act(async () => {
      await UserDetailsModel.table.put({
        id: 'user-edit',
        name: 'New name',
        bio: 'New bio',
        image: 'new.jpg',
        indexed_at: 2,
        links: null,
        status: null,
      });
    });

    await waitFor(() => expect(result.current.usersMap.get('user-edit')?.name).toBe('New name'));
    expect(result.current.usersMap.get('user-edit')?.avatarUrl).toBe('avatar:user-edit:2');
  });

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
