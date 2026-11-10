import type { LockFile } from '@/services/locks/locks.types';

export const MOCK_LOCK_AUTHOR_PUBKY = 'qr3xqyz3e5cyf9npgxc5zfp15ehhcis6gqsxob4une7bwwazekry';

/** Sample public `lock.json`. Pass overrides for the one field a test cares about. */
export const mockLockFile = (overrides: Partial<LockFile> = {}): LockFile => ({
  version: 1,
  creator: 'pubkycreator123',
  primary_resource: {
    path: '/priv/app.locks/content/example.txt',
    hash: '<hash>',
    content_type: 'text/plain',
    size: 13,
  },
  secondary_resources: {},
  criteria: [
    {
      criterion_id: 'criterion-1',
      verifier_type: 'paykit-payment',
      params: { recipient_pubky: 'pubkycreator123', amount: '1000', asset: 'BTC' },
    },
  ],
  lock_logic: { type: 'all', criteria: ['criterion-1'] },
  access_policy: { requested_credential_ttl_seconds: 900 },
  lock_server: { override: 'pubkyserver123' },
  ...overrides,
});

/**
 * jsdom reports every offset as 0, which would make the Unlock slide-over a no-op no test could see. This gives the
 * button a 120px slide over the price. Returns the restore.
 */
export const stubUnlockSlideGeometry = () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft');
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === 'BUTTON' ? 0 : 120;
    },
  });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetLeft', original);
  };
};
