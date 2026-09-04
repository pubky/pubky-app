import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { LockFile, LockPostContent } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LockedPostContent } from './LockedPostContent';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));

vi.mock('@/hooks/useLockFile/useLockFile', () => ({ useLockFile: vi.fn() }));
// The pay hook has its own tests; here only the wiring matters. `payMocks.params` captures what the
// component passed so a test can drive `onCompleted` as if the payment finished.
type PayParams = { open: boolean; onPurchased: (lockId: string) => void; onCompleted: (content: unknown) => void };
const payMocks = vi.hoisted(() => ({
  params: null as null | PayParams,
  submit: vi.fn(),
  viewContent: vi.fn(),
  requireAuth: vi.fn((action: () => unknown) => action()),
}));
vi.mock('@/hooks/usePayToUnlock/usePayToUnlock', () => ({
  usePayToUnlock: (params: PayParams) => {
    payMocks.params = params;
    return { stage: 'pay', isSubmitting: false, submit: payMocks.submit, viewContent: payMocks.viewContent };
  },
}));
// 'lock1' is the id in LOCK_URL, so the payment-lock tests start from an already purchased lock.
const purchasedMocks = vi.hoisted(() => ({
  params: null as null | { enabled: boolean },
  hasPurchase: vi.fn((lockId: string | null) => lockId === 'lock1'),
  markPurchased: vi.fn(),
}));
vi.mock('@/hooks/usePurchasedLocks/usePurchasedLocks', () => ({
  usePurchasedLocks: (params: { enabled: boolean }) => {
    purchasedMocks.params = params;
    return { hasPurchase: purchasedMocks.hasPurchase, markPurchased: purchasedMocks.markPurchased };
  },
}));
// The resume hook has its own tests; here only the wiring matters — capture what it was handed.
const resumeMocks = vi.hoisted(() => ({
  params: null as null | { onResumed: (content: unknown) => void; isPurchased: boolean; hasContent: boolean },
}));
vi.mock('@/hooks/usePurchaseResume/usePurchaseResume', () => ({
  usePurchaseResume: (params: { onResumed: (content: unknown) => void; isPurchased: boolean; hasContent: boolean }) => {
    resumeMocks.params = params;
  },
}));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ isAuthenticated: true, requireAuth: payMocks.requireAuth }),
}));
vi.mock('@/molecules/DialogPayToUnlock/DialogPayToUnlock', () => ({
  DialogPayToUnlock: ({
    open,
    priceSats,
    onViewContent,
  }: {
    open: boolean;
    priceSats: string;
    onViewContent: () => void;
  }) =>
    open ? (
      <div data-testid="pay-dialog">
        {priceSats}
        <button onClick={onViewContent}>{'Mock view content'}</button>
      </div>
    ) : null,
}));
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getLockContent: vi.fn(),
    unlock: vi.fn(),
    fetchUnlockedContent: vi.fn(),
    replicateUnlockedContent: vi.fn().mockResolvedValue(undefined),
    fetchReplicatedContent: vi.fn().mockResolvedValue(null),
    fetchOwnContent: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/molecules/Toaster/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string | null; session: object | null }) => unknown) =>
    selector({ currentUserPubky: 'pubkyreader', session: {} }),
}));
vi.mock('../PostArticle/PostArticle', () => ({
  PostArticle: ({ content }: { content: string }) => <div data-testid="post-article">{content}</div>,
}));
vi.mock('../PostBody/PostBody', () => ({
  PostBody: ({ content, localAttachments }: { content: string; localAttachments?: unknown[] }) => (
    <div data-testid="post-body" data-media={localAttachments?.length ?? 0}>
      {content}
    </div>
  ),
}));

const mockLockData = ({
  lockContent = { lock_title: 'Secret', teaser_description: 'A teaser' },
  lockFile = null,
  priceSats = null,
  hasError = false,
}: {
  lockContent?: LockPostContent | null;
  lockFile?: LockFile | null;
  priceSats?: string | null;
  hasError?: boolean;
}) => {
  vi.mocked(LocksController.getLockContent).mockReturnValue(lockContent);
  vi.mocked(useLockFile).mockReturnValue({ lockFile, priceSats, hasError });
};

const LOCK_URL = 'pubky://hs/pub/locks.app/lock1.json';

describe('LockedPostContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toastMock.mockClear();
    purchasedMocks.hasPurchase.mockReset(); // back to the `lock1` implementation
    purchasedMocks.markPurchased.mockClear();
    payMocks.viewContent.mockClear();
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(null);
    vi.mocked(LocksController.replicateUnlockedContent).mockResolvedValue(undefined);
  });

  it('renders the teaser body and the lock card from the parsed lock content', () => {
    mockLockData({});
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    expect(LocksController.getLockContent).toHaveBeenCalledWith('{}');
    expect(useLockFile).toHaveBeenCalledWith(LOCK_URL);
    expect(screen.getByText('A teaser')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Secret');
  });

  it('shows the price on the card for a payment lock', () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }), priceSats: '1000' });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByText('₿1,000')).toBeInTheDocument();
  });

  it('shows the mask on the card for a password lock', () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByText('••••••')).toBeInTheDocument();
  });

  // The price only becomes known with the lock file, so until then the card must not claim a method.
  it('shows the mask while the lock file is still loading', () => {
    mockLockData({ lockFile: null, priceSats: null });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByText('••••••')).toBeInTheDocument();
  });

  describe('payment lock', () => {
    const paymentData = () =>
      mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }), priceSats: '1000' });

    it('opens the pay dialog (behind the auth gate) instead of the password dialog', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      // The card defers onUnlock until its slide-over finishes; findBy waits that out.
      expect(await screen.findByTestId('pay-dialog')).toHaveTextContent('1000');
      expect(payMocks.requireAuth).toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Password to Unlock' })).not.toBeInTheDocument();
    });

    // Paid while away: the content arrives without the reader pressing anything.
    it('renders content recovered by the resume hook, with no interaction', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

      expect(resumeMocks.params?.hasContent).toBe(false);

      act(() =>
        resumeMocks.params?.onResumed({
          post: { content: 'recovered secret', kind: 'short', attachments: null },
          attachments: [],
        }),
      );

      await waitFor(() => expect(screen.getByText('recovered secret')).toBeInTheDocument());
      expect(screen.queryByTestId('pay-dialog')).not.toBeInTheDocument();
      // Purchase entries outlive the replica, so once the content is on screen the hook has to be
      // told — otherwise an old unlock is re-downloaded and re-replicated on every mount.
      expect(resumeMocks.params?.hasContent).toBe(true);
    });

    // A password-only feed must never read the purchases directory.
    it('enables the purchase listing only for payment locks', () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
      expect(purchasedMocks.params?.enabled).toBe(true);

      mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
      expect(purchasedMocks.params?.enabled).toBe(false);
    });

    it('tells the recovery hook the lock is purchased from the listing', () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
      expect(resumeMocks.params?.isPurchased).toBe(true);

      purchasedMocks.hasPurchase.mockReturnValue(false);
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
      expect(resumeMocks.params?.isPurchased).toBe(false);
    });

    it('leaves purchase recovery to the pay hook while its dialog is open', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
      expect(resumeMocks.params?.isPurchased).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await screen.findByTestId('pay-dialog');

      expect(resumeMocks.params?.isPurchased).toBe(false);
    });

    it('records a new purchase in the session listing', () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

      payMocks.params?.onPurchased('lock1');
      expect(purchasedMocks.markPurchased).toHaveBeenCalledWith('lock1');
    });

    it('connects the pay dialog view action to the pay hook', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await screen.findByTestId('pay-dialog');
      fireEvent.click(screen.getByRole('button', { name: 'Mock view content' }));

      expect(payMocks.viewContent).toHaveBeenCalledTimes(1);
    });

    it('renders the unlocked content once the payment completes', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await screen.findByTestId('pay-dialog');
      act(() =>
        payMocks.params?.onCompleted({
          post: { content: 'the paid secret', kind: 'short', attachments: null },
          attachments: [],
        }),
      );

      await waitFor(() => expect(screen.getByText('the paid secret')).toBeInTheDocument());
      expect(screen.queryByTestId('pay-dialog')).not.toBeInTheDocument(); // closed on success
    });
  });

  it('renders nothing when the teaser content is unparseable', () => {
    mockLockData({ lockContent: null });
    const { container } = render(<LockedPostContent content="not json" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('enables Unlock when the lock file resolved', () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  });

  it('disables Unlock when the lock file fetch failed', () => {
    mockLockData({ hasError: true });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('disables Unlock while the lock file is loading', () => {
    // Submitting without a lock file returns silently — the dialog would look broken.
    mockLockData({ lockFile: null, hasError: false });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('opens the unlock dialog after the button slides over the mask', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    expect(screen.queryByRole('heading', { name: 'Password to Unlock' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('heading', { name: 'Password to Unlock' })).toBeInTheDocument();
  });

  it('unlocks, reads the guarded post, and renders its content in place of the card', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    vi.mocked(LocksController.fetchUnlockedContent).mockResolvedValue({
      post: { content: 'the unlocked secret', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(await screen.findByLabelText('Password', { selector: 'input' }), {
      target: { value: 'anything' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    await waitFor(() => {
      expect(LocksController.unlock).toHaveBeenCalledWith({ lockFile, lockUrl: LOCK_URL, password: 'anything' });
      expect(LocksController.fetchUnlockedContent).toHaveBeenCalledWith({ lockFile, credential: 'cred' });
    });
    // Content replaces the lock card.
    expect(screen.getByText('the unlocked secret')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('sends unlocked article content to the article renderer, which keeps its title', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    const article = JSON.stringify({ title: 'My Essay', body: 'the body' });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: article, kind: 'long', attachments: null },
      attachments: [],
    });

    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    expect(await screen.findByTestId('post-article')).toHaveTextContent('My Essay');
    // Only the teaser stays on PostBody — the unlocked article must not also render there.
    expect(screen.getAllByTestId('post-body')).toHaveLength(1);
    expect(screen.getByTestId('post-body')).not.toHaveTextContent(article);
  });

  it('keeps plain body text on the body renderer even when the kind is long', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: 'not article json', kind: 'long', attachments: null },
      attachments: [],
    });

    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    expect(await screen.findByText('not article json')).toBeInTheDocument();
    expect(screen.queryByTestId('post-article')).not.toBeInTheDocument();
  });

  it('renders the unlocked attachments as local object-URL media', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    vi.mocked(LocksController.fetchUnlockedContent).mockResolvedValue({
      post: {
        content: 'the unlocked secret',
        kind: 'image',
        attachments: ['pubky://b/priv/locks.app/content/a', 'pubky://b/priv/locks.app/content/b'],
      },
      attachments: [
        { id: 'a', contentType: 'image/png', bytes: new Uint8Array([1]) },
        { id: 'b', contentType: 'video/mp4', bytes: new Uint8Array([2]) },
      ],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(await screen.findByLabelText('Password', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    await waitFor(() => expect(screen.getByText('the unlocked secret')).toBeInTheDocument());
    expect(screen.getByText('the unlocked secret')).toHaveAttribute('data-media', '2');
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('toasts (non-blocking) when a guarded attachment is dropped, still rendering the post', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    vi.mocked(LocksController.fetchUnlockedContent).mockResolvedValue({
      post: {
        content: 'the unlocked secret',
        kind: 'image',
        attachments: ['pubky://b/priv/locks.app/content/a', 'pubky://b/priv/locks.app/content/b'],
      },
      attachments: [{ id: 'a', contentType: 'image/png', bytes: new Uint8Array() }], // one of two dropped
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(await screen.findByLabelText('Password', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    // Post still renders (non-blocking) and the reader is warned once.
    await waitFor(() => expect(screen.getByText('the unlocked secret')).toBeInTheDocument());
    expect(toastMock).toHaveBeenCalledWith({ variant: 'error', description: 'Could not load attachments' });
  });

  it('keeps the dialog open with an error when reading the unlocked content throws', async () => {
    const lockFile = asOpaque<LockFile>({ creator: 'pubkybob' });
    mockLockData({ lockFile });
    vi.mocked(LocksController.unlock).mockResolvedValue({ bundleId: 'b', credential: 'cred', expiresAt: 'e' });
    // Matches the real AppError thrown in production (fetchUnlockedContent throws Err.validation).
    vi.mocked(LocksController.fetchUnlockedContent).mockRejectedValue(
      Err.validation(ValidationErrorCode.INVALID_INPUT, 'unparseable guarded post', {
        service: ErrorService.Locks,
        operation: 'fetchUnlockedContent',
      }),
    );
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    fireEvent.change(await screen.findByLabelText('Password', { selector: 'input' }), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));

    // The dialog stays open (not silently closed on a correct password); no unlocked content renders.
    await waitFor(() => expect(LocksController.fetchUnlockedContent).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Password to Unlock' })).toBeInTheDocument();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();
    // Downloaded bytes are discarded with the failure — no replication, so no `post.json` marker.
    expect(LocksController.replicateUnlockedContent).not.toHaveBeenCalled();
  });

  it('shows already-unlocked content on mount without the lock card or a password prompt', async () => {
    mockLockData({ hasError: false });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: 'previously unlocked', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkycreator" />);

    await waitFor(() => expect(screen.getByText('previously unlocked')).toBeInTheDocument());
    expect(LocksController.fetchReplicatedContent).toHaveBeenCalledWith({
      lockUrl: LOCK_URL,
      readerPubky: 'pubkyreader',
    });
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
  });

  it('reads the creator own content directly when the lock owner is the signed-in user (a == b)', async () => {
    // stripPubkyPrefix('pubkypubkyreader') === 'pubkyreader' === currentUserPubky → own lock.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkypubkyreader' });
    mockLockData({ lockFile, priceSats: '1000' });
    vi.mocked(LocksController.fetchOwnContent).mockResolvedValue({
      post: { content: 'my own locked content', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkyreader" />);

    await waitFor(() => expect(screen.getByText('my own locked content')).toBeInTheDocument());
    expect(LocksController.fetchOwnContent).toHaveBeenCalledWith({ lockFile });
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    // Own lock keeps the lock card (Unlock present but disabled) + a "My locked content" label.
    expect(screen.getByText('My locked content')).toBeInTheDocument();
    expect(screen.getByText('₿1,000')).toBeInTheDocument(); // the price the creator set stays visible
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();
  });

  it('leaves the lock locked when I posted it under a different account (a != b)', async () => {
    // owner ('other') !== me, but I'm the author → my post, other lock account. Phase-2 blocker.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });
    mockLockData({ lockFile });
    render(<LockedPostContent content="{}" lock={LOCK_URL} authorId="pubkyreader" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument());
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });
});
