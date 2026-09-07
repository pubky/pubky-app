import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamUserController } from '@/controllers/stream/users/users';
import { useBulkUserAvatars } from './useBulkUserAvatars';

const { persisted } = vi.hoisted(() => ({ persisted: new Set<string>() }));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => new Map(Array.from(persisted, (id) => [id, { id, name: id }])),
}));
vi.mock('@/controllers/user/user', () => ({ UserController: { getManyDetails: vi.fn() } }));
vi.mock('@/controllers/file/file', () => ({ FileController: { getAvatarUrl: vi.fn() } }));
vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: { getOrFetchUsers: vi.fn() },
}));

describe('useBulkUserAvatars incremental hydration', () => {
  beforeEach(() => {
    persisted.clear();
    vi.mocked(StreamUserController.getOrFetchUsers)
      .mockReset()
      .mockImplementation(async ({ userIds }) => {
        userIds.forEach((id) => persisted.add(id));
      });
  });

  it('checks each new user once while twenty pages accumulate', async () => {
    const allIds = Array.from({ length: 1000 }, (_, index) => `user-${index}`);
    const { rerender } = renderHook(({ ids }) => useBulkUserAvatars(ids), {
      initialProps: { ids: allIds.slice(0, 50) },
    });
    for (let count = 50; count <= allIds.length; count += 50) {
      if (count > 50) rerender({ ids: allIds.slice(0, count) });
      await waitFor(() => expect(persisted.size).toBe(count));
    }
    const checkedIds = vi.mocked(StreamUserController.getOrFetchUsers).mock.calls.flatMap(([args]) => args.userIds);
    expect(checkedIds).toEqual(allIds);
  });

  it('retries users omitted by a successful request when another page arrives', async () => {
    vi.mocked(StreamUserController.getOrFetchUsers).mockResolvedValueOnce(undefined);
    const { rerender } = renderHook(({ ids }) => useBulkUserAvatars(ids), { initialProps: { ids: ['missing'] } });
    await waitFor(() => expect(StreamUserController.getOrFetchUsers).toHaveBeenCalledTimes(1));
    rerender({ ids: ['missing', 'new'] });
    await waitFor(() =>
      expect(StreamUserController.getOrFetchUsers).toHaveBeenLastCalledWith({ userIds: ['missing', 'new'] }),
    );
  });
});
