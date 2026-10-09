import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksController } from '@/controllers/locks/locks';
import { useLockFile } from '@/hooks/useLockFile/useLockFile';
import { PostPreviewNestingProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import type { LockFile, LockPostContent, TUnlockedAttachment, TUnlockedContent } from '@/services/locks/locks.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { LockedPostContent } from './LockedPostContent';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
const pathname = vi.hoisted(() => ({ value: '/home' }));

vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

vi.mock('@/hooks/useLockFile/useLockFile', () => ({ useLockFile: vi.fn() }));
// The pay hook has its own tests; here only the wiring matters. `payMocks.params` captures what the
// component passed so a test can drive `onCompleted` as if the payment finished.
type PayParams = { open: boolean; onPurchased: (lockId: string) => void; onCompleted: (content: unknown) => void };
const payMocks = vi.hoisted(() => ({
  params: null as null | PayParams,
  retry: vi.fn(),
  viewContent: vi.fn(),
}));
const authMocks = vi.hoisted(() => {
  const mocks = {
    isAuthenticated: true,
    waitForAuth: async () => true,
    setShowSignInDialog: vi.fn(),
    requireAuth: vi.fn((action: () => unknown) => {
      if (mocks.isAuthenticated) return action();
      mocks.setShowSignInDialog(true);
      return undefined;
    }),
  };
  return mocks;
});
vi.mock('@/hooks/usePayToUnlock/usePayToUnlock', () => ({
  usePayToUnlock: (params: PayParams) => {
    payMocks.params = params;
    return {
      stage: 'retry',
      isStalled: false,
      handshakePubky: 'pubkybob',
      connectionIssue: null,
      walletSetupNeeded: false,
      isSubmitting: false,
      retry: payMocks.retry,
      recheck: vi.fn(),
      viewContent: payMocks.viewContent,
    };
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
  useRequireAuth: () => ({
    isAuthenticated: authMocks.isAuthenticated,
    requireAuth: authMocks.requireAuth,
    waitForAuth: async () => authMocks.requireAuth(() => true) === true,
  }),
}));
vi.mock('@/molecules/DialogPayToUnlock/DialogPayToUnlock', () => ({
  DialogPayToUnlock: ({
    open,
    priceSats,
    handshakePubky,
    onViewContent,
  }: {
    open: boolean;
    priceSats: string;
    handshakePubky: string | null;
    onViewContent: () => void;
  }) =>
    open ? (
      <div data-testid="pay-dialog" data-handshake-pubky={handshakePubky}>
        {priceSats}
        <button onClick={onViewContent}>{'Mock view content'}</button>
      </div>
    ) : null,
}));
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: {
    getLockContent: vi.fn(),
    getOwnPost: vi.fn().mockResolvedValue(null),
    getUnlockedPost: vi.fn().mockResolvedValue(null),
    fetchReplicatedAttachments: vi.fn().mockResolvedValue([]),
    replicateUnlockedContent: vi.fn().mockResolvedValue(undefined),
    fetchReplicatedContent: vi.fn().mockResolvedValue(null),
    fetchOwnContent: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
// Both read the real auth store; it is stubbed here with a bare session, so stand them in.
vi.mock('@/organisms/LocksPermissionNotice/LocksPermissionNotice', () => ({
  LocksPermissionNotice: () => <div data-testid="locks-permission-notice" />,
}));
const sessionNeedsUpgrade = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/useSessionNeedsUpgrade/useSessionNeedsUpgrade', () => ({
  useSessionNeedsUpgrade: () => sessionNeedsUpgrade.value,
}));
afterEach(() => {
  sessionNeedsUpgrade.value = false;
});
// One state object, as in the real store: a fresh `session` per render would re-run every effect that
// depends on it.
const authState = vi.hoisted(() => ({
  currentUserPubky: 'pubkyreader' as string | null,
  session: {} as object | null,
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: typeof authState) => unknown) => selector(authState),
}));
vi.mock('../PostArticle/PostArticle', () => ({
  PostArticle: ({
    content,
    variant,
    pendingAttachments,
  }: {
    content: string;
    variant?: 'preview' | 'full';
    pendingAttachments?: unknown[];
  }) => (
    <div data-testid="post-article" data-variant={variant ?? 'preview'} data-pending={pendingAttachments?.length ?? 0}>
      {content}
    </div>
  ),
}));
vi.mock('../PostBody/PostBody', () => ({
  PostBody: ({
    content,
    localAttachments,
    pendingAttachments,
  }: {
    content: string;
    localAttachments?: unknown[];
    pendingAttachments?: unknown[];
  }) => (
    <div
      data-testid="post-body"
      data-media={localAttachments?.length ?? 0}
      data-pending={pendingAttachments?.length ?? 0}
    >
      {content}
    </div>
  ),
}));

const mockLockData = ({
  lockContent = { lock_title: 'Secret', teaser_description: 'A teaser' },
  lockFile = null,
  priceSats = null,
  isLoading = false,
}: {
  lockContent?: LockPostContent | null;
  lockFile?: LockFile | null;
  priceSats?: string | null;
  isLoading?: boolean;
} = {}) => {
  vi.mocked(LocksController.getLockContent).mockReturnValue(lockContent);
  vi.mocked(useLockFile).mockReturnValue({ lockFile, priceSats, isLoading });
};

const LOCK_URL = 'pubky://hs/pub/app.locks/lock1.json';

/** jsdom reports every offset as 0, which would make the slide-over a no-op no test could see. */
const useSlideGeometry = () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft');
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === 'BUTTON' ? 0 : 120;
    },
  });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetLeft', original);
  };
};

describe('LockedPostContent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    toastMock.mockClear();
    purchasedMocks.hasPurchase.mockReset(); // back to the `lock1` implementation
    purchasedMocks.markPurchased.mockClear();
    payMocks.viewContent.mockClear();
    authMocks.isAuthenticated = true;
    authMocks.requireAuth.mockClear();
    authMocks.setShowSignInDialog.mockClear();
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(null);
    vi.mocked(LocksController.replicateUnlockedContent).mockResolvedValue(undefined);
    vi.mocked(LocksController.getOwnPost).mockResolvedValue(null);
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue(null);
    vi.mocked(LocksController.fetchReplicatedAttachments).mockResolvedValue([]);
    vi.mocked(LocksController.fetchOwnContent).mockReset();
    pathname.value = '/home';
  });

  it('renders the teaser body and the lock card from the parsed lock content', () => {
    mockLockData({});
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

    expect(LocksController.getLockContent).toHaveBeenCalledWith('{}');
    expect(useLockFile).toHaveBeenCalledWith(LOCK_URL);
    expect(screen.getByText('A teaser')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Secret');
  });

  it('shows the price on the card for a payment lock', () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }), priceSats: '1000' });
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
    expect(screen.getByText('₿1,000')).toBeInTheDocument();
  });

  it('shows the mask on the card for an unsupported legacy lock', () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
    expect(screen.getByText('••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  // Until the lock file arrives, neither the price nor whether the lock is the viewer's own is known.
  it('shows a spinner on an inert card while the lock file is still loading', () => {
    mockLockData({ lockFile: null, priceSats: null, isLoading: true });
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  describe('payment lock', () => {
    const paymentData = () =>
      mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }), priceSats: '1000' });

    it('opens the pay dialog behind the auth gate', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      // The card defers onUnlock until its slide-over finishes; findBy waits that out.
      expect(await screen.findByTestId('pay-dialog')).toHaveTextContent('1000');
      expect(screen.getByTestId('pay-dialog')).toHaveAttribute('data-handshake-pubky', 'pubkybob');
      expect(authMocks.requireAuth).toHaveBeenCalled();
    });

    // Signed out, Unlock opens the sign-in dialog and no unlock modal follows — so the card never
    // gets the close that snaps the slid-over button back, and it would sit over the price for good.
    it('leaves the Unlock button in place for a signed-out reader', async () => {
      const restoreGeometry = useSlideGeometry();
      try {
        authMocks.isAuthenticated = false;
        paymentData();
        render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

        fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
        await waitFor(() => expect(authMocks.setShowSignInDialog).toHaveBeenCalledWith(true));

        expect(screen.queryByTestId('pay-dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unlock' })).toHaveStyle({ transform: 'translateX(0px)' });
      } finally {
        restoreGeometry();
      }
    });

    // Paid while away: the content arrives without the reader pressing anything.
    it('renders content recovered by the resume hook, with no interaction', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

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

    it('enables the purchase listing only for supported payment locks', () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
      expect(purchasedMocks.params?.enabled).toBe(true);

      mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
      expect(purchasedMocks.params?.enabled).toBe(false);
    });

    it('tells the recovery hook the lock is purchased from the listing', () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
      expect(resumeMocks.params?.isPurchased).toBe(true);

      purchasedMocks.hasPurchase.mockReturnValue(false);
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
      expect(resumeMocks.params?.isPurchased).toBe(false);
    });

    it('leaves purchase recovery to the pay hook while its dialog is open', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
      expect(resumeMocks.params?.isPurchased).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await screen.findByTestId('pay-dialog');

      expect(resumeMocks.params?.isPurchased).toBe(false);
    });

    it('records a new purchase in the session listing', () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

      payMocks.params?.onPurchased('lock1');
      expect(purchasedMocks.markPurchased).toHaveBeenCalledWith('lock1');
    });

    it('connects the pay dialog view action to the pay hook', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await screen.findByTestId('pay-dialog');
      fireEvent.click(screen.getByRole('button', { name: 'Mock view content' }));

      expect(payMocks.viewContent).toHaveBeenCalledTimes(1);
    });

    it('renders available media and warns about dropped attachments once payment completes', async () => {
      paymentData();
      render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
      await screen.findByTestId('pay-dialog');
      act(() =>
        payMocks.params?.onCompleted({
          post: { content: 'the paid secret', kind: 'image', attachments: ['a', 'b'] },
          attachments: [{ id: 'a', contentType: 'image/png', bytes: new Uint8Array([1]) }],
        }),
      );

      await waitFor(() => expect(screen.getByText('the paid secret')).toBeInTheDocument());
      expect(screen.getByText('the paid secret')).toHaveAttribute('data-media', '1');
      expect(toastMock).toHaveBeenCalledWith({ variant: 'error', description: 'Could not load attachments' });
      expect(screen.queryByTestId('pay-dialog')).not.toBeInTheDocument(); // closed on success
    });
  });

  it('renders nothing when the teaser content is unparseable', () => {
    mockLockData({ lockContent: null });
    const { container } = render(<LockedPostContent content="not json" lock={LOCK_URL} postId="pubkycreator:POST1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('enables Unlock when the lock file resolved', () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }), priceSats: '1000' });
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  });

  it('disables Unlock when the lock file fetch failed', () => {
    mockLockData({ lockFile: null, isLoading: false });
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    // A failed fetch stops the spinner and falls back to the mask.
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
    expect(screen.getByText('••••••')).toBeInTheDocument();
  });

  it('sends unlocked article content to the article renderer, which keeps its title', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    const article = JSON.stringify({ title: 'My Essay', body: 'the body' });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: article, kind: 'long', attachments: null },
      attachments: [],
    });

    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

    expect(await screen.findByTestId('post-article')).toHaveTextContent('My Essay');
    // Only the teaser stays on PostBody — the unlocked article must not also render there.
    expect(screen.getAllByTestId('post-body')).toHaveLength(1);
    expect(screen.getByTestId('post-body')).not.toHaveTextContent(article);
  });

  it('renders an unlocked article in full on the post page, and as a preview elsewhere', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    const article = JSON.stringify({ title: 'My Essay', body: 'the body' });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: article, kind: 'long', attachments: null },
      attachments: [],
    });

    const { unmount } = render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
    expect(await screen.findByTestId('post-article')).toHaveAttribute('data-variant', 'preview');
    unmount();

    pathname.value = '/post/pubkycreator/POST1';
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);
    expect(await screen.findByTestId('post-article')).toHaveAttribute('data-variant', 'full');
  });

  it('keeps the focused post compact inside a preview, as the reply and repost dialogs render it', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: JSON.stringify({ title: 'My Essay', body: 'the body' }), kind: 'long', attachments: null },
      attachments: [],
    });
    pathname.value = '/post/pubkycreator/POST1';

    render(
      <PostPreviewNestingProvider>
        <LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />
      </PostPreviewNestingProvider>,
    );

    expect(await screen.findByTestId('post-article')).toHaveAttribute('data-variant', 'preview');
  });

  it('keeps an embed or thread parent a preview on someone else post page', async () => {
    // The post page also renders embeds and parents through the same component; only the post the
    // route names may open in full.
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: JSON.stringify({ title: 'My Essay', body: 'the body' }), kind: 'long', attachments: null },
      attachments: [],
    });
    pathname.value = '/post/pubkycreator/OTHERPOST';

    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

    expect(await screen.findByTestId('post-article')).toHaveAttribute('data-variant', 'preview');
  });

  it('keeps plain body text on the body renderer even when the kind is long', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }) });
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: 'not article json', kind: 'long', attachments: null },
      attachments: [],
    });

    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

    expect(await screen.findByText('not article json')).toBeInTheDocument();
    expect(screen.queryByTestId('post-article')).not.toBeInTheDocument();
  });

  it('asks for the missing permission and parks the lock card when the session predates /priv', async () => {
    sessionNeedsUpgrade.value = true;
    mockLockData({ priceSats: '1000' });
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

    expect(await screen.findByTestId('locks-permission-notice')).toBeInTheDocument();
    // This session cannot read whether the reader already unlocked; a live Unlock could charge twice.
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('shows already-unlocked content on mount without the lock card', async () => {
    mockLockData();
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue({
      post: { content: 'previously unlocked', kind: 'short', attachments: null },
      attachments: [],
    });
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

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
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkyreader:POST1" />);

    await waitFor(() => expect(screen.getByText('my own locked content')).toBeInTheDocument());
    expect(LocksController.fetchOwnContent).toHaveBeenCalledWith({ lockUrl: LOCK_URL, lockFile });
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
    // Own lock keeps the lock card (Unlock present but disabled) + a "My locked content" label.
    expect(screen.getByText('My locked content')).toBeInTheDocument();
    expect(screen.getByText('₿1,000')).toBeInTheDocument(); // the price the creator set stays visible
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();
  });

  describe('own lock, two-step loading (#2717)', () => {
    // stripPubkyPrefix('pubkypubkyreader') === 'pubkyreader' === currentUserPubky → own lock.
    const ownLockFile = asOpaque<LockFile>({ creator: 'pubkypubkyreader' });
    const deferred = <T,>() => {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };
    const renderOwn = () => render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkyreader:POST1" />);

    // A large attachment kept the Unlock card on the creator's own post for seconds.
    it('renders the own layout with a text skeleton before the original has been read', async () => {
      const read = deferred<TUnlockedContent>();
      mockLockData({ lockFile: ownLockFile, priceSats: '1000' });
      vi.mocked(LocksController.fetchOwnContent).mockReturnValue(read.promise);
      const { container } = renderOwn();

      expect(screen.getByText('My locked content')).toBeInTheDocument();
      expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();

      await act(async () =>
        read.resolve({ post: { content: 'my own locked content', kind: 'short', attachments: null }, attachments: [] }),
      );
      expect(screen.getByText('my own locked content')).toBeInTheDocument();
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
    });

    it('shows the cached own text at once and a skeleton per attachment until the bytes arrive', async () => {
      const bytes = deferred<TUnlockedAttachment[]>();
      mockLockData({ lockFile: ownLockFile, priceSats: '1000' });
      vi.mocked(LocksController.getOwnPost).mockResolvedValue({
        content: 'cached own',
        kind: 'short',
        attachments: [
          { url: 'pubky://a', content_type: 'image/png' },
          { url: 'pubky://b', content_type: 'image/png' },
        ],
      });
      vi.mocked(LocksController.fetchReplicatedAttachments).mockReturnValue(bytes.promise);
      renderOwn();

      const body = await screen.findByText('cached own');
      expect(body).toHaveAttribute('data-pending', '2');
      expect(body).toHaveAttribute('data-media', '0');
      expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();

      await act(async () =>
        bytes.resolve([
          { id: 'a', contentType: 'image/png', bytes: new Uint8Array([1]), slot: 0 },
          { id: 'b', contentType: 'image/png', bytes: new Uint8Array([1]), slot: 1 },
        ]),
      );
      expect(body).toHaveAttribute('data-pending', '0');
      expect(body).toHaveAttribute('data-media', '2');
    });

    it('keeps the lock card inert, with no skeleton, when reading the own original fails', async () => {
      mockLockData({ lockFile: ownLockFile, priceSats: '1000' });
      vi.mocked(LocksController.fetchOwnContent).mockRejectedValue(new Error('offline'));
      const { container } = renderOwn();

      await waitFor(() => expect(container.querySelector('[data-slot="skeleton"]')).toBeNull());
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
      expect(screen.queryByText('My locked content')).not.toBeInTheDocument();
    });

    it('asks for the missing permission instead of a skeleton when the session predates /priv', async () => {
      sessionNeedsUpgrade.value = true;
      mockLockData({ lockFile: ownLockFile, priceSats: '1000' });
      const { container } = renderOwn();

      expect(await screen.findByTestId('locks-permission-notice')).toBeInTheDocument();
      expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    });
  });

  // The replica's text is cached but its files cannot be read: that is not the content the reader paid
  // for, so the recovery hook must still be allowed to re-download it.
  it('tells the recovery hook there is no content while cached text waits for bytes that never come', async () => {
    mockLockData({ lockFile: asOpaque<LockFile>({ creator: 'pubkybob' }), priceSats: '1000' });
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue({
      content: 'cached replica',
      kind: 'short',
      attachments: [{ url: 'pubky://a', content_type: 'image/png' }],
    });
    vi.mocked(LocksController.fetchReplicatedAttachments).mockRejectedValue(new Error('unreadable'));
    vi.mocked(LocksController.fetchReplicatedContent).mockResolvedValue(null);
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

    const body = await screen.findByText('cached replica');
    await waitFor(() => expect(body).toHaveAttribute('data-pending', '0'));
    expect(resumeMocks.params?.hasContent).toBe(false);
  });

  // A reader who unlocked before gets the same two steps from their replicated copy.
  it('shows the cached replica text under the Unlocked label before its bytes arrive', async () => {
    mockLockData();
    vi.mocked(LocksController.getUnlockedPost).mockResolvedValue({
      content: 'cached replica',
      kind: 'short',
      attachments: [{ url: 'pubky://a', content_type: 'image/png' }],
    });
    vi.mocked(LocksController.fetchReplicatedAttachments).mockReturnValue(new Promise(() => undefined));
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkycreator:POST1" />);

    expect(await screen.findByText('cached replica')).toHaveAttribute('data-pending', '1');
    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
  });

  it('leaves the lock locked when I posted it under a different account (a != b)', async () => {
    // owner ('other') !== me, but I'm the author → my post, other lock account. Phase-2 blocker.
    const lockFile = asOpaque<LockFile>({ creator: 'pubkyother' });
    mockLockData({ lockFile });
    render(<LockedPostContent content="{}" lock={LOCK_URL} postId="pubkyreader:POST1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument());
    expect(LocksController.fetchOwnContent).not.toHaveBeenCalled();
    expect(LocksController.fetchReplicatedContent).not.toHaveBeenCalled();
  });
});
