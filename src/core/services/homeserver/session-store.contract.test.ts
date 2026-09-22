import { Pubky } from '@synonymdev/pubky';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { getAuthClientId } from '@/config/auth';
import { HomeserverService } from './homeserver';

vi.mock('pubky-app-specs', () => ({
  default: vi.fn(),
  userUriBuilder: (key: string) => `pubky://${key}/pub/pubky.app/profile.json`,
}));
const reference = {
  kind: 'grant' as const,
  sessionStoreId: 'missing-contract-record',
  grantId: 'grant',
  clientId: getAuthClientId(),
  grantExpiresAt: 3_000_000_000,
  tokenExpiresAt: 3_000_000_000,
};
afterEach(() => vi.unstubAllGlobals());
function breakIndexedDb() {
  vi.stubGlobal('indexedDB', {
    open() {
      throw new DOMException('Temporary IndexedDB failure', 'UnknownError');
    },
  });
}

describe('pinned SDK session-store error contract', () => {
  it('recognizes an absent record only after a successful read in the real SDK', async () => {
    await expect(new Pubky().browserSessionStore.restore(reference.sessionStoreId)).rejects.toMatchObject({
      name: 'ClientStateError',
      message: `Stored Pubky session not found: ${reference.sessionStoreId}`,
    });
    await expect(AuthApplication.restorePersistedSession({ reference, expectedPubky: 'user' })).resolves.toMatchObject({
      status: 'reauth-required',
      error: { context: { reason: 'missing_local_grant' } },
    });
    await expect(HomeserverService.removeSessionRecord(reference)).resolves.toBeUndefined();
  });
  it('keeps inaccessible IndexedDB retryable although the real SDK list resolves empty', async () => {
    breakIndexedDb();
    await expect(new Pubky().browserSessionStore.list()).resolves.toEqual([]);
    await expect(AuthApplication.restorePersistedSession({ reference, expectedPubky: 'user' })).resolves.toMatchObject({
      status: 'temporary-error',
    });
    await expect(HomeserverService.removeSessionRecord(reference)).rejects.toThrow();
  });
});
