import { readFileSync } from 'node:fs';
import { initSync } from '@synonymdev/locks-sdk';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '@/libs/error/error';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { shouldDropAppErrorFromSentry } from '@/libs/observability/sentry.utils';
import { GuardedContentParser } from '@/pipes/locks/locks.parser';
import type { TLocksPollReport } from '@/services/locks/locks.types';
import { MOCK_LOCK_AUTHOR_PUBKY, mockLockFile } from '@/test-utils/locks';
import { LocksController } from './locks';

// Controller, application and service run for real; only the Lock Server viewer and the reader's
// homeserver are faked, so each AppError below is the one production builds (and captures) (#2641).
const mocks = vi.hoisted(() => ({
  lookupVerificationTask: vi.fn(),
  lookupPaykitConnectionState: vi.fn(),
  issueAccessCredential: vi.fn(),
  listAll: vi.fn(),
}));

vi.mock('@/services/locks/locks.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/locks/locks.utils')>();
  return {
    ...actual,
    ensureLocksSdkReady: async () => {},
    initLockClient: () => ({
      viewer: {
        lookupVerificationTask: mocks.lookupVerificationTask,
        lookupPaykitConnectionState: mocks.lookupPaykitConnectionState,
        issueAccessCredential: mocks.issueAccessCredential,
      },
    }),
  };
});

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: { listAll: mocks.listAll, getBytesIfExists: async () => null },
}));

// A creator the real SDK accepts, so each call reaches the faked viewer rather than failing on input.
const lockFile = mockLockFile({ creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}` });
const BUNDLE = 'A'.repeat(26);
const LOCK_URL = `pubky://${lockFile.creator}/pub/app.locks/LOCK1.json`;
const outage = () => new Error('Lock Server viewer request failed with HTTP 503');
const paymentPoll = (suppress: boolean): TLocksPollReport => ({ callSite: 'payToUnlockPaymentPoll', suppress });
const connectionPoll = (suppress: boolean): TLocksPollReport => ({ callSite: 'payToUnlockConnectionPoll', suppress });

const outageCause = (error: AppError) => expect(String(error.cause)).toContain('HTTP 503');

const caught = async (pending: Promise<unknown>): Promise<AppError> => {
  const error = await pending.then(
    () => null,
    (e: unknown) => e,
  );
  if (!isAppError(error)) throw new Error(`expected an AppError, got ${String(error)}`);
  expect(error.service).toBe(ErrorService.Locks);
  return error;
};

describe('locks-unlock-poll-repeat-reports drop rule', () => {
  beforeAll(() => {
    const sdkEntry = import.meta.resolve('@synonymdev/locks-sdk');
    initSync({ module: readFileSync(new URL('./locks_sdk_wasm_bg.wasm', sdkEntry)) });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    mocks.lookupVerificationTask.mockRejectedValue(outage());
    mocks.lookupPaykitConnectionState.mockRejectedValue(outage());
    mocks.issueAccessCredential.mockRejectedValue(outage());
  });

  it('drops a repeat failure of the task poll', async () => {
    const error = await caught(LocksController.fetchPaymentStatus({ lockFile, bundleId: BUNDLE }, paymentPoll(true)));
    outageCause(error);
    expect(error.context).toMatchObject({ callSite: 'payToUnlockPaymentPoll', reportSuppressed: true });
    expect(shouldDropAppErrorFromSentry(error)).toBe(true);
  });

  it('drops a repeat failure of the link poll, including a response the schema rejects', async () => {
    const transport = await caught(
      LocksController.fetchPaykitConnectionState({ lockFile, bundleId: BUNDLE }, connectionPoll(true)),
    );
    outageCause(transport);
    expect(shouldDropAppErrorFromSentry(transport)).toBe(true);

    mocks.lookupPaykitConnectionState.mockResolvedValueOnce({ state: 'weird' });
    const invalid = await caught(
      LocksController.fetchPaykitConnectionState({ lockFile, bundleId: BUNDLE }, connectionPoll(true)),
    );
    expect(invalid.message).toBe('paykit connection state response is invalid');
    expect(invalid.context).toMatchObject({ callSite: 'payToUnlockConnectionPoll', reportSuppressed: true });
    expect(shouldDropAppErrorFromSentry(invalid)).toBe(true);
  });

  it('reports the first failure of a streak', async () => {
    const task = await caught(LocksController.fetchPaymentStatus({ lockFile, bundleId: BUNDLE }, paymentPoll(false)));
    const link = await caught(
      LocksController.fetchPaykitConnectionState({ lockFile, bundleId: BUNDLE }, connectionPoll(false)),
    );
    outageCause(task);
    outageCause(link);
    expect(task.context?.callSite).toBe('payToUnlockPaymentPoll');
    expect(task.context?.reportSuppressed).toBeUndefined();
    expect(shouldDropAppErrorFromSentry(task)).toBe(false);
    expect(shouldDropAppErrorFromSentry(link)).toBe(false);
  });

  it('reports the one-shot read when the modal opens, untagged', async () => {
    const error = await caught(LocksController.fetchPaymentStatus({ lockFile, bundleId: BUNDLE }));
    outageCause(error);
    expect(error.context?.callSite).toBeUndefined();
    expect(shouldDropAppErrorFromSentry(error)).toBe(false);
  });

  it('reports a failed lookup on the purchase-resume path', async () => {
    mocks.listAll.mockResolvedValue([GuardedContentParser.purchaseUrl('reader1', 'LOCK1', BUNDLE)]);
    const error = await caught(
      LocksController.fetchResolvedPurchase({ lockFile, lockUrl: LOCK_URL, readerPubky: 'reader1' }),
    );
    expect(mocks.lookupVerificationTask).toHaveBeenCalledTimes(1);
    outageCause(error);
    expect(error.operation).toBe('LocksService.lookupVerificationTask');
    expect(error.context?.callSite).toBeUndefined();
    expect(shouldDropAppErrorFromSentry(error)).toBe(false);
  });

  it('reports another Locks operation', async () => {
    const error = await caught(LocksController.fetchPaidContent({ lockFile, bundleId: BUNDLE }));
    expect(error.operation).toBe('LocksService.issueAccessCredential');
    outageCause(error);
    expect(error.context?.reportSuppressed).toBeUndefined();
    expect(shouldDropAppErrorFromSentry(error)).toBe(false);
  });
});
