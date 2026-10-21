import { webcrypto } from 'node:crypto';
import { Keypair, Pubky, PublicKey } from '@synonymdev/pubky';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CAPABILITIES, getAuthClientId } from '@/config/auth';
import { getDefaultHttpRelay } from '@/config/network';
import { createTestWebLocks } from '@/test-utils/web-locks';
import { type GrantFlowRequest, GrantFlowService } from './grant-flow';

vi.mock('pubky-app-specs', () => ({
  default: vi.fn(),
  userUriBuilder: (key: string) => `pubky://${key}/pub/pubky.app/profile.json`,
}));

// Public signed routing fixtures: zero-seed user -> one-seed homeserver -> legacy-cookie.test.
// These are the same synthetic identities used in session-store.contract.test.ts, not live accounts.
const USER = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';
const HOMESERVER = 'tkrq8zmwb8a3m9k15csu3q17qmfgqnp9dskbrg9uq1rydpyxp7qy';
const routingPackets: Record<string, string> = {
  [USER]:
    'XTDocF4Xf6HpVOBIowal9ggCGKv383XHTY9OHqmQRvRPd+0uJDBTxrKwIUzoaERgl/4+DWme0M3YTe3XfM1wBAAGZRcomIAAAACAAAAAAAEAAAAABl9wdWJreTQ4cGlueHhncXM0MW40YWlkaWRlbnc1YXBxcDF1cmZtemR6dHI4anQ0YWJya2RuNDM1ZXdvAABBAAEAAA4QADgAADR0a3JxOHptd2I4YTNtOWsxNWNzdTNxMTdxbWZncW5wOWRza2JyZzl1cTFyeWRweXhwN3F5AA==',
  [HOMESERVER]:
    'FSgcCvQf4IDHyAtpTkQvSSCN3RsLYv7QC1vNT3qOf9nhNFbL89xLKYGT7LAfAeBLX723CTWU1v5jzB2PCWZnDwAGZRcomIAAAACAAAAAAAEAAAAANHRrcnE4em13YjhhM205azE1Y3N1M3ExN3FtZmdxbnA5ZHNrYnJnOXVxMXJ5ZHB5eHA3cXkAAEEAAQAADhAAFgABDWxlZ2FjeS1jb29raWUEdGVzdAA=',
};

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

type GrantClaims = { iss: string; cnf: string; client_id: string; caps: string[]; jti: string; exp: number };
const decodeClaims = (jws: string): GrantClaims => JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString());
const response = (url: string, body: BodyInit | null) =>
  Object.defineProperty(new Response(body, { headers: { 'Content-Type': 'application/json' } }), 'url', { value: url });

/** In-memory HTTP boundary; signing, encryption, SDK state, PKARR validation and PoP signing remain real. */
function createRelayFixture() {
  const queued = new Map<string, ArrayBuffer>();
  const waiting = new Map<string, (body: ArrayBuffer) => void>();
  const requests: { method: string; url: string; aborted: boolean }[] = [];
  const exchanges: { grant: string; pop: string }[] = [];
  const relay = `${getDefaultHttpRelay().replace(/\/+$/, '')}/`;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const entry = { method: request.method, url: request.url, aborted: false };
    requests.push(entry);
    if (request.url.startsWith(relay)) {
      if (request.method === 'POST') {
        const payload = await request.arrayBuffer();
        queued.set(request.url, payload);
        waiting.get(request.url)?.(payload);
        return response(request.url, null);
      }
      if (request.method === 'DELETE') {
        queued.delete(request.url);
        return response(request.url, null);
      }
      expect(request.method).toBe('GET');
      const payload = queued.get(request.url);
      if (payload) return response(request.url, payload);
      return new Promise<Response>((resolve, reject) => {
        const deliver = (body: ArrayBuffer) => {
          waiting.delete(request.url);
          resolve(response(request.url, body));
        };
        waiting.set(request.url, deliver);
        const abort = () => {
          entry.aborted = true;
          if (waiting.get(request.url) === deliver) waiting.delete(request.url);
          reject(new DOMException('Fixture page terminated its relay request', 'AbortError'));
        };
        if (request.signal.aborted) abort();
        else request.signal.addEventListener('abort', abort, { once: true });
      });
    }
    const packet = routingPackets[new URL(request.url).pathname.slice(1)];
    if (packet) return response(request.url, Buffer.from(packet, 'base64'));
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://legacy-cookie.test/auth/grant/session');
    const body: { grant: string; pop: string } = await request.json();
    exchanges.push(body);
    const grant = decodeClaims(body.grant);
    const [header, payload, signature] = body.pop.split('.');
    const publicKey = PublicKey.from(grant.cnf);
    try {
      const key = await crypto.subtle.importKey('raw', new Uint8Array(publicKey.toUint8Array()), 'Ed25519', false, [
        'verify',
      ]);
      // The restored SDK really used the original non-extractable PoP key, not just its serialized public key.
      expect(
        await crypto.subtle.verify(
          'Ed25519',
          key,
          Buffer.from(signature, 'base64url'),
          new TextEncoder().encode(`${header}.${payload}`),
        ),
      ).toBe(true);
      expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toMatchObject({
        aud: HOMESERVER,
        gid: grant.jti,
      });
    } finally {
      publicKey.free();
    }
    const now = Math.floor(Date.now() / 1_000);
    return response(
      request.url,
      JSON.stringify({
        token: 'synthetic-offline-bearer',
        session: {
          homeserver: HOMESERVER,
          pubky: grant.iss,
          client_id: grant.client_id,
          capabilities: grant.caps,
          grant_id: grant.jti,
          token_expires_at: now + 3_600,
          grant_expires_at: grant.exp,
          created_at: now,
        },
      }),
    );
  };
  return { fetch, requests, exchanges, queued };
}

let visibility: 'visible' | 'hidden';
const setVisibility = (next: 'visible' | 'hidden') => {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  visibility = 'visible';
  sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('isSecureContext', true);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createTestWebLocks(),
  });
});

afterEach(() => {
  GrantFlowService.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'locks');
});

describe('pending grant recovery after page storage is lost (real SDK)', () => {
  it('exchanges an uninterrupted approval using a real signer and a verified delegated PoP', async () => {
    const relay = createRelayFixture();
    vi.stubGlobal('fetch', relay.fetch);
    const sdk = new Pubky();
    const flow = await GrantFlowService.start(sdk, {
      purpose: 'signin',
      capabilities: APP_CAPABILITIES,
      generation: '',
      fresh: true,
    });
    const signer = sdk.signer(Keypair.fromSecret(new Uint8Array(32)));
    try {
      await signer.approveAuthRequest(flow.authorizationUrl);
      const session = await flow.awaitApproval;
      try {
        expect(session.info.publicKey.z32()).toBe(USER);
        expect(relay.exchanges).toHaveLength(1);
        flow.completeAuthFlow?.();
      } finally {
        session.free();
      }
    } finally {
      flow.cancelAuthFlow();
      signer.free();
    }
  });

  it('uses the same relay channel and delegated key to consume an approval queued while the page was gone', async () => {
    const relay = createRelayFixture();
    vi.stubGlobal('fetch', relay.fetch);
    const sdk = new Pubky();
    const request: GrantFlowRequest = { purpose: 'signin', capabilities: APP_CAPABILITIES, generation: '' };
    const original = await GrantFlowService.start(sdk, { ...request, fresh: true });
    // Recreating the page invalidates the first caller; observe its cancellation rather than leaking a rejection.
    const oldOutcome = original.awaitApproval.catch(() => null);
    let resumed: Awaited<ReturnType<typeof GrantFlowService.start>> | undefined;
    const signer = sdk.signer(Keypair.fromSecret(new Uint8Array(32)));
    try {
      const originalUrl = new URL(original.authorizationUrl);
      expect(originalUrl.searchParams.get('cpk')).toBeTruthy();
      expect(JSON.parse(sessionStorage.getItem('pubky-app-pending-grant-v1') ?? 'null').mode).toBe('delegated');
      await vi.waitFor(() => expect(relay.requests.filter(({ method }) => method === 'GET')).toHaveLength(1));
      const originalChannel = relay.requests[0].url;
      // Release the real SDK listener without executing the user-cancel cleanup, as on a hidden iOS page.
      setVisibility('hidden');
      await vi.waitFor(() => expect(relay.requests[0].aborted).toBe(true));
      sessionStorage.clear();
      expect(sessionStorage.length).toBe(0);

      // One real signer approval; it remains queued until the recreated App can find its original channel.
      await signer.approveAuthRequest(original.authorizationUrl);
      expect(relay.queued.has(originalChannel)).toBe(true);
      resumed = await GrantFlowService.start(new Pubky(), request);
      const outcome = resumed.awaitApproval;
      void outcome.catch(() => undefined);
      expect(resumed.authorizationUrl).toBe(original.authorizationUrl);
      setVisibility('visible');
      const session = await outcome;
      try {
        const info = await session.grant?.sessionInfo();
        expect(info?.clientId).toBe(getAuthClientId());
        expect(session.info.publicKey.z32()).toBe(USER);
        expect(relay.requests.filter(({ method }) => method === 'POST')).toHaveLength(2);
        expect(relay.requests.filter(({ method, url }) => method === 'GET' && url.includes('/inbox/'))).toEqual([
          expect.objectContaining({ url: originalChannel, aborted: true }),
          expect.objectContaining({ url: originalChannel }),
        ]);
        expect(relay.exchanges).toHaveLength(1);
        expect(decodeClaims(relay.exchanges[0].grant).cnf).toBe(originalUrl.searchParams.get('cpk'));
        expect(relay.queued.size).toBe(0);
        resumed.completeAuthFlow?.();
      } finally {
        session.free();
      }
    } finally {
      resumed?.cancelAuthFlow();
      original.cancelAuthFlow();
      setVisibility('visible');
      await oldOutcome;
      signer.free();
    }
  }, 10_000);
});
