import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCategory } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { asOpaque } from '@/test-utils/type-assertions';
import { LocksContentService } from './locksContent';

const mocks = vi.hoisted(() => ({
  registerGuardedResource: vi.fn(),
  createContentLock: vi.fn(),
}));

vi.mock('@pubky/locks-sdk', () => ({
  RegisterGuardedResourceOptions: class {
    constructor(
      public path: string,
      public contentType: string,
      public bytes: Uint8Array,
    ) {}
  },
  CreateContentLockRequestBuilder: class {
    primaryResource() {
      return this;
    }
    secondaryResource() {
      return this;
    }
    criteria() {
      return this;
    }
    lockLogic() {
      return this;
    }
    accessPolicy() {
      return this;
    }
    lockServer() {
      return this;
    }
    build() {
      return { body: true };
    }
  },
}));

const session = asOpaque<LocksSdkSession>({
  creator: { registerGuardedResource: mocks.registerGuardedResource, createContentLock: mocks.createContentLock },
});

const descriptor = { path: '/priv/locks.app/content/id-1', hash: 'H', content_type: 'image/png', size: 1 };

const lockParams = {
  session,
  primaryResource: descriptor,
  criteria: [],
  lockLogic: { type: 'all', criteria: [] },
  accessPolicy: { requested_credential_ttl_seconds: 900 },
  lockServer: { override: 'lockpubky' },
};

describe('LocksContentService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registerGuardedResource returns the descriptor and the owner pubky', async () => {
    mocks.registerGuardedResource.mockResolvedValue({ guarded_resource: descriptor, creator: 'pubkybob' });

    const result = await LocksContentService.registerGuardedResource({
      session,
      path: 'id-1',
      contentType: 'image/png',
      bytes: new Uint8Array([1]),
    });

    expect(result).toEqual({ resource: descriptor, creator: 'pubkybob' });
  });

  it('createContentLock returns the lock descriptor', async () => {
    mocks.createContentLock.mockResolvedValue({
      lock_id: 'LOCK1',
      content_lock_path: '/pub/locks.app/LOCK1.json',
      content_lock: { creator: 'pubkybob' },
    });

    const result = await LocksContentService.createContentLock(lockParams);

    expect(result).toEqual({ lock_id: 'LOCK1', content_lock_path: '/pub/locks.app/LOCK1.json', creator: 'pubkybob' });
  });

  // The SDK exposes no status field — an HTTP 401 only shows up in the message.
  it.each([
    [
      'registerGuardedResource',
      () =>
        LocksContentService.registerGuardedResource({
          session,
          path: 'id-1',
          contentType: 'image/png',
          bytes: new Uint8Array([1]),
        }),
      mocks.registerGuardedResource,
    ],
    ['createContentLock', () => LocksContentService.createContentLock(lockParams), mocks.createContentLock],
  ])('%s promotes an HTTP 401 to an auth error', async (_name, call, mock) => {
    mock.mockRejectedValue(new Error('Lock Server request failed with HTTP 401'));

    const error = await call().catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).toBe(ErrorCategory.Auth);
  });

  it('leaves other HTTP failures as non-auth errors', async () => {
    mocks.createContentLock.mockRejectedValue(new Error('Lock Server request failed with HTTP 422'));

    const error = await LocksContentService.createContentLock(lockParams).catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).not.toBe(ErrorCategory.Auth);
  });

  it('leaves a network failure as a non-auth error', async () => {
    mocks.registerGuardedResource.mockRejectedValue(
      new Error('Lock Server request failed: TypeError: Failed to fetch'),
    );

    const error = await LocksContentService.registerGuardedResource({
      session,
      path: 'id-1',
      contentType: 'image/png',
      bytes: new Uint8Array([1]),
    }).catch((caught: unknown) => caught);

    expect(isAppError(error)).toBe(true);
    expect((error as { category: ErrorCategory }).category).not.toBe(ErrorCategory.Auth);
  });
});
