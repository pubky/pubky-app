import { webcrypto } from 'node:crypto';
import { Keypair, Pubky } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, options: unknown, callback?: () => unknown) =>
        typeof options === 'function' ? options() : callback?.(),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
function breakIndexedDb() {
  vi.stubGlobal('indexedDB', {
    open() {
      throw new DOMException('Temporary IndexedDB failure', 'UnknownError');
    },
  });
}

describe('pinned SDK session-store error contract', () => {
  it.each(['missing-key', 'unsupported-version'])(
    'requires reauthorization for terminal SDK storage outcome: %s',
    async (outcome) => {
      const sdk = new Pubky();
      expect(await sdk.browserSessionStore.isAvailable()).toBe(true);
      const publicKey = Keypair.random().publicKey.z32();
      const id = `contract-${outcome}`;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('pubky-auth', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('storedSessions', 'readwrite');
          tx.objectStore('storedSessions').put({
            version: outcome === 'missing-key' ? 'pubky-session-v1' : 'pubky-session-v999',
            id,
            storageMode: 'delegated',
            credential: JSON.stringify({
              version: 'pubky-delegated-grant-credential-v1',
              grantJws: 'key-check-precedes-grant-decoding',
              homeserverPublicKey: publicKey,
              clientPublicKey: publicKey,
              keyId: 'absent-proof-key',
            }),
            publicKey,
            homeserver: publicKey,
            grantId: reference.grantId,
            clientId: reference.clientId,
            capabilities: ['/:rw'],
            grantExpiresAt: reference.grantExpiresAt,
            createdAt: Date.now(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        await expect(sdk.browserSessionStore.restore(id)).rejects.toMatchObject({
          name: 'ClientStateError',
          message:
            outcome === 'missing-key'
              ? 'Delegated grant key not found: absent-proof-key'
              : 'Unsupported stored session version.',
        });
        if (outcome === 'unsupported-version') {
          await expect(sdk.browserSessionStore.remove(id)).rejects.toMatchObject({
            name: 'ClientStateError',
            message: 'Unsupported stored session version.',
          });
          const retained = await new Promise<unknown>((resolve, reject) => {
            const request = db.transaction('storedSessions').objectStore('storedSessions').get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          expect(retained).toMatchObject({ id, version: 'pubky-session-v999' });
        }
        await expect(
          AuthApplication.restorePersistedSession({
            reference: { ...reference, sessionStoreId: id },
            expectedPubky: publicKey,
          }),
        ).resolves.toMatchObject({
          status: 'reauth-required',
          error: {
            context: { reason: outcome === 'missing-key' ? 'missing_local_grant' : 'unsupported_stored_session' },
          },
        });
      } finally {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('storedSessions', 'readwrite');
          tx.objectStore('storedSessions').delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      }
    },
  );
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
  it('reports absent Web Locks as retryable browser storage unavailability', async () => {
    vi.stubGlobal('navigator', {});
    await expect(new Pubky().browserSessionStore.isAvailable()).resolves.toBe(false);
    await expect(AuthApplication.restorePersistedSession({ reference, expectedPubky: 'user' })).resolves.toMatchObject({
      status: 'temporary-error',
      error: { code: 'INIT_FAILED' },
    });
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

// Public fixture from pubky-common CookieSessionRecord::serialize; contains no cookie secret.
const legacyExport = Buffer.from([
  0, 59, 106, 39, 188, 206, 182, 164, 45, 98, 163, 168, 208, 42, 111, 13, 115, 101, 50, 21, 119, 29, 226, 67, 166, 58,
  192, 72, 161, 139, 89, 218, 41, 0, 0, 3, 102, 111, 111, 1, 4, 47, 58, 114, 119,
]).toString('base64');

it('matches the real SDK terminal missing-cookie error used only for revocation', async () => {
  // Signed public PKARR fixtures: zero-seed user → one-seed homeserver → legacy-cookie.test.
  // Only HTTP responses are faked; the SDK verifies routing packets and decodes the legacy export.
  const packets: Record<string, string> = {
    '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo':
      'XTDocF4Xf6HpVOBIowal9ggCGKv383XHTY9OHqmQRvRPd+0uJDBTxrKwIUzoaERgl/4+DWme0M3YTe3XfM1wBAAGZRcomIAAAACAAAAAAAEAAAAABl9wdWJreTQ4cGlueHhncXM0MW40YWlkaWRlbnc1YXBxcDF1cmZtemR6dHI4anQ0YWJya2RuNDM1ZXdvAABBAAEAAA4QADgAADR0a3JxOHptd2I4YTNtOWsxNWNzdTNxMTdxbWZncW5wOWRza2JyZzl1cTFyeWRweXhwN3F5AA==',
    tkrq8zmwb8a3m9k15csu3q17qmfgqnp9dskbrg9uq1rydpyxp7qy:
      'FSgcCvQf4IDHyAtpTkQvSSCN3RsLYv7QC1vNT3qOf9nhNFbL89xLKYGT7LAfAeBLX723CTWU1v5jzB2PCWZnDwAGZRcomIAAAACAAAAAAAEAAAAANHRrcnE4em13YjhhM205azE1Y3N1M3ExN3FtZmdxbnA5ZHNrYnJnOXVxMXJ5ZHB5eHA3cXkAAEEAAQAADhAAFgABDWxlZ2FjeS1jb29raWUEdGVzdAA=',
  };
  const fetch = vi.fn(async (request: RequestInfo | URL) => {
    const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
    const packet = packets[new URL(url).pathname.slice(1)];
    const response = packet ? new Response(Buffer.from(packet, 'base64')) : new Response(null, { status: 404 });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });
  vi.stubGlobal('fetch', fetch);
  await expect(new Pubky().restoreSession(legacyExport)).rejects.toMatchObject({
    name: 'AuthenticationError',
    message: 'Authentication error: The provided auth request has expired or was cancelled.',
  });
  await expect(HomeserverService.revokeLegacyCookieSession(legacyExport)).resolves.toBeUndefined();
  expect(
    fetch.mock.calls.some(
      ([request]) =>
        new URL(typeof request === 'string' ? request : request instanceof URL ? request.href : request.url)
          .pathname === '/session',
    ),
  ).toBe(true);
});

it('the pinned SDK reports malformed local and delegated pending state as InvalidInput', async () => {
  const sdk = new Pubky();
  expect(() => sdk.resumeGrantAuthFlow('{broken')).toThrow(expect.objectContaining({ name: 'InvalidInput' }));
  await expect(sdk.resumeDelegatedGrantAuthFlow('{broken')).rejects.toMatchObject({ name: 'InvalidInput' });
});
