import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksApplication } from '@/application/locks/locks';
import type { LockFile } from '@/services/locks/locks.types';
import { LocksController } from './locks';

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

vi.mock('@/application/locks/locks', () => ({
  LocksApplication: {
    fetchLockFile: vi.fn(),
  },
}));

const VALID_LOCK_URL = `pubky://${MOCK_LOCK_AUTHOR_PUBKY}/pub/locks/lock.json`;

describe('LocksController.fetchLockFile', () => {
  beforeEach(() => {
    vi.mocked(LocksApplication.fetchLockFile).mockResolvedValue(MOCK_LOCK_FILE);
  });

  it('delegates to the application for a valid pubky lock url', async () => {
    await expect(LocksController.fetchLockFile({ lockUrl: VALID_LOCK_URL })).resolves.toEqual(MOCK_LOCK_FILE);
    expect(LocksApplication.fetchLockFile).toHaveBeenCalledWith({ lockUrl: VALID_LOCK_URL });
  });
});
