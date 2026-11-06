import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksApplication } from '@/application/locks/locks';
import { LocksController } from '@/controllers/locks/locks';
import type { PaidUnlockAvailability } from '@/libs/region/paidUnlockAvailability';
import { LockContentParser, LockFileParser } from '@/pipes/locks/locks.parser';
import { LocksService } from '@/services/locks/locks';
import type { LockFile, TAccessCredential, TUnlockedContent, TVerificationStatus } from '@/services/locks/locks.types';
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
// #3047 drives the real `LocksApplication.fetchPaidContent` against these two Lock Server calls.
vi.mock('@/services/locks/locks', () => ({
  LocksService: { issueAccessCredential: vi.fn(), proxyReadGuardedResource: vi.fn() },
}));
// A short pill hold lets a test outlive it the way a slow download does; the default stays real.
const hold = vi.hoisted(() => ({ ms: undefined as number | undefined }));
vi.mock('@/config/locks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/locks')>();
  return {
    ...actual,
    get UNLOCK_PILL_HOLD_MS() {
      return hold.ms ?? actual.UNLOCK_PILL_HOLD_MS;
    },
  };
});
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
  DialogPayToUnlock: ({
    open,
    stage,
    onRetry,
    onViewContent,
  }: {
    open: boolean;
    stage: string;
    onRetry: () => void;
    onViewContent: () => void;
  }) =>
    open ? (
      <div data-testid="pay-dialog">
        {stage}
        <button onClick={onRetry}>Retry</button>
        <button onClick={onViewContent}>View Content</button>
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
  hold.ms = undefined;
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
    expect(LocksController.fetchPaykitConnectionState).toHaveBeenCalledWith(
      { lockFile, bundleId: 'saved-bundle' },
      { callSite: 'payToUnlockConnectionPoll' },
    );
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

  // #3038: the real recovery and pill hooks together. A click while the download runs would cancel it and
  // have the pay dialog download the same content again. A reader in a blocked region already paid, so the
  // region notice stays hidden while their content downloads.
  it.each<PaidUnlockAvailability>([{ status: 'available' }, { status: 'blocked', cause: 'region' }])(
    'keeps Unlock busy while recovery downloads a completed purchase, then shows the content: %j',
    async (paidUnlocks) => {
      availability.value = paidUnlocks;
      vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('completed'));
      const download = Promise.withResolvers<TUnlockedContent>();
      vi.mocked(LocksController.fetchPaidContent).mockReturnValue(download.promise);
      renderCard();

      await waitFor(() => expect(LocksController.fetchPaidContent).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('button', { name: 'Unlock', hidden: true })).toBeDisabled();
      // Held, not inert: an inert pill is disabled too, but dimmed and without a spinner.
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.queryByTestId('pay-dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('locks-region-notice')).not.toBeInTheDocument();

      download.resolve(content);
      await waitFor(() => expect(applyUnlockedContent).toHaveBeenCalledWith(content));
      expect(LocksController.fetchPaidContent).toHaveBeenCalledTimes(1);
      expect(LocksController.startPayment).not.toHaveBeenCalled();
    },
  );

  // #3047: a download that outlives the pill hold. The click cancels recovery and the pay dialog asks for
  // the same purchase; through the real application both share one credential and one download.
  it('shares the running recovery download with the pay dialog once the pill goes live', async () => {
    hold.ms = 50;
    availability.value = { status: 'available' };
    const paidLockFile = asOpaque<LockFile>({
      ...lockFile,
      primary_resource: {
        path: '/priv/app.locks/content/a.json',
        hash: 'h',
        content_type: 'application/json',
        size: 1,
      },
      secondary_resources: {},
    });
    vi.mocked(LocksController.fetchResolvedPurchase).mockResolvedValue(reusable('completed'));
    vi.mocked(LocksController.fetchPaymentStatus).mockResolvedValue(task('completed'));
    vi.mocked(LocksController.fetchPaidContent).mockImplementation((params) =>
      LocksApplication.fetchPaidContent({ ...params, lockFile: paidLockFile }),
    );
    const credential = Promise.withResolvers<TAccessCredential>();
    vi.mocked(LocksService.issueAccessCredential).mockReturnValue(credential.promise);
    vi.mocked(LocksService.proxyReadGuardedResource).mockResolvedValue(
      new TextEncoder().encode('{"content":"paid","kind":"short","attachments":null}'),
    );
    renderCard();

    await waitFor(() => expect(LocksService.issueAccessCredential).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(LocksController.fetchPaidContent).toHaveBeenCalledTimes(2));

    credential.resolve({ credential: 'cred-abc', expires_at: 'e' });
    // The dialog holds the content behind its paid screen until the reader chooses View Content.
    await waitFor(() => expect(screen.getByTestId('pay-dialog')).toHaveTextContent('paid'));
    // Both callers asked; the Lock Server saw one credential and one download.
    expect(LocksController.fetchPaidContent).toHaveBeenCalledTimes(2);
    expect(LocksService.issueAccessCredential).toHaveBeenCalledTimes(1);
    expect(LocksService.proxyReadGuardedResource).toHaveBeenCalledTimes(1);
    expect(LocksController.startPayment).not.toHaveBeenCalled();
    // Counted before View Content: `applyUnlockedContent` is mocked here, so the card never holds the
    // content and recovery would start again once the dialog closes.
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));
    await waitFor(() => expect(applyUnlockedContent).toHaveBeenCalledTimes(1));
    expect(applyUnlockedContent.mock.calls[0][0]).toMatchObject({ post: { content: 'paid' } });
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
        expect(LocksController.fetchPaidContent).toHaveBeenCalledWith(
          { lockFile, bundleId: 'saved-bundle' },
          { fresh: false },
        );
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
