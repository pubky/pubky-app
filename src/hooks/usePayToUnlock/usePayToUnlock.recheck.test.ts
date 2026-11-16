import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocksService } from '@/services/locks/locks';
import type { LockFile, TAccessCredential } from '@/services/locks/locks.types';
import { mockVerificationTask } from '@/test-utils/locks';
import { asOpaque } from '@/test-utils/type-assertions';
import { STALL_AFTER_MS, usePayToUnlock } from './usePayToUnlock';

// The reader path runs for real (hook, controller, application with its shared paid-content download,
// pipes); only the reader's homeserver and the Lock Server are faked, so the credential count is the
// Lock Server's own view of what Check again did.
const mocks = vi.hoisted(() => ({
  saved: [] as string[],
  lookupVerificationTask: vi.fn<typeof LocksService.lookupVerificationTask>(),
  issueAccessCredential: vi.fn(),
  proxyReadGuardedResource: vi.fn(),
  toast: vi.fn(),
}));

const authState = vi.hoisted(() => ({
  currentUserPubky: 'reader1' as string | null,
  session: {} as object | null,
  restoreStatus: 'ready',
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign((selector: (s: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (...args: unknown[]) => mocks.toast(...args) }));
vi.mock('@/services/local/locks/locks', () => ({ LocalLocksService: {} }));
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    getBytesIfExists: async () => null,
    listAll: async () => [...mocks.saved],
  },
}));
vi.mock('@/services/locks/locks', () => ({
  LocksService: {
    lookupVerificationTask: mocks.lookupVerificationTask,
    lookupPaykitConnectionState: vi.fn(async () => 'connected'),
    issueAccessCredential: mocks.issueAccessCredential,
    proxyReadGuardedResource: mocks.proxyReadGuardedResource,
  },
}));

const LOCK_URL = 'pubky://pubkybob/pub/app.locks/LOCK1.json';
const BUNDLE = 'B'.repeat(26);
const lockFile = asOpaque<LockFile>({
  creator: 'pubkybob',
  criteria: [
    { criterion_id: 'criterion-1', verifier_type: 'paykit-payment', params: { amount: '1000', asset: 'BTC' } },
  ],
  primary_resource: { path: '/priv/app.locks/content/a.json', hash: 'h', content_type: 'application/json', size: 1 },
  secondary_resources: {},
});

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe('usePayToUnlock, Check again on a download that never settles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.saved.length = 0;
    mocks.saved.push(`pubky://reader1/priv/social/purchases/LOCK1/${BUNDLE}.json`);
    mocks.lookupVerificationTask.mockResolvedValue(mockVerificationTask('completed'));
    mocks.proxyReadGuardedResource.mockResolvedValue(
      new TextEncoder().encode('{"content":"paid","kind":"short","attachments":null}'),
    );
  });
  afterEach(() => vi.useRealTimers());

  // With no Lock Server time limit yet (#3026), a hung credential would otherwise park the reader until a reload.
  it('mints a second credential and opens the content', async () => {
    mocks.issueAccessCredential
      .mockReturnValueOnce(new Promise<TAccessCredential>(() => {}))
      .mockResolvedValue({ credential: 'cred-2', expires_at: 'e' });
    const onCompleted = vi.fn();
    const { result } = renderHook(() =>
      usePayToUnlock({
        open: true,
        lockUrl: LOCK_URL,
        lockFile,
        onCompleted,
        onPurchased: vi.fn(),
        onSessionExpired: vi.fn(),
      }),
    );

    await advance(0);
    expect(result.current.stage).toBe('finishing');
    expect(mocks.issueAccessCredential).toHaveBeenCalledTimes(1);

    await advance(STALL_AFTER_MS);
    expect(result.current.stage).toBe('finishing');
    expect(result.current.isStalled).toBe(true);

    act(() => result.current.recheck());
    await advance(0);

    expect(mocks.issueAccessCredential).toHaveBeenCalledTimes(2);
    expect(mocks.proxyReadGuardedResource).toHaveBeenCalledWith('cred-2', 'a.json');
    expect(result.current.stage).toBe('paid');
    expect(result.current.isStalled).toBe(false);
    act(() => result.current.viewContent());
    expect(onCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ post: expect.objectContaining({ content: 'paid' }) }),
    );
  });
});
