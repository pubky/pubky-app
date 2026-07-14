import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { LockFile } from '@/services/locks/locks.types';
import { useLockFile } from './useLockFile';

// TODO:[Locks] #1998 — inline test fixtures (sample lock file + author pubky) are
// duplicated across the lock tests; consider extracting a shared test util/fixture.
const MOCK_LOCK_AUTHOR_PUBKY = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';
const MOCK_LOCK_FILE: LockFile = {
  version: 1,
  creator: 'pubkycreator123',
  guarded_resource: {
    path: '/priv/locks.app/content/example.txt',
    hash: '<hash>',
    content_type: 'text/plain',
    size: 13,
  },
  criteria: [{ criterion_id: 'criterion-1', verifier_type: 'password', params: { satisfied: true } }],
  lock_logic: { type: 'all', criteria: ['criterion-1'] },
  access_policy: { requested_credential_ttl_seconds: 900 },
  lock_server: { override: 'pubkyserver123' },
};

vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchLockFile: vi.fn() },
}));

const LOCK_URL = `pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.json`;

describe('useLockFile', () => {
  beforeEach(() => {
    vi.mocked(LocksController.fetchLockFile).mockResolvedValue(MOCK_LOCK_FILE);
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
