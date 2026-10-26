import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import type { PaidUnlockAvailability } from '@/libs/region/paidUnlockAvailability';
import { LockContentParser, LockFileParser } from '@/pipes/locks/locks.parser';
import type { LockFile, TUnlockedContent, TVerificationStatus } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LockedPostContent } from './LockedPostContent';

// Exercise the real listing, recovery and payment hooks together. Only remote/storage boundaries
// and unrelated post rendering are replaced; bundle-id and teaser/price parsing stay real.
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getLockContent: (content: string) => LockContentParser.parse(content),
    fetchPurchasedLockIds: vi.fn(),
    fetchResolvedPurchase: vi.fn(),
    fetchPaidContent: vi.fn(),
    fetchPaymentStatus: vi.fn(),
    fetchPaykitConnectionState: vi.fn(),
    hasPaykitReceiver: vi.fn(),
    startPayment: vi.fn(),
  },
}));
const authState = vi.hoisted(() => ({ currentUserPubky: 'reader1', session: {}, restoreStatus: 'ready' }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));
const availability = vi.hoisted(() => ({ value: { status: 'blocked', cause: 'region' } as PaidUnlockAvailability }));
vi.mock('@/hooks/usePaidUnlockAvailability/usePaidUnlockAvailability', () => ({
  usePaidUnlockAvailability: () => availability.value,
}));
vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({ useSessionNeedsUpgrade: () => false }));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ isAuthenticated: true, waitForAuth: async () => true }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));
vi.mock('@/hooks/useLockFile/useLockFile', () => ({
  useLockFile: () => ({ lockFile, price: LockFileParser.resolvePrice(lockFile), isLoading: false }),
}));
const applyUnlockedContent = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useUnlockedContent/useUnlockedContent', () => ({
  useUnlockedContent: () => ({
    unlockedPost: null,
    applyUnlockedContent,
    media: [],
    pendingAttachments: [],
    hasCompleteContent: false,
    isOwnLock: false,
    isResolvingOwn: false,
    isResolvingReplica: false,
  }),
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));
vi.mock('../PostBody/PostBody', () => ({ PostBody: ({ content }: { content: string }) => <p>{content}</p> }));
vi.mock('../PostArticle/PostArticle', () => ({ PostArticle: () => null }));
vi.mock('@/molecules/DialogPayToUnlock/DialogPayToUnlock', () => ({
  DialogPayToUnlock: ({ open, stage, onRetry }: { open: boolean; stage: string; onRetry: () => void }) =>
    open ? (
      <div data-testid="pay-dialog">
        {stage}
        <button onClick={onRetry}>Retry</button>
      </div>
    ) : null,
}));

const lockFile = asOpaque<LockFile>({
  creator: 'creator',
  criteria: [{ criterion_id: 'criterion', verifier_type: 'paykit-payment', params: { amount: '1000', asset: 'BTC' } }],
});
const lockUrl = 'pubky://creator/pub/app.locks/lock1.json';
const content = asOpaque<TUnlockedContent>({
  post: { content: 'paid', kind: 'short', attachments: null },
  attachments: [],
});
type Resolved = Awaited<ReturnType<typeof LocksController.fetchResolvedPurchase>>;
const task = (status: TVerificationStatus) => ({ status, walletSetupNeeded: false, admissionDeadlineAt: null });
const reusable = (status: TVerificationStatus | null): Resolved => ({
  kind: 'reusable',
  bundleId: 'saved-bundle',
  task: status ? task(status) : null,
});
const newPaymentCases: Resolved[] = [
  null,
  reusable(null),
  { kind: 'terminal', bundleId: 'saved-bundle', status: 'failed' },
  { kind: 'terminal', bundleId: 'saved-bundle', status: 'expired' },
];
const renderCard = () =>
  render(
    <LockedPostContent
      content={JSON.stringify({ lock_title: 'Secret', teaser_description: 'Teaser' })}
      lock={lockUrl}
      postId="creator:post1"
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  authState.currentUserPubky = `reader-${Math.random()}`;
  authState.session = {};
  availability.value = { status: 'blocked', cause: 'region' };
  vi.mocked(LocksController.fetchPurchasedLockIds).mockResolvedValue(['lock1']);
  vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('pending'));
  vi.mocked(LocksController.fetchPaidContent).mockResolvedValue(content);
  vi.mocked(LocksController.fetchPaykitConnectionState).mockResolvedValue('connected');
  vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('pending'));
  vi.mocked(LocksController.hasPaykitReceiver).mockResolvedValue(true);
  vi.mocked(LocksController.startPayment).mockResolvedValue({ bundleId: 'fresh-bundle', status: 'pending' });
});

describe('purchase-aware region gate', () => {
  it.each(newPaymentCases)('holds saved purchase history that needs a new payment: %j', async (purchase) => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(purchase);
    renderCard();
    await screen.findByTestId('locks-region-notice');
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(1);
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  it.each(['pending', 'in_progress'] as const)('keeps an actual %s task recoverable', async (status) => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable(status));
    renderCard();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.getByTestId('pay-dialog')).toHaveTextContent('waiting'));
    expect(LocksController.fetchPaykitConnectionState).toHaveBeenCalledWith({ lockFile, bundleId: 'saved-bundle' });
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  it('recovers completed content with one task resolution and the saved bundle', async () => {
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('completed'));
    renderCard();
    await waitFor(() => expect(applyUnlockedContent).toHaveBeenCalledWith(content));
    expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(1);
    expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({ lockFile, bundleId: 'saved-bundle' });
    expect(LocksController.startPayment).not.toHaveBeenCalled();
  });

  it.each(['pending', 'completed'] as const)(
    'recovers a %s purchase after the shared listing fails',
    async (status) => {
      vi.mocked(LocksController.fetchPurchasedLockIds).mockRejectedValue(new Error('listing unavailable'));
      vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable(status));
      renderCard();
      await screen.findByTestId('locks-region-notice');
      expect(LocksController.fetchResolvedPurchase).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await waitFor(() =>
        expect(screen.getByTestId('pay-dialog')).toHaveTextContent(status === 'completed' ? 'paid' : 'waiting'),
      );
      expect(LocksController.fetchResolvedPurchase).toHaveBeenCalledTimes(1);
      expect(LocksController.startPayment).not.toHaveBeenCalled();
      if (status === 'completed')
        expect(LocksController.fetchPaidContent).toHaveBeenCalledWith({ lockFile, bundleId: 'saved-bundle' });
    },
  );

  it.each(newPaymentCases)('never submits or retries a new payment after listing failure: %j', async (purchase) => {
    vi.mocked(LocksController.fetchPurchasedLockIds).mockRejectedValue(new Error('listing unavailable'));
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(purchase);
    renderCard();
    await screen.findByTestId('locks-region-notice');
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(screen.getByTestId('pay-dialog')).toHaveTextContent('region-blocked'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    expect(LocksController.hasPaykitReceiver).not.toHaveBeenCalled();
  });
});
