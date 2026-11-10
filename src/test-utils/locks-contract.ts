import { readFileSync } from 'node:fs';
import { initSync } from '@synonymdev/locks-sdk';
import { Pulse } from '@synonymdev/pubky-pulse-web';
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import * as sentry from '@/libs/observability/sentry';
import { getRuntimeConfig, resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';

/**
 * Synthetic one-seed Lock Server identity. The Pubky session-store and grant-flow contract tests sign
 * the same identity's packet into their own fixtures; keep them byte-identical.
 */
export const LOCK_SERVER = 'tkrq8zmwb8a3m9k15csu3q17qmfgqnp9dskbrg9uq1rydpyxp7qy';
export const LOCK_SERVER_PUBKY = `pubky${LOCK_SERVER}`;
export const PKARR_RELAY = 'https://pkarr.test';
/** Where the signed routing packet sends every Lock Server request. */
export const LOCK_SERVER_ORIGIN = 'https://legacy-cookie.test';

const ROUTING_PACKET =
  'FSgcCvQf4IDHyAtpTkQvSSCN3RsLYv7QC1vNT3qOf9nhNFbL89xLKYGT7LAfAeBLX723CTWU1v5jzB2PCWZnDwAGZRcomIAAAACAAAAAAAEAAAAANHRrcnE4em13YjhhM205azE1Y3N1M3ExN3FtZmdxbnA5ZHNrYnJnOXVxMXJ5ZHB5eHA3cXkAAEEAAQAADhAAFgABDWxlZ2FjeS1jb29raWUEdGVzdAA=';

/**
 * Registers the hooks every Locks SDK contract test needs: loads the installed WASM build from disk,
 * points the runtime config at the synthetic Lock Server, bridges `Window` for wasm-bindgen, spies on
 * Logger, Sentry and Pulse, and restores all of it. Call once at the top of the file, before the
 * file's own hooks.
 */
export function setupLocksContractHarness() {
  const originalConfig = window.__PUBKY_CONFIG__;

  beforeAll(() => {
    const sdkEntry = import.meta.resolve('@synonymdev/locks-sdk');
    initSync({ module: readFileSync(new URL('./locks_sdk_wasm_bg.wasm', sdkEntry)) });
    window.__PUBKY_CONFIG__ = { ...getRuntimeConfig(), lockServer: LOCK_SERVER_PUBKY, pkarrRelays: [PKARR_RELAY] };
    resetRuntimeConfigForTests();
  });

  beforeEach(() => {
    // Vitest aliases window to its Node global, which fails wasm-bindgen's Window instanceof check.
    // Bridge that environment identity only; SDK request construction and response/error handling stay real.
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
    vi.spyOn(sentry, 'captureAppError');
    vi.spyOn(Pulse, 'captureException');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    window.__PUBKY_CONFIG__ = originalConfig;
    resetRuntimeConfigForTests();
  });
}

/**
 * Replaces only HTTP: the PKARR relay gets the signed routing packet, and every other request goes to
 * `answer`, which may throw to simulate a network failure. The service, SDK/WASM, request building and
 * PKARR validation run unchanged.
 */
export function stubLockServerFetch(answer: (request: Request) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    let response: Response;
    if (url.origin === PKARR_RELAY && url.pathname === `/${LOCK_SERVER}`) {
      expect(request.method).toBe('GET');
      response = new Response(Buffer.from(ROUTING_PACKET, 'base64'));
    } else {
      response = await answer(request);
    }
    return Object.defineProperty(response, 'url', { value: request.url });
  });
}
