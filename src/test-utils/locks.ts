import type { LockFile } from '@/services/locks/locks.types';

export const MOCK_LOCK_AUTHOR_PUBKY = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';

/** Sample public `lock.json`. Pass overrides for the one field a test cares about. */
export const mockLockFile = (overrides: Partial<LockFile> = {}): LockFile => ({
  version: 1,
  creator: 'pubkycreator123',
  primary_resource: {
    path: '/priv/locks.app/content/example.txt',
    hash: '<hash>',
    content_type: 'text/plain',
    size: 13,
  },
  secondary_resources: {},
  criteria: [{ criterion_id: 'criterion-1', verifier_type: 'password', params: { satisfied: true } }],
  lock_logic: { type: 'all', criteria: ['criterion-1'] },
  access_policy: { requested_credential_ttl_seconds: 900 },
  lock_server: { override: 'pubkyserver123' },
  ...overrides,
});
