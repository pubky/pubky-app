import { Locks, LocksOptions } from '@synonymdev/locks-sdk';
import { Pulse } from '@synonymdev/pubky-pulse-web';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthErrorCode, ServerErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { isAppError, requiresLogin } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import * as sentry from '@/libs/observability/sentry';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import {
  LOCK_SERVER,
  LOCK_SERVER_ORIGIN,
  LOCK_SERVER_PUBKY,
  PKARR_RELAY,
  READER,
  setupLocksContractHarness,
  stubLockServerFetch,
} from '@/test-utils/locks-contract';
import { LocksService } from './locks';
import type { TGuardedResource, TSubmittedProofBundle } from './locks.types';

const CREATOR = LOCK_SERVER_PUBKY;
const BUNDLE_ID = '000G40R40M30E209185GR38E1W';
const LOCK_ID = '000G40R40M30E209185GR38E1W8124GK2GAHC5RR34D1P70X3RFG';
const bundle: TSubmittedProofBundle = {
  version: 1,
  bundle_id: BUNDLE_ID,
  pubky_lock_resource: `${CREATOR}/pub/app.locks/${LOCK_ID}.json`,
  proofs: [],
};
const guardedResource: TGuardedResource = {
  path: '/priv/app.locks/content/post-1',
  hash: LOCK_ID,
  content_type: 'application/json',
  size: 3,
};

type TReply = { status: number; body?: string } | 'network-failure';

/** The Lock Server's error envelope (`locks-server/src/api/errors.rs`). */
const envelope = (code: string) => JSON.stringify({ error: { code, message: code.replaceAll('_', ' ') } });

setupLocksContractHarness();

afterEach(() => {
  useLocksAuthStore.setState(locksAuthInitialState);
});

function stubLockServer(reply: TReply) {
  const requests: { method: string; path: string; authorization: string | null }[] = [];
  stubLockServerFetch((request) => {
    const url = new URL(request.url);
    expect(url.origin).toBe(LOCK_SERVER_ORIGIN);
    requests.push({
      method: request.method,
      path: `${url.pathname}${url.search}`,
      authorization: request.headers.get('authorization'),
    });
    if (reply === 'network-failure') throw new TypeError('offline');
    return new Response(reply.body ?? '{}', {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return requests;
}

/** A creator session restored from a bearer secret, exactly as a reload restores it. */
function signInCreator() {
  const options = new LocksOptions().addPkarrRelay(PKARR_RELAY);
  const session = Locks.forServerWithOptions(CREATOR, options).restoreSession('creator-bearer-secret');
  useAuthStore.setState({ currentUserPubky: LOCK_SERVER });
  useLocksAuthStore.getState().init({ session, secret: 'creator-bearer-secret', creatorPubky: LOCK_SERVER });
}

/** What the call rejected with; undefined when it resolved. */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

/** Every failure is one reported AppError: logged, sent to Sentry and to Pulse exactly once. */
function expectReportedOnce(error: unknown) {
  expect(isAppError(error)).toBe(true);
  expect(Logger.error).toHaveBeenCalledTimes(1);
  expect(sentry.captureAppError).toHaveBeenCalledExactlyOnceWith(error);
  expect(Pulse.captureException).toHaveBeenCalledExactlyOnceWith(error);
}

function expectNothingReported() {
  expect(Logger.error).not.toHaveBeenCalled();
  expect(sentry.captureAppError).not.toHaveBeenCalled();
  expect(Pulse.captureException).not.toHaveBeenCalled();
}

const viewerCalls = {
  submitProof: { route: 'POST /proof-bundles', call: () => LocksService.submitProof(bundle) },
  lookupVerificationTask: {
    route: 'POST /verification-task-lookups',
    call: () => LocksService.lookupVerificationTask(CREATOR, BUNDLE_ID),
  },
  lookupPaykitConnectionState: {
    route: 'POST /paykit-connection-state-lookups',
    call: () => LocksService.lookupPaykitConnectionState(CREATOR, BUNDLE_ID),
  },
  issueAccessCredential: {
    route: 'POST /access-credentials',
    call: () => LocksService.issueAccessCredential(CREATOR, BUNDLE_ID),
  },
  proxyReadGuardedResource: {
    route: 'GET /priv-resources/content/post-1',
    call: () => LocksService.proxyReadGuardedResource('reader-credential', 'post-1'),
  },
} as const;

describe('Lock Server viewer errors through the pinned SDK and LocksService', () => {
  // Statuses and codes each viewer endpoint documents (locks-server docs/API.md), apart from the
  // 451 region refusal and the lookup 404, which have their own results.
  it.each([
    ['submitProof', 400, 'invalid_request'],
    ['submitProof', 409, 'task_state_conflict'],
    ['submitProof', 422, 'unsupported_verifier_type'],
    ['submitProof', 422, 'paykit_not_configured'],
    ['submitProof', 429, 'rate_limited'],
    ['submitProof', 503, 'creator_authority_unavailable'],
    ['lookupVerificationTask', 400, 'invalid_identifier'],
    ['lookupVerificationTask', 429, 'rate_limited'],
    ['lookupVerificationTask', 500, 'internal_error'],
    ['lookupPaykitConnectionState', 400, 'invalid_identifier'],
    ['lookupPaykitConnectionState', 404, 'verification_task_not_found'],
    ['lookupPaykitConnectionState', 422, 'not_paykit_payment'],
    ['lookupPaykitConnectionState', 429, 'rate_limited'],
    ['lookupPaykitConnectionState', 502, 'paykit_connection_state_unavailable'],
    ['lookupPaykitConnectionState', 504, 'paykit_connection_state_timeout'],
    ['issueAccessCredential', 400, 'invalid_identifier'],
    ['issueAccessCredential', 403, 'entitlement_not_authorized'],
    ['issueAccessCredential', 404, 'verification_task_not_found'],
    ['proxyReadGuardedResource', 401, 'invalid_access_credential'],
    ['proxyReadGuardedResource', 401, 'expired_access_credential'],
    ['proxyReadGuardedResource', 403, 'entitlement_not_authorized'],
    ['proxyReadGuardedResource', 404, 'guarded_resource_not_found'],
  ] as const)('%s HTTP %i %s is one reported server error, never a sign-in prompt', async (name, status, code) => {
    const requests = stubLockServer({ status, body: envelope(code) });

    const error = await rejection(viewerCalls[name].call());

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([viewerCalls[name].route]);
    expect(error).toMatchObject({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      service: ErrorService.Locks,
      operation: `LocksService.${name}`,
      cause: { name: 'InvalidInput', message: `Lock Server viewer request failed with HTTP ${status}` },
    });
    expect(isAppError(error) && requiresLogin(error)).toBe(false);
    expect(error).not.toHaveProperty('message', expect.stringContaining(code));
    expectReportedOnce(error);
  });

  it.each(Object.keys(viewerCalls) as (keyof typeof viewerCalls)[])(
    '%s rejects an unreachable Lock Server as one reported server error',
    async (name) => {
      stubLockServer('network-failure');

      const error = await rejection(viewerCalls[name].call());

      expect(error).toMatchObject({
        category: ErrorCategory.Server,
        operation: `LocksService.${name}`,
        cause: { name: 'InvalidInput', message: expect.stringContaining('Lock Server viewer request failed:') },
      });
      expectReportedOnce(error);
    },
  );

  it.each([
    ['submitProof', JSON.stringify({ status: 'refunded' })],
    ['lookupVerificationTask', JSON.stringify({ status: 'refunded' })],
    ['lookupPaykitConnectionState', JSON.stringify({ state: 'paired' })],
    ['issueAccessCredential', JSON.stringify({ token: 'no-credential-field' })],
    ['submitProof', 'not json'],
  ] as const)('%s rejects a malformed 200 body %s as one reported error', async (name, body) => {
    stubLockServer({ status: 200, body });

    const error = await rejection(viewerCalls[name].call());

    expect(error).toMatchObject({ service: ErrorService.Locks, operation: `LocksService.${name}` });
    expectReportedOnce(error);
  });

  // The price is fixed by the Paykit payment request the Lock Server creates, so a refused, canceled or
  // late payment never reaches the app as an HTTP error: the task ends `failed` or `expired` instead.
  it('returns a failed task as a status, without the server failure text', async () => {
    stubLockServer({
      status: 200,
      body: JSON.stringify({
        ...taskBody('failed'),
        failure_message: 'paykit verifier rejected payment evidence for pubkyreader',
      }),
    });

    const lookup = await LocksService.lookupVerificationTask(CREATOR, BUNDLE_ID);

    expect(lookup).toEqual({
      status: 'failed',
      walletSetupNeeded: false,
      readerNotPayable: false,
      admissionDeadlineAt: null,
      completedAt: '2026-06-01T12:00:02Z',
    });
    expectNothingReported();
  });

  it.each([
    'payment_request_rejected',
    'payment_request_canceled',
    'proposal_expired',
    'payment_deadline_expired',
    'content_lock_deleted',
  ])('returns an expired task (%s) as a status, not an error', async (terminalReason) => {
    stubLockServer({ status: 200, body: JSON.stringify({ ...taskBody('expired'), terminal_reason: terminalReason }) });

    await expect(LocksService.lookupVerificationTask(CREATOR, BUNDLE_ID)).resolves.toMatchObject({
      status: 'expired',
    });
    expectNothingReported();
  });

  it.each(['blocked', 'recovery_required'] as const)(
    'returns a %s Paykit connection as a state, not an error',
    async (state) => {
      stubLockServer({ status: 200, body: JSON.stringify({ state }) });

      await expect(LocksService.lookupPaykitConnectionState(CREATOR, BUNDLE_ID)).resolves.toBe(state);
      expectNothingReported();
    },
  );
});

describe('Lock Server creator errors through the pinned SDK and LocksService', () => {
  const creatorCalls = {
    lookupPaykitSetupStatus: {
      route: 'GET /creator/paykit/setup-status?asset=BTC',
      call: () => LocksService.lookupPaykitSetupStatus('BTC'),
    },
    registerGuardedResource: {
      route: 'PUT /creator/priv-resources/content/post-1',
      call: () =>
        LocksService.registerGuardedResource({
          path: 'post-1',
          contentType: 'application/json',
          bytes: new Uint8Array([1, 2, 3]),
        }),
    },
    createContentLock: {
      route: 'POST /creator/content-locks',
      call: () =>
        LocksService.createContentLock({
          primaryResource: guardedResource,
          criteria: [
            {
              criterion_id: 'criterion-1',
              verifier_type: 'paykit-payment',
              params: { recipient_pubky: CREATOR, amount: '1000', asset: 'BTC', payment_in: 24 },
            },
          ],
          lockLogic: { type: 'all', criteria: ['criterion-1'] },
          accessPolicy: { requested_credential_ttl_seconds: 3600 },
        }),
    },
    setLockServiceConfig: {
      route: 'POST /creator/lock-service-config',
      call: () => LocksService.setLockServiceConfig(),
    },
    deleteContentLock: {
      route: `DELETE /creator/content-locks/${LOCK_ID}`,
      call: () => LocksService.deleteContentLock(LOCK_ID),
    },
    signout: { route: 'DELETE /frontend-sessions/current', call: () => LocksService.signout() },
  } as const;
  type TCreatorCall = keyof typeof creatorCalls;
  const names = Object.keys(creatorCalls) as TCreatorCall[];

  beforeEach(signInCreator);

  it.each(names)('%s turns a rejected session (HTTP 401) into an expired-session auth error', async (name) => {
    const requests = stubLockServer({ status: 401, body: envelope('frontend_session_expired') });

    const error = await rejection(creatorCalls[name].call());

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([creatorCalls[name].route]);
    expect(requests[0]?.authorization).toBe('Bearer creator-bearer-secret');
    expect(error).toMatchObject({
      category: ErrorCategory.Auth,
      code: AuthErrorCode.SESSION_EXPIRED,
      operation: `LocksService.${name}`,
      cause: { name: 'InvalidInput', message: 'Lock Server request failed with HTTP 401' },
    });
    expect(isAppError(error) && requiresLogin(error)).toBe(true);
    expectReportedOnce(error);
  });

  it.each([
    ['registerGuardedResource', 400, 'invalid_request'],
    ['registerGuardedResource', 413, 'payload_too_large'],
    ['registerGuardedResource', 503, 'creator_authority_unavailable'],
    ['createContentLock', 400, 'invalid_request'],
    ['createContentLock', 404, 'guarded_resource_not_found'],
    ['createContentLock', 503, 'creator_authority_unavailable'],
    ['setLockServiceConfig', 400, 'invalid_request'],
    ['setLockServiceConfig', 503, 'creator_authority_unavailable'],
    ['deleteContentLock', 404, 'content_lock_not_found'],
    ['lookupPaykitSetupStatus', 500, 'internal_error'],
  ] as const)('%s HTTP %i %s stays a reported server error with the session kept', async (name, status, code) => {
    stubLockServer({ status, body: envelope(code) });

    const error = await rejection(creatorCalls[name].call());

    expect(error).toMatchObject({
      category: ErrorCategory.Server,
      operation: `LocksService.${name}`,
      cause: { name: 'InvalidInput', message: `Lock Server request failed with HTTP ${status}` },
    });
    expect(isAppError(error) && requiresLogin(error)).toBe(false);
    expectReportedOnce(error);
  });

  it.each(names)('%s rejects an unreachable Lock Server as a server error, not an expired session', async (name) => {
    stubLockServer('network-failure');

    const error = await rejection(creatorCalls[name].call());

    expect(error).toMatchObject({
      category: ErrorCategory.Server,
      cause: { name: 'InvalidInput', message: expect.stringContaining('Lock Server request failed:') },
    });
    expectReportedOnce(error);
  });

  it.each(names)('%s refuses to send anything without a session for the signed-in account', async (name) => {
    useAuthStore.setState({ currentUserPubky: 'someone-else' });
    const requests = stubLockServer({ status: 200 });

    const error = await rejection(creatorCalls[name].call());

    expect(requests).toEqual([]);
    expect(error).toMatchObject({ category: ErrorCategory.Auth, code: AuthErrorCode.UNAUTHORIZED });
    expect(isAppError(error) && requiresLogin(error)).toBe(true);
  });

  it('returns a masked Paykit failure (setup status unavailable) as a status, not an error', async () => {
    stubLockServer({ status: 200, body: JSON.stringify({ status: 'unavailable' }) });

    await expect(LocksService.lookupPaykitSetupStatus('BTC')).resolves.toBe('unavailable');
    expectNothingReported();
  });

  // SDK 0.1.0 validates the setup-status enum itself, so its InvalidInput reaches toLocksError before our
  // schema runs. The schema's Validation INVALID_INPUT fallback is covered with a mocked SDK in locks.test.ts.
  it('rejects an unknown setup status in the SDK as one reported server error, not a sign-in prompt', async () => {
    stubLockServer({ status: 200, body: JSON.stringify({ status: 'pending_review' }) });

    const error = await rejection(LocksService.lookupPaykitSetupStatus('BTC'));

    expect(error).toMatchObject({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      operation: 'LocksService.lookupPaykitSetupStatus',
      cause: { name: 'InvalidInput', message: expect.stringContaining('invalid paykit setup status response') },
    });
    expect(isAppError(error) && requiresLogin(error)).toBe(false);
    expectReportedOnce(error);
  });
});

describe('Lock Server code-exchange errors through the pinned SDK and LocksService', () => {
  it.each([
    [400, 'frontend_session_state_mismatch'],
    [404, 'frontend_session_code_unavailable'],
    [410, 'frontend_session_code_expired'],
    [410, 'frontend_session_code_already_consumed'],
  ] as const)('HTTP %i %s is one reported server error, not an expired session', async (status, code) => {
    const requests = stubLockServer({ status, body: envelope(code) });

    const error = await rejection(LocksService.exchangeSessionCode({ code: 'one-time-code', state: 'state-1' }));

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual(['POST /frontend-sessions']);
    expect(error).toMatchObject({
      category: ErrorCategory.Server,
      operation: 'LocksService.exchangeSessionCode',
      cause: { name: 'InvalidInput', message: `frontend session exchange failed with HTTP ${status}` },
    });
    expect(isAppError(error) && requiresLogin(error)).toBe(false);
    expectReportedOnce(error);
  });

  // The creator approved and came back with the one-time code, but the exchange got no answer.
  it('rejects an unreachable Lock Server as one reported server error, not an expired session', async () => {
    const requests = stubLockServer('network-failure');

    const error = await rejection(LocksService.exchangeSessionCode({ code: 'one-time-code', state: 'state-1' }));

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual(['POST /frontend-sessions']);
    expect(error).toMatchObject({
      category: ErrorCategory.Server,
      code: ServerErrorCode.UNKNOWN_ERROR,
      operation: 'LocksService.exchangeSessionCode',
      cause: { name: 'InvalidInput', message: expect.stringContaining('frontend session exchange failed:') },
    });
    expect(isAppError(error) && requiresLogin(error)).toBe(false);
    expectReportedOnce(error);
  });
});

// Before Pay, the SDK lists the reader's /pub/paykit/v0/ on the reader's own homeserver (READER resolves to
// LOCK_SERVER_ORIGIN). usePayToUnlock turns a rejection into the "could not be started" toast or the
// blocked stage; it only signs the reader out for an error that requires login.
describe("Reader Paykit presence reads from the reader's homeserver through the pinned SDK and LocksService", () => {
  const PAYKIT_LISTING = 'GET /pub/paykit/v0/?shallow&limit=1';

  it.each([
    ['a Paykit entry', { status: 200, body: `pubky://${READER}/pub/paykit/v0/receiver\n` }, true],
    ['an empty listing', { status: 200, body: '' }, false],
    ['no Paykit directory (HTTP 404)', { status: 404, body: '' }, false],
  ] as const)('reads %s as %s, not an error', async (_name, reply, expected) => {
    const requests = stubLockServer(reply);

    await expect(LocksService.hasPaykitReceiver(READER)).resolves.toBe(expected);
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toContain(PAYKIT_LISTING);
    expectNothingReported();
  });

  it.each([
    ['HTTP 500', { status: 500, body: '' }],
    ['HTTP 503', { status: 503, body: '' }],
    ['network failure', 'network-failure'],
  ] as const)(
    'rejects a failed read (%s) as one reported server error, never a sign-in prompt',
    async (_name, reply) => {
      const requests = stubLockServer(reply);

      const error = await rejection(LocksService.hasPaykitReceiver(READER));

      expect(requests.map(({ method, path }) => `${method} ${path}`)).toContain(PAYKIT_LISTING);
      expect(error).toMatchObject({
        category: ErrorCategory.Server,
        code: ServerErrorCode.UNKNOWN_ERROR,
        service: ErrorService.Locks,
        operation: 'LocksService.hasPaykitReceiver',
        cause: { name: 'PaykitDataLookupFailed', message: 'Paykit data lookup failed' },
      });
      expect(isAppError(error) && requiresLogin(error)).toBe(false);
      expectReportedOnce(error);
    },
  );
});

/** A settled task, in the lifecycle field combination the SDK accepts for `failed` and `expired`. */
function taskBody(status: 'failed' | 'expired') {
  return {
    creator: CREATOR,
    bundle_id: BUNDLE_ID,
    status,
    submitted_at: '2026-06-01T12:00:00Z',
    started_at: '2026-06-01T12:00:01Z',
    completed_at: '2026-06-01T12:00:02Z',
    failure_message: null,
    terminal_reason: null,
  };
}
