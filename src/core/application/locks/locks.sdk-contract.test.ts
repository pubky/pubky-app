import { readFileSync } from 'node:fs';
import { initSync } from '@synonymdev/locks-sdk';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksService } from '@/services/locks/locks';
import { LocksApplication } from './locks';

const mocks = vi.hoisted(() => ({
  creatorPubky: 'pubky7ir1ttte48bcp4zjychjyscicrwi1j34mtt91ptsafdbjmr8g9eo',
  createContentLock: vi.fn(),
}));

vi.mock('@/services/locks/locks.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/locks/locks.utils')>();
  return {
    ...actual,
    // Load the web SDK's real WASM from disk below instead of fetching it in jsdom.
    ensureLocksSdkReady: async () => {},
    getLockSession: () => ({
      creatorPubky: () => mocks.creatorPubky,
      lockServer: () => mocks.creatorPubky,
      creator: { createContentLock: mocks.createContentLock },
    }),
  };
});

const primaryResource = {
  path: '/priv/app.locks/content/post.json',
  hash: '07'.repeat(32),
  content_type: 'application/json',
  size: 1,
};

beforeAll(() => {
  const sdkEntry = import.meta.resolve('@synonymdev/locks-sdk');
  initSync({ module: readFileSync(new URL('./locks_sdk_wasm_bg.wasm', sdkEntry)) });
});

beforeEach(() => {
  mocks.createContentLock.mockResolvedValue({
    lock_id: 'created-lock',
    content_lock_path: '/pub/app.locks/created-lock.json',
    content_lock: { creator: mocks.creatorPubky },
  });
  vi.spyOn(LocksService, 'registerGuardedResource').mockResolvedValue({
    resource: primaryResource,
    creator: mocks.creatorPubky,
  });
  vi.spyOn(LocksApplication, 'fetchLockFile').mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Locks publishing SDK contract', () => {
  it.each(['BTC', 'USD'] as const)('builds a valid %s payment lock with the installed SDK', async (asset) => {
    // Keep application assembly and the service's real SDK builder in the path. Mocked builders
    // cannot catch required criterion fields added by the SDK, such as payment_in in 0.1.0.
    await expect(
      LocksApplication.createLockContent({
        lockConfig: { amount: '1000', asset },
        buildPost: () => ({ contentType: 'application/json', bytes: new Uint8Array([1]) }),
      }),
    ).resolves.toEqual({
      lock_id: 'created-lock',
      content_lock_path: '/pub/app.locks/created-lock.json',
      creator: mocks.creatorPubky,
    });
    expect(mocks.createContentLock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        primary_resource: primaryResource,
        criteria: [
          {
            criterion_id: 'criterion-1',
            verifier_type: 'paykit-payment',
            params: { recipient_pubky: mocks.creatorPubky, amount: '1000', asset, payment_in: 24 },
          },
        ],
      }),
    );
  });
});
