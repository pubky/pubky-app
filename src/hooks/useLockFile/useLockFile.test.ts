import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { VerifierType } from '@/services/locks/locks.types';
import { MOCK_LOCK_AUTHOR_PUBKY, mockLockFile } from '@/test-utils/locks';
import { useLockFile } from './useLockFile';

const MOCK_LOCK_FILE = mockLockFile();

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchLockFile: vi.fn() },
}));

const LOCK_URL = `pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.json`;

describe('useLockFile', () => {
  beforeEach(() => {
    vi.mocked(LocksController.fetchLockFile).mockResolvedValue({
      lockFile: MOCK_LOCK_FILE,
      verifierType: VerifierType.PASSWORD,
    });
  });

  it('fetches the lock file for a url', async () => {
    const { result } = renderHook(() => useLockFile(LOCK_URL));

    await waitFor(() => expect(result.current.lockFile).toEqual(MOCK_LOCK_FILE));
    expect(result.current.hasError).toBe(false);
    expect(LocksController.fetchLockFile).toHaveBeenCalledWith({ lockUrl: LOCK_URL });
  });

  it('skips fetching when the url is nullish', () => {
    const { result } = renderHook(() => useLockFile(null));

    expect(result.current.lockFile).toBeNull();
    expect(result.current.hasError).toBe(false);
    expect(LocksController.fetchLockFile).not.toHaveBeenCalled();
  });

  it('flags hasError (without throwing) when the controller rejects', async () => {
    vi.mocked(LocksController.fetchLockFile).mockRejectedValue(new Error('invalid or unreachable'));
    const { result } = renderHook(() => useLockFile(LOCK_URL));

    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.lockFile).toBeNull();
  });
});
