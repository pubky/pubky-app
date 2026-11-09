import { readFileSync } from 'node:fs';
import { initSync, Locks, LocksOptions } from '@synonymdev/locks-sdk';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { getRuntimeConfig, resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { LocksService } from './locks';

// Same synthetic identity and signed PKARR packet as locks.region.contract.test.ts: the real SDK verifies
// the signature and resolves the Lock Server to legacy-cookie.test.
const SERVER = 'tkrq8zmwb8a3m9k15csu3q17qmfgqnp9dskbrg9uq1rydpyxp7qy';
const ROUTING_PACKET =
  'FSgcCvQf4IDHyAtpTkQvSSCN3RsLYv7QC1vNT3qOf9nhNFbL89xLKYGT7LAfAeBLX723CTWU1v5jzB2PCWZnDwAGZRcomIAAAACAAAAAAAEAAAAANHRrcnE4em13YjhhM205azE1Y3N1M3ExN3FtZmdxbnA5ZHNrYnJnOXVxMXJ5ZHB5eHA3cXkAAEEAAQAADhAAFgABDWxlZ2FjeS1jb29raWUEdGVzdAA=';
const RELAY = 'https://pkarr.test';
const RESOURCE_URL = 'https://legacy-cookie.test/creator/priv-resources/content/id-1';

const originalConfig = window.__PUBKY_CONFIG__;

beforeAll(() => {
  const sdkEntry = import.meta.resolve('@synonymdev/locks-sdk');
  initSync({ module: readFileSync(new URL('./locks_sdk_wasm_bg.wasm', sdkEntry)) });
  window.__PUBKY_CONFIG__ = { ...getRuntimeConfig(), lockServer: `pubky${SERVER}`, pkarrRelays: [RELAY] };
  resetRuntimeConfigForTests();
});

beforeEach(() => {
  // Vitest aliases window to its Node global, which fails wasm-bindgen's Window instanceof check.
  const BrowserWindow = Window;
  vi.stubGlobal(
    'Window',
    class extends BrowserWindow {
      static [Symbol.hasInstance](value: unknown) {
        return value === window || value instanceof BrowserWindow;
      }
    },
  );
  vi.spyOn(Logger, 'error').mockImplementation(() => {});
  const client = Locks.forServerWithOptions(`pubky${SERVER}`, new LocksOptions().addPkarrRelay(RELAY));
  useAuthStore.setState({ currentUserPubky: 'account' });
  useLocksAuthStore.setState(locksAuthInitialState);
  useLocksAuthStore
    .getState()
    .init({ session: client.restoreSession('secret-abc'), secret: 'secret-abc', creatorPubky: 'account' });
});

afterEach(() => {
  useLocksAuthStore.setState(locksAuthInitialState);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(() => {
  window.__PUBKY_CONFIG__ = originalConfig;
  resetRuntimeConfigForTests();
});

/** Only HTTP is replaced: the service, SDK/WASM, request building and PKARR validation run unchanged. */
function stubTransport(deleteStatus = 204) {
  const requests: { method: string; url: string }[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    let response: Response;
    if (url.origin === RELAY && url.pathname === `/${SERVER}`) {
      response = new Response(Buffer.from(ROUTING_PACKET, 'base64'));
    } else {
      requests.push({ method: request.method, url: request.url });
      response =
        request.method === 'PUT'
          ? new Response(
              JSON.stringify({
                creator: `pubky${SERVER}`,
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
    }
    return Object.defineProperty(response, 'url', { value: request.url });
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
