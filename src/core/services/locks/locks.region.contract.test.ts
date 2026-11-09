import { readFileSync } from 'node:fs';
import { initSync, Locks, LocksOptions, VerificationTaskHandleOptions } from '@synonymdev/locks-sdk';
import { Pulse } from '@synonymdev/pubky-pulse-web';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import * as sentry from '@/libs/observability/sentry';
import { getRuntimeConfig, resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { LocksService } from './locks';
import type { TSubmittedProofBundle } from './locks.types';
import { isLockServerRegionBlocked } from './locks.utils';

// Synthetic one-seed identity and signed PKARR packet, also used by the Pubky session-store
// contract tests. The real SDK verifies the signature and resolves it to legacy-cookie.test.
const SERVER = 'tkrq8zmwb8a3m9k15csu3q17qmfgqnp9dskbrg9uq1rydpyxp7qy';
const ROUTING_PACKET =
  'FSgcCvQf4IDHyAtpTkQvSSCN3RsLYv7QC1vNT3qOf9nhNFbL89xLKYGT7LAfAeBLX723CTWU1v5jzB2PCWZnDwAGZRcomIAAAACAAAAAAAEAAAAANHRrcnE4em13YjhhM205azE1Y3N1M3ExN3FtZmdxbnA5ZHNrYnJnOXVxMXJ5ZHB5eHA3cXkAAEEAAQAADhAAFgABDWxlZ2FjeS1jb29raWUEdGVzdAA=';
const RELAY = 'https://pkarr.test';
const bundle: TSubmittedProofBundle = {
  version: 1,
  bundle_id: '000G40R40M30E209185GR38E1W',
  pubky_lock_resource: `pubky${SERVER}/pub/app.locks/000G40R40M30E209185GR38E1W8124GK2GAHC5RR34D1P70X3RFG.json`,
  proofs: [],
};

const originalConfig = window.__PUBKY_CONFIG__;

beforeAll(() => {
  // Load the installed web build from disk; its initialization and error conversion stay real.
  const sdkEntry = import.meta.resolve('@synonymdev/locks-sdk');
  initSync({ module: readFileSync(new URL('./locks_sdk_wasm_bg.wasm', sdkEntry)) });
  window.__PUBKY_CONFIG__ = { ...getRuntimeConfig(), lockServer: `pubky${SERVER}`, pkarrRelays: [RELAY] };
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

/** Only HTTP is replaced: the service, SDK/WASM, request building and PKARR validation run unchanged. */
function stubTransport(
  status: number | 'network-failure',
  body = '{}',
  route = { method: 'POST', path: '/proof-bundles' },
) {
  const submissions: Request[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    let response: Response;
    if (url.origin === RELAY && url.pathname === `/${SERVER}`) {
      expect(request.method).toBe('GET');
      response = new Response(Buffer.from(ROUTING_PACKET, 'base64'));
    } else {
      expect(request.url).toBe(`https://legacy-cookie.test${route.path}`);
      expect(request.method).toBe(route.method);
      if (route.path === '/proof-bundles') {
        expect(await request.clone().json()).toEqual({ submitted_proof_bundle: bundle });
      }
      submissions.push(request);
      if (status === 'network-failure') throw new TypeError('offline');
      response = new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
    }
    return Object.defineProperty(response, 'url', { value: request.url });
  });
  return submissions;
}

describe('pinned Locks SDK 0.1.0 region error contract', () => {
  it('exposes HTTP 451 as an InvalidInput Error with the exact viewer-request message', async () => {
    const submissions = stubTransport(451);
    const options = new LocksOptions().addPkarrRelay(RELAY);
    const client = Locks.forServerWithOptions(`pubky${SERVER}`, options);
    const viewer = client.viewer;
    try {
      const error: unknown = await viewer.submitProofBundle(bundle).catch((caught: unknown) => caught);
      expect(submissions).toHaveLength(1);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        name: 'InvalidInput',
        message: 'Lock Server viewer request failed with HTTP 451',
      });
      expect(error).not.toHaveProperty('status');
      expect(error).not.toHaveProperty('statusCode');
      expect(isLockServerRegionBlocked(error)).toBe(true);
    } finally {
      viewer.free();
      client.free();
      options.free();
    }
  });

  it('returns regionBlocked through the real service without logging, Sentry or Pulse capture', async () => {
    const submissions = stubTransport(451);
    await expect(LocksService.submitProof(bundle)).resolves.toEqual({ regionBlocked: true });
    expect(submissions).toHaveLength(1);
    expect(Logger.error).not.toHaveBeenCalled();
    expect(sentry.captureAppError).not.toHaveBeenCalled();
    expect(Pulse.captureException).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 500, 'network-failure'] as const)(
    'keeps %s failures on the reported AppError path',
    async (status) => {
      const submissions = stubTransport(status);
      const error: unknown = await LocksService.submitProof(bundle).catch((caught: unknown) => caught);
      expect(submissions).toHaveLength(1);
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({ service: ErrorService.Locks, operation: 'LocksService.submitProof' });
      expect(error).toHaveProperty('cause.name', 'InvalidInput');
      expect(error).toHaveProperty(
        'cause.message',
        status === 'network-failure'
          ? expect.stringContaining('Lock Server viewer request failed:')
          : `Lock Server viewer request failed with HTTP ${status}`,
      );
      expect(Logger.error).toHaveBeenCalledTimes(1);
      expect(sentry.captureAppError).toHaveBeenCalledExactlyOnceWith(error);
      expect(Pulse.captureException).toHaveBeenCalledExactlyOnceWith(error);
    },
  );

  it('reports invalid success JSON even when the response text contains HTTP 451', async () => {
    const submissions = stubTransport(200, 'HTTP 451');
    const error: unknown = await LocksService.submitProof(bundle).catch((caught: unknown) => caught);
    expect(submissions).toHaveLength(1);
    expect(isAppError(error)).toBe(true);
    expect(error).toHaveProperty('cause.name', 'InvalidInput');
    expect(error).toHaveProperty('cause.message', expect.stringContaining('failed to parse JSON response:'));
    expect(error).toHaveProperty('cause.message', expect.stringContaining('HTTP 451'));
    expect(Logger.error).toHaveBeenCalledTimes(1);
    expect(sentry.captureAppError).toHaveBeenCalledExactlyOnceWith(error);
    expect(Pulse.captureException).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('accepts a valid success response through the real SDK and service', async () => {
    stubTransport(
      200,
      JSON.stringify({
        creator: `pubky${SERVER}`,
        bundle_id: bundle.bundle_id,
        status: 'pending',
        submitted_at: '2026-06-01T12:00:00Z',
        started_at: null,
        completed_at: null,
        failure_message: null,
        terminal_reason: null,
      }),
    );
    await expect(LocksService.submitProof(bundle)).resolves.toEqual({ status: 'pending' });
    expect(Logger.error).not.toHaveBeenCalled();
    expect(sentry.captureAppError).not.toHaveBeenCalled();
    expect(Pulse.captureException).not.toHaveBeenCalled();
  });
});

// The second tap on the same lock looks the saved bundle id up before it submits anything. The pinned SDK
// sends that lookup as its own POST, and a region refusal reaches it with the same error as the submission.
describe('pinned Locks SDK 0.1.0 region error contract for the saved bundle id lookup', () => {
  const lookupRoute = { method: 'POST', path: '/verification-task-lookups' };
  const creator = `pubky${SERVER}`;

  it('exposes HTTP 451 on the lookup as the same InvalidInput Error the submission raises', async () => {
    const lookups = stubTransport(451, '{}', lookupRoute);
    const options = new LocksOptions().addPkarrRelay(RELAY);
    const client = Locks.forServerWithOptions(creator, options);
    const viewer = client.viewer;
    try {
      const error: unknown = await viewer
        .lookupVerificationTask(new VerificationTaskHandleOptions(creator, bundle.bundle_id))
        .catch((caught: unknown) => caught);
      expect(lookups).toHaveLength(1);
      expect(error).toMatchObject({ name: 'InvalidInput', message: 'Lock Server viewer request failed with HTTP 451' });
      expect(isLockServerRegionBlocked(error)).toBe(true);
    } finally {
      viewer.free();
      client.free();
      options.free();
    }
  });

  it('returns regionBlocked through the real service without logging, Sentry or Pulse capture', async () => {
    const lookups = stubTransport(451, '{}', lookupRoute);

    await expect(LocksService.lookupVerificationTask(creator, bundle.bundle_id)).resolves.toEqual({
      regionBlocked: true,
    });
    expect(lookups).toHaveLength(1);
    expect(Logger.error).not.toHaveBeenCalled();
    expect(sentry.captureAppError).not.toHaveBeenCalled();
    expect(Pulse.captureException).not.toHaveBeenCalled();
  });

  it('still reads a 404 as no task, and keeps other failures on the reported path', async () => {
    stubTransport(404, '{}', lookupRoute);
    await expect(LocksService.lookupVerificationTask(creator, bundle.bundle_id)).resolves.toBeNull();
    expect(Logger.error).not.toHaveBeenCalled();

    for (const status of [401, 403, 429, 500] as const) {
      stubTransport(status, '{}', lookupRoute);
      const error: unknown = await LocksService.lookupVerificationTask(creator, bundle.bundle_id).catch(
        (caught: unknown) => caught,
      );
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({ service: ErrorService.Locks, operation: 'LocksService.lookupVerificationTask' });
    }
    expect(sentry.captureAppError).toHaveBeenCalledTimes(4);
  });
});
