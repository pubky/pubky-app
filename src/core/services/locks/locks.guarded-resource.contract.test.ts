import { Locks, LocksOptions } from '@synonymdev/locks-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import {
  LOCK_SERVER_ORIGIN,
  LOCK_SERVER_PUBKY,
  PKARR_RELAY,
  setupLocksContractHarness,
  stubLockServerFetch,
} from '@/test-utils/locks-contract';
import { LocksService } from './locks';

const RESOURCE_URL = `${LOCK_SERVER_ORIGIN}/creator/priv-resources/content/id-1`;

setupLocksContractHarness();

beforeEach(() => {
  const client = Locks.forServerWithOptions(LOCK_SERVER_PUBKY, new LocksOptions().addPkarrRelay(PKARR_RELAY));
  useAuthStore.setState({ currentUserPubky: 'account' });
  useLocksAuthStore.setState(locksAuthInitialState);
  useLocksAuthStore
    .getState()
    .init({ session: client.restoreSession('secret-abc'), secret: 'secret-abc', creatorPubky: 'account' });
});

afterEach(() => {
  useLocksAuthStore.setState(locksAuthInitialState);
});

function stubTransport(deleteStatus = 204) {
  const requests: { method: string; url: string }[] = [];
  stubLockServerFetch((request) => {
    requests.push({ method: request.method, url: request.url });
    return request.method === 'PUT'
      ? new Response(
          JSON.stringify({
            creator: LOCK_SERVER_PUBKY,
            guarded_resource: {
              path: '/priv/app.locks/content/id-1',
              hash: '07'.repeat(32),
              content_type: 'image/png',
              size: 1,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      : new Response(null, { status: deleteStatus });
  });
  return requests;
}

describe('pinned Locks SDK 0.1.0 guarded resource delete contract', () => {
  it('deletes a resource at the same Lock Server path it was registered under', async () => {
    const requests = stubTransport();

    await LocksService.registerGuardedResource({ path: 'id-1', contentType: 'image/png', bytes: new Uint8Array([1]) });
    await expect(LocksService.deleteGuardedResource('id-1')).resolves.toBeUndefined();

    expect(requests).toEqual([
      { method: 'PUT', url: RESOURCE_URL },
      { method: 'DELETE', url: RESOURCE_URL },
    ]);
  });

  // The publish clean-up absorbs this rejection; it must still be a reported AppError, not a crash.
  it('rejects a resource the Lock Server does not hold with a Locks AppError', async () => {
    const requests = stubTransport(404);

    const error: unknown = await LocksService.deleteGuardedResource('id-1').catch((caught: unknown) => caught);

    expect(requests).toEqual([{ method: 'DELETE', url: RESOURCE_URL }]);
    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({ service: ErrorService.Locks, operation: 'LocksService.deleteGuardedResource' });
    expect(error).toHaveProperty('cause.message', 'Lock Server request failed with HTTP 404');
  });
});
