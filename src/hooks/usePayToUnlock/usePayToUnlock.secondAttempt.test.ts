import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LockFile } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { usePayToUnlock } from './usePayToUnlock';
import type { TPayToUnlockStage } from './usePayToUnlock.types';

// The whole reader path runs for real (hook, controller, application, pipes); only the two IO boundaries
// are faked: the reader's homeserver, which keeps what the first attempt saved, and the Lock Server.
const mocks = vi.hoisted(() => ({
  saved: [] as string[],
  generateBundleId: vi.fn(),
  submitProof: vi.fn(),
  lookupVerificationTask: vi.fn(),
  hasPaykitReceiver: vi.fn(),
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
    createWriteFence: () => ({ enter: () => {}, assertCurrent: () => {} }),
    putBlob: async ({ url }: { url: string }) => {
      mocks.saved.push(url);
    },
    getBytesIfExists: async () => null,
    listAll: async () => [...mocks.saved],
  },
}));
vi.mock('@/services/locks/locks', () => ({
  LocksService: {
    generateBundleId: mocks.generateBundleId,
    submitProof: mocks.submitProof,
    lookupVerificationTask: mocks.lookupVerificationTask,
    hasPaykitReceiver: mocks.hasPaykitReceiver,
    lookupPaykitConnectionState: vi.fn(async () => 'connected'),
  },
}));

const LOCK_URL = 'pubky://pubkybob/pub/app.locks/LOCK1.json';
const BUNDLE = 'A'.repeat(26);
const lockFile = asOpaque<LockFile>({
  creator: 'pubkybob',
  criteria: [
    { criterion_id: 'criterion-1', verifier_type: 'paykit-payment', params: { amount: '1000', asset: 'BTC' } },
  ],
});
const REFUSED = { regionBlocked: true } as const;

const renderOpening = () => {
  const stages: TPayToUnlockStage[] = [];
  const view = renderHook(
    (props: { open: boolean }) => {
      const result = usePayToUnlock({
        open: props.open,
        lockUrl: LOCK_URL,
        lockFile,
        onCompleted: vi.fn(),
        onPurchased: vi.fn(),
        onSessionExpired: vi.fn(),
      });
      stages.push(result.stage);
      return result;
    },
    { initialProps: { open: true } },
  );
  return { ...view, stages };
};

describe('usePayToUnlock, second attempt after a 451', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saved.length = 0;
    authState.currentUserPubky = 'reader1';
    authState.session = {};
    mocks.generateBundleId.mockResolvedValue(BUNDLE);
    mocks.hasPaykitReceiver.mockResolvedValue(true);
    mocks.submitProof.mockResolvedValue(REFUSED);
    mocks.lookupVerificationTask.mockResolvedValue(null);
  });

  // QA saw "This purchase could not be checked" on the second tap: the first attempt had saved a bundle id,
  // and the Lock Server refused the lookup of that saved id as it had refused the submission.
  it.each([
    ['refuses the lookup of the saved id as well', REFUSED],
    ['answers 404 to the lookup of the saved id, because it never received the submission', null],
  ])('shows the region notice both times when the Lock Server %s', async (_label, lookup) => {
    const first = renderOpening();
    await waitFor(() => expect(first.result.current.stage).toBe('region-blocked'));
    // The first attempt saved its bundle id before the Lock Server refused it.
    expect(mocks.saved).toEqual([`pubky://reader1/priv/social/purchases/LOCK1/${BUNDLE}.json`]);
    first.unmount();

    mocks.lookupVerificationTask.mockResolvedValue(lookup);
    const second = renderOpening();
    await waitFor(() => expect(second.result.current.stage).toBe('region-blocked'));

    expect(mocks.lookupVerificationTask).toHaveBeenCalledWith('pubkybob', BUNDLE);
    // The screen the reader must never meet on the second tap, nor any retry path.
    expect(second.stages).not.toContain('blocked');
    expect(second.stages).not.toContain('retry');
    expect(second.stages).not.toContain('install');
    expect(mocks.toast).not.toHaveBeenCalled();
    // Nothing was minted or written again: the one saved id stays for a supported region.
    expect(mocks.generateBundleId).toHaveBeenCalledTimes(1);
    expect(mocks.saved).toHaveLength(1);
  });

  it('does not submit again when the lookup of the saved id was refused', async () => {
    const first = renderOpening();
    await waitFor(() => expect(first.result.current.stage).toBe('region-blocked'));
    first.unmount();
    mocks.submitProof.mockClear();
    mocks.lookupVerificationTask.mockResolvedValue(REFUSED);

    const second = renderOpening();
    await waitFor(() => expect(second.result.current.stage).toBe('region-blocked'));

    expect(mocks.submitProof).not.toHaveBeenCalled();
  });

  it('pays normally on a later attempt from a supported region, with the saved id and no second id', async () => {
    const first = renderOpening();
    await waitFor(() => expect(first.result.current.stage).toBe('region-blocked'));
    first.unmount();

    mocks.lookupVerificationTask.mockResolvedValue(null);
    mocks.submitProof.mockResolvedValue({ status: 'pending' });
    const later = renderOpening();

    await waitFor(() => expect(later.result.current.stage).toBe('waiting'));
    expect(mocks.submitProof).toHaveBeenLastCalledWith(expect.objectContaining({ bundle_id: BUNDLE }));
    expect(mocks.generateBundleId).toHaveBeenCalledTimes(1);
    expect(later.stages).not.toContain('blocked');
  });

  // The "could not be checked" screen stays for what it was made for: a lookup that really failed.
  it('still shows "could not be checked" when the lookup of the saved id fails for another reason', async () => {
    mocks.saved.push(`pubky://reader1/priv/social/purchases/LOCK1/${BUNDLE}.json`);
    mocks.lookupVerificationTask.mockRejectedValue(new Error('Lock Server unreachable'));

    const view = renderOpening();

    await waitFor(() => expect(view.result.current.stage).toBe('blocked'));
    expect(mocks.submitProof).not.toHaveBeenCalled();
  });
});
