import { Locks, LocksOptions, VerificationTaskHandleOptions } from '@synonymdev/locks-sdk';
import { Pulse } from '@synonymdev/pubky-pulse-web';
import { describe, expect, it } from 'vitest';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import * as sentry from '@/libs/observability/sentry';
import {
  LOCK_SERVER_ORIGIN,
  LOCK_SERVER_PUBKY,
  PKARR_RELAY,
  setupLocksContractHarness,
  stubLockServerFetch,
} from '@/test-utils/locks-contract';
import { LocksService } from './locks';
import type { TSubmittedProofBundle } from './locks.types';
import { isLockServerRegionBlocked } from './locks.utils';

const creator = LOCK_SERVER_PUBKY;
const lookupRoute = { method: 'POST', path: '/verification-task-lookups' };
const bundle: TSubmittedProofBundle = {
  version: 1,
  bundle_id: '000G40R40M30E209185GR38E1W',
  pubky_lock_resource: `${LOCK_SERVER_PUBKY}/pub/app.locks/000G40R40M30E209185GR38E1W8124GK2GAHC5RR34D1P70X3RFG.json`,
  proofs: [],
};

setupLocksContractHarness();

function stubTransport(
  status: number | 'network-failure',
  body = '{}',
  route = { method: 'POST', path: '/proof-bundles' },
) {
  const submissions: Request[] = [];
  stubLockServerFetch(async (request) => {
    expect(request.url).toBe(`${LOCK_SERVER_ORIGIN}${route.path}`);
    expect(request.method).toBe(route.method);
    if (route.path === '/proof-bundles') {
      expect(await request.clone().json()).toEqual({ submitted_proof_bundle: bundle });
    }
    submissions.push(request);
    if (status === 'network-failure') throw new TypeError('offline');
    return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
  });
  return submissions;
}

describe('pinned Locks SDK 0.1.0 region error contract', () => {
  it('exposes HTTP 451 as an InvalidInput Error with the exact viewer-request message', async () => {
    const submissions = stubTransport(451);
    const options = new LocksOptions().addPkarrRelay(PKARR_RELAY);
    const client = Locks.forServerWithOptions(LOCK_SERVER_PUBKY, options);
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
        creator: LOCK_SERVER_PUBKY,
        bundle_id: bundle.bundle_id,
        status: 'pending',
        submitted_at: '2026-06-01T12:00:00Z',
        started_at: null,
        completed_at: null,
        failure_message: null,
        terminal_reason: null,
      }),
    );
    await expect(LocksService.submitProof(bundle)).resolves.toEqual({ status: 'pending', readerNotPayable: false });
    expect(Logger.error).not.toHaveBeenCalled();
    expect(sentry.captureAppError).not.toHaveBeenCalled();
    expect(Pulse.captureException).not.toHaveBeenCalled();
  });
});

// The second tap on the same lock looks the saved bundle id up before it submits anything. The pinned SDK
// sends that lookup as its own POST, and a region refusal reaches it with the same error as the submission.
describe('pinned Locks SDK 0.1.0 region error contract for the saved bundle id lookup', () => {
  it('exposes HTTP 451 on the lookup as the same InvalidInput Error the submission raises', async () => {
    const lookups = stubTransport(451, '{}', lookupRoute);
    const options = new LocksOptions().addPkarrRelay(PKARR_RELAY);
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

// The modal's not-payable screen depends on `failure_message` reaching the service through the real SDK. The SDK accepts
// any non-empty wording, so this block cannot catch the Lock Server rewording it. Same body as a real staging response.
describe('pinned Locks SDK 0.1.0 failed task contract', () => {
  const COMPLETED_AT = '2026-10-08T09:52:51.22186Z';
  const OUTCOMES = [
    ['reader is not payable', true],
    ['paykit invoice admission failed', false],
  ] as const;
  const failedTask = (failureMessage: string) =>
    JSON.stringify({
      creator,
      bundle_id: bundle.bundle_id,
      status: 'failed',
      submitted_at: '2026-10-08T09:52:50.086318Z',
      started_at: COMPLETED_AT,
      completed_at: COMPLETED_AT,
      failure_message: failureMessage,
      status_message: null,
      admission_deadline_at: null,
      terminal_reason: null,
    });

  it.each(OUTCOMES)('reads %j from a task lookup', async (failureMessage, readerNotPayable) => {
    stubTransport(200, failedTask(failureMessage), lookupRoute);

    await expect(LocksService.lookupVerificationTask(creator, bundle.bundle_id)).resolves.toEqual({
      status: 'failed',
      walletSetupNeeded: false,
      readerNotPayable,
      admissionDeadlineAt: null,
      completedAt: COMPLETED_AT,
    });
    expect(Logger.error).not.toHaveBeenCalled();
  });

  it.each(OUTCOMES)('reads %j from a proof submission', async (failureMessage, readerNotPayable) => {
    stubTransport(200, failedTask(failureMessage));

    await expect(LocksService.submitProof(bundle)).resolves.toEqual({ status: 'failed', readerNotPayable });
    expect(Logger.error).not.toHaveBeenCalled();
  });
});
