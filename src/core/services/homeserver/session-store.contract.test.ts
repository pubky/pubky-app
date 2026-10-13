import { webcrypto } from 'node:crypto';
import { AuthFlowKind, Keypair, Pubky, validateCapabilities } from '@synonymdev/pubky';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { APP_CAPABILITIES, getAuthClientId, LOCKS_CAPABILITIES } from '@/config/auth';
import grantAuth015 from './grant-auth-0.15.fixture.json';
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
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
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('storedSessions', 'readwrite');
            tx.objectStore('storedSessions').delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
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

const routingPackets: Record<string, string> = {
  '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo':
    'XTDocF4Xf6HpVOBIowal9ggCGKv383XHTY9OHqmQRvRPd+0uJDBTxrKwIUzoaERgl/4+DWme0M3YTe3XfM1wBAAGZRcomIAAAACAAAAAAAEAAAAABl9wdWJreTQ4cGlueHhncXM0MW40YWlkaWRlbnc1YXBxcDF1cmZtemR6dHI4anQ0YWJya2RuNDM1ZXdvAABBAAEAAA4QADgAADR0a3JxOHptd2I4YTNtOWsxNWNzdTNxMTdxbWZncW5wOWRza2JyZzl1cTFyeWRweXhwN3F5AA==',
  tkrq8zmwb8a3m9k15csu3q17qmfgqnp9dskbrg9uq1rydpyxp7qy:
    'FSgcCvQf4IDHyAtpTkQvSSCN3RsLYv7QC1vNT3qOf9nhNFbL89xLKYGT7LAfAeBLX723CTWU1v5jzB2PCWZnDwAGZRcomIAAAACAAAAAAAEAAAAANHRrcnE4em13YjhhM205azE1Y3N1M3ExN3FtZmdxbnA5ZHNrYnJnOXVxMXJ5ZHB5eHA3cXkAAEEAAQAADhAAFgABDWxlZ2FjeS1jb29raWUEdGVzdAA=',
};

it('matches the real SDK terminal missing-cookie error used only for revocation', async () => {
  // Signed public PKARR fixtures: zero-seed user → one-seed homeserver → legacy-cookie.test.
  // Only HTTP responses are faked; the SDK verifies routing packets and decodes the legacy export.
  const fetch = vi.fn(async (request: RequestInfo | URL) => {
    const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
    const packet = routingPackets[new URL(url).pathname.slice(1)];
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

function openSessionDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pubky-auth', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedDelegatedFixtureKey(db: IDBDatabase) {
  const key = grantAuth015.delegated.key;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    Buffer.from(key.privateKeyPkcs8, 'base64'),
    'Ed25519',
    false,
    ['sign'],
  );
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('delegatedGrantKeys', 'readwrite');
    tx.objectStore('delegatedGrantKeys').put({
      keyId: key.keyId,
      privateKey,
      publicKeyRaw: new Uint8Array(Buffer.from(key.publicKeyRaw, 'base64')),
      createdAt: key.createdAt,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

describe('SDK upgrade grant compatibility', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Unexpected network request', 'NetworkError')));
  });

  it.each([APP_CAPABILITIES, `${APP_CAPABILITIES},${LOCKS_CAPABILITIES[0]},${LOCKS_CAPABILITIES[1]}`] as const)(
    'keeps bare-grant approval as the default for app capabilities %s',
    async (capabilities) => {
      const flow = await new Pubky().startGrantAuthFlow(capabilities, AuthFlowKind.signin(), {
        clientId: getAuthClientId(),
        relay: 'https://relay.example/inbox/',
      });
      try {
        const params = new URL(flow.authorizationUrl).searchParams;
        expect(params.get('caps')).toBe(validateCapabilities(capabilities));
        // An af parameter opts into signedApprovalV1, requiring upgraded signers.
        expect(params.has('af')).toBe(false);
      } finally {
        flow.free();
      }
    },
  );

  it.each(['local', 'delegated'] as const)('resumes a %s pending login saved by SDK 0.15', async (mode) => {
    // Generated offline with 0.15 saveLocal/saveDelegated, never authorized by a user.
    // The delegated fixture uses a synthetic key imported as non-extractable, like a browser record.
    const sdk = new Pubky();
    const fixture = grantAuth015[mode];
    let db: IDBDatabase | undefined;
    try {
      if (mode === 'delegated') {
        expect(await sdk.browserSessionStore.isAvailable()).toBe(true);
        db = await openSessionDatabase();
        await seedDelegatedFixtureKey(db);
      }
      const saved = JSON.stringify(fixture.saved);
      const resumed = mode === 'local' ? sdk.resumeGrantAuthFlow(saved) : await sdk.resumeDelegatedGrantAuthFlow(saved);
      try {
        const original = new URL(fixture.authorizationUrl);
        const restored = new URL(resumed.authorizationUrl);
        expect(restored.protocol).toBe(original.protocol);
        expect(restored.host).toBe(original.host);
        expect(restored.pathname).toBe(original.pathname);
        expect(Object.fromEntries(restored.searchParams)).toEqual(Object.fromEntries(original.searchParams));
        expect(restored.searchParams.get('caps')).toBe(validateCapabilities(grantAuth015.capabilities));
        expect(restored.searchParams.has('af')).toBe(false);
      } finally {
        resumed.free();
      }
    } finally {
      const openedDb = db;
      if (openedDb) {
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = openedDb.transaction('delegatedGrantKeys', 'readwrite');
            tx.objectStore('delegatedGrantKeys').delete(grantAuth015.delegated.key.keyId);
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(tx.error);
          });
        } finally {
          openedDb.close();
        }
      }
    }
  });

  it.each(['local', 'delegated'] as const)(
    'decodes a %s V1 session saved by SDK 0.15 and attempts bearer renewal',
    async (mode) => {
      // SDK 0.15 browserSessionStore.save emitted these records after an offline,
      // synthetic approval/exchange. This checks decoding and request construction,
      // not successful authentication against a live homeserver.
      const record = grantAuth015[mode].storedSession;
      vi.useFakeTimers({ toFake: ['Date'] });
      // Expire the saved bearer while keeping the grant valid, independent of today's date.
      vi.setSystemTime((record.sharedSession.response.session.token_expires_at + 1) * 1_000);
      const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const packet = routingPackets[new URL(request.url).pathname.slice(1)];
        if (!packet) throw new DOMException('Synthetic transport failure', 'NetworkError');
        const response = new Response(Buffer.from(packet, 'base64'));
        Object.defineProperty(response, 'url', { value: request.url });
        return response;
      });
      vi.stubGlobal('fetch', fetch);
      const sdk = new Pubky();
      expect(await sdk.browserSessionStore.isAvailable()).toBe(true);
      const db = await openSessionDatabase();
      try {
        if (mode === 'delegated') await seedDelegatedFixtureKey(db);
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('storedSessions', 'readwrite');
          tx.objectStore('storedSessions').put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
        await expect(sdk.browserSessionStore.restore(record.id)).rejects.toMatchObject({
          name: 'RequestError',
          message: 'Request failed: HTTP transport error: error sending request',
        });
        const requests = fetch.mock.calls.map(([input, init]) =>
          input instanceof Request ? input : new Request(input, init),
        );
        expect(
          requests.some(
            (request) => request.method === 'POST' && request.url === 'https://legacy-cookie.test/auth/grant/session',
          ),
        ).toBe(true);
      } finally {
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['storedSessions', 'delegatedGrantKeys'], 'readwrite');
            tx.objectStore('storedSessions').delete(record.id);
            if (mode === 'delegated') tx.objectStore('delegatedGrantKeys').delete(grantAuth015.delegated.key.keyId);
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      }
    },
  );
});
