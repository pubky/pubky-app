import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { TFetchLockFileResult } from '@/services/locks/locks.types';
import { MOCK_LOCK_AUTHOR_PUBKY, mockLockFile } from '@/test-utils/locks';
import { useLockFile } from './useLockFile';

const MOCK_LOCK_FILE = mockLockFile();

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { getOrFetchLockFile: vi.fn() },
}));

const LOCK_URL = `pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.json`;
const NEXT_LOCK_URL = `pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/next.json`;

describe('useLockFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(LocksController.getOrFetchLockFile).mockResolvedValue({
      lockFile: MOCK_LOCK_FILE,
      priceSats: '1000',
    });
  });

  it('fetches the lock file once for a url', async () => {
    const { result, rerender } = renderHook(() => useLockFile(LOCK_URL));

    await waitFor(() => expect(result.current.lockFile).toEqual(MOCK_LOCK_FILE));
    expect(LocksController.getOrFetchLockFile).toHaveBeenCalledWith({ lockUrl: LOCK_URL });
    rerender();
    expect(LocksController.getOrFetchLockFile).toHaveBeenCalledOnce();
  });

  it('exposes the price of a payment lock', async () => {
    const { result } = renderHook(() => useLockFile(LOCK_URL));

    await waitFor(() => expect(result.current.priceSats).toBe('1000'));
  });

  it('replaces the cached descriptor and price when the URL changes', async () => {
    const nextFile = mockLockFile({ creator: 'pubkynext' });
    vi.mocked(LocksController.getOrFetchLockFile).mockImplementation(async ({ lockUrl }) =>
      lockUrl === LOCK_URL
        ? { lockFile: MOCK_LOCK_FILE, priceSats: '1000' }
        : { lockFile: nextFile, priceSats: '2000' },
    );
    const { result, rerender } = renderHook(({ url }) => useLockFile(url), { initialProps: { url: LOCK_URL } });
    await waitFor(() => expect(result.current.lockFile).toBe(MOCK_LOCK_FILE));

    rerender({ url: NEXT_LOCK_URL });
    expect(result.current.lockFile).toBeNull();
    await waitFor(() => expect(result.current.lockFile).toBe(nextFile));
    expect(result.current.priceSats).toBe('2000');
  });

  it('ignores a prior URL read that finishes after the URL changes', async () => {
    let resolveOld!: (result: TFetchLockFileResult) => void;
    const nextFile = mockLockFile({ creator: 'pubkynext' });
    vi.mocked(LocksController.getOrFetchLockFile).mockImplementation(({ lockUrl }) =>
      lockUrl === LOCK_URL
        ? new Promise((resolve) => (resolveOld = resolve))
        : Promise.resolve({ lockFile: nextFile, priceSats: '2000' }),
    );
    const { result, rerender } = renderHook(({ url }) => useLockFile(url), { initialProps: { url: LOCK_URL } });
    rerender({ url: NEXT_LOCK_URL });
    await waitFor(() => expect(result.current.lockFile).toBe(nextFile));

    await act(async () => resolveOld({ lockFile: MOCK_LOCK_FILE, priceSats: '1000' }));
    expect(result.current.lockFile).toBe(nextFile);
    expect(result.current.priceSats).toBe('2000');
  });

  it('skips every read when the url is nullish', async () => {
    const { result } = renderHook(() => useLockFile(null));

    await act(async () => undefined);
    expect(result.current.lockFile).toBeNull();
    expect(LocksController.getOrFetchLockFile).not.toHaveBeenCalled();
  });
});
