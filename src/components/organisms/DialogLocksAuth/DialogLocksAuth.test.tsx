import type { Session as LocksSdkSession } from '@synonymdev/locks-sdk';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BITKIT_APP_STORE_URL, BITKIT_PLAY_STORE_URL, BITKIT_WEBSITE_URL } from '@/config/externalLinks';
import { LocksAuthFlowStatus } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow.types';
import { PaykitSetupFlowStatus } from '@/hooks/usePaykitSetupFlow/usePaykitSetupFlow.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { mockRingSession, mockSession } from '@/test-utils/pubky';
import { asOpaque } from '@/test-utils/type-assertions';
import { DialogLocksAuth } from './DialogLocksAuth';

// Controllable stand-in for the auth flow so the modal's status branches can be driven directly.
// NOTE: the hoisted factory runs before imports, so it can't reference LocksAuthFlowStatus — the
// enum's IDLE value is the string 'idle', and each test resets `flow` with the real enum member.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  start: vi.fn(),
  reset: vi.fn(),
  checkPaykit: vi.fn(),
  startPaykit: vi.fn(),
  reconnectPaykit: vi.fn(),
  resetPaykit: vi.fn(),
  flow: {
    status: 'idle' as string,
    connectUrl: null as string | null,
    session: null as unknown,
    error: null as unknown,
  },
  paykitFlow: {
    status: 'idle' as string,
    mode: 'setup' as 'setup' | 'reconnect',
    setupUrl: null as string | null,
    error: null as unknown,
  },
}));

vi.mock('@/hooks/useLocksAuthFlow/useLocksAuthFlow', () => ({
  useLocksAuthFlow: () => ({
    ...mocks.flow,
    iframeRef: { current: null },
    prepare: mocks.prepare,
    start: mocks.start,
    reset: mocks.reset,
  }),
}));

// The session step starts a Ring flow on mount; keep it out of the network.
vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: () => ({
    url: 'pubkyring://authorize?token=upgrade',
    isLoading: false,
    isExpired: false,
    fetchUrl: vi.fn(),
    copyAuthUrl: vi.fn(),
    isOpeningRing: false,
    onAuthorizeClick: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePaykitSetupFlow/usePaykitSetupFlow', () => ({
  usePaykitSetupFlow: () => ({
    ...mocks.paykitFlow,
    iframeRef: { current: null },
    check: mocks.checkPaykit,
    start: mocks.startPaykit,
    reconnect: mocks.reconnectPaykit,
    reset: mocks.resetPaykit,
  }),
}));

const fakeSession = asOpaque<LocksSdkSession>({ id: 'locks-session' });

/** A homeserver session minted before the app requested `/priv` (#2373). */
const signInWithNarrowSession = () =>
  useAuthStore.setState({
    currentUserPubky: 'creator-pubky',
    session: mockRingSession(['/pub/pubky.app/:rw'], 'creator-pubky'),
  });

/** The store state the modal derives its step from. */
const signIn = ({ paykitConnected = false } = {}) =>
  useLocksAuthStore.setState({ session: fakeSession, locksSessionSecret: 'secret-abc', paykitConnected });

function renderDialog(overrides?: { open?: boolean; onOpenChange?: () => void; onSuccess?: () => void }) {
  const onOpenChange = overrides?.onOpenChange ?? vi.fn();
  const onSuccess = overrides?.onSuccess ?? vi.fn();
  const view = render(
    <DialogLocksAuth open={overrides?.open ?? true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
  );
  return { ...view, onOpenChange, onSuccess };
}

describe('DialogLocksAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flow = { status: LocksAuthFlowStatus.IDLE, connectUrl: null, session: null, error: null };
    mocks.paykitFlow = { status: PaykitSetupFlowStatus.IDLE, mode: 'setup', setupUrl: null, error: null };
    useLocksAuthStore.setState(locksAuthInitialState);
    useAuthStore.setState(authInitialState);
  });

  it('probes the server readiness when the modal opens', () => {
    renderDialog({ open: true });
    expect(mocks.prepare).toHaveBeenCalled();
  });

  it('starts the flow when Continue is clicked on the Intro step', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('disables Continue and shows a spinner while the server readiness is being checked', () => {
    mocks.flow = { status: LocksAuthFlowStatus.CHECKING_SERVER, connectUrl: null, session: null, error: null };
    renderDialog();

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const continueBtn = screen.getAllByRole('button').find((button) => button !== cancel);
    expect(continueBtn).toBeDisabled();
    expect(screen.getByRole('dialog').querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('shows a message and disables Continue when the server is unavailable', () => {
    mocks.flow = { status: LocksAuthFlowStatus.SERVER_UNAVAILABLE, connectUrl: null, session: null, error: null };
    renderDialog();

    expect(screen.getByText(/Lock Server is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('renders the Lock Server iframe with the postMessage sandbox on the Enable step', () => {
    mocks.flow = {
      status: LocksAuthFlowStatus.AWAITING_APPROVAL,
      connectUrl: 'https://lock.server/connect?delivery=postmessage',
      session: null,
      error: null,
    };
    renderDialog();

    const iframe = screen.getByTitle('Lock Server authorization');
    expect(iframe).toHaveAttribute('src', 'https://lock.server/connect?delivery=postmessage');
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    expect(screen.getByText('Enable Locks')).toBeInTheDocument();
  });

  it.each([
    ['Pubky Ring', 'https://pubkyring.app/'],
    ['Bitkit', BITKIT_WEBSITE_URL],
  ])('links %s from the Enable step text and logo in a new tab', (name, href) => {
    mocks.flow = { status: LocksAuthFlowStatus.CONNECTING, connectUrl: null, session: null, error: null };
    renderDialog();

    const links = screen.getAllByRole('link', { name });
    expect(links).toHaveLength(2);
    const [textLink, logoLink] = links;
    expect(textLink).toHaveClass('text-base', 'font-bold');
    expect(logoLink).toContainElement(screen.getByAltText(name));
    for (const link of [textLink, logoLink]) {
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('asks to scan the QR or to use the signer apps on the Enable step', () => {
    mocks.flow = { status: LocksAuthFlowStatus.CONNECTING, connectUrl: null, session: null, error: null };
    renderDialog();

    expect(screen.getByText('Scan this QR with')).toBeInTheDocument();
    expect(screen.getByText('Use')).toBeInTheDocument();
    expect(
      screen.getByText(/to authorize Locks server to manage your data\. Use the same pubky you signed in with\./),
    ).toBeInTheDocument();
  });

  it('shows no store badges on the Enable step', () => {
    mocks.flow = { status: LocksAuthFlowStatus.CONNECTING, connectUrl: null, session: null, error: null };
    renderDialog();

    expect(screen.queryByRole('link', { name: 'App Store' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Google Play' })).not.toBeInTheDocument();
  });

  it.each([LocksAuthFlowStatus.CONNECTING, LocksAuthFlowStatus.EXCHANGING])(
    'shows the loader while the Enable step is %s',
    (status) => {
      mocks.flow = { status, connectUrl: null, session: null, error: null };
      renderDialog();

      expect(screen.queryByTitle('Lock Server authorization')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog').querySelector('svg.animate-spin')).toBeInTheDocument();
    },
  );

  it('numbers the Enable Locks steps when the session also needs upgrading', () => {
    signInWithNarrowSession();
    mocks.flow = { status: LocksAuthFlowStatus.CONNECTING, connectUrl: null, session: null, error: null };
    renderDialog();

    expect(screen.getByText('Enable Locks (1/2)')).toBeInTheDocument();
  });

  it('keeps a single Enable Locks step for a session that already has the capabilities', () => {
    useAuthStore.setState({ currentUserPubky: 'creator-pubky', session: mockSession() });
    mocks.flow = { status: LocksAuthFlowStatus.CONNECTING, connectUrl: null, session: null, error: null };
    renderDialog();

    expect(screen.getByText('Enable Locks')).toBeInTheDocument();
  });

  it('shows the session step (2/2) once the Lock Server is authorized', () => {
    signInWithNarrowSession();
    mocks.flow = { status: LocksAuthFlowStatus.CONNECTING, connectUrl: null, session: null, error: null };
    const { rerender } = renderDialog();

    signIn();
    rerender(<DialogLocksAuth open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText('Enable Locks (2/2)')).toBeInTheDocument();
    expect(screen.getByText(/authorize Pubky.app to access your private Locks data/)).toBeInTheDocument();
    expect(screen.getByTestId('session-upgrade-qr')).toBeInTheDocument();
    expect(screen.queryByTitle('Bitkit payout account setup')).not.toBeInTheDocument();
    expect(mocks.checkPaykit).not.toHaveBeenCalled();
    expect(mocks.startPaykit).not.toHaveBeenCalled();
  });

  it('opens at an unnumbered session step when only the session is pending', () => {
    signInWithNarrowSession();
    signIn();
    renderDialog();

    expect(screen.getByText('Enable Locks')).toBeInTheDocument();
    expect(screen.getByTestId('session-upgrade-qr')).toBeInTheDocument();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.checkPaykit).not.toHaveBeenCalled();
    expect(mocks.startPaykit).not.toHaveBeenCalled();
  });

  it('moves on to the Bitkit step once the session is upgraded', () => {
    signInWithNarrowSession();
    signIn();
    const { rerender } = renderDialog();

    useAuthStore.setState({ session: mockSession() });
    rerender(<DialogLocksAuth open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText('Enable Payments')).toBeInTheDocument();
    expect(mocks.checkPaykit).toHaveBeenCalledTimes(1);
  });

  // #2627: the check decides whether the setup opens; the dialog never opens it on arrival.
  it('opens at the Bitkit step for a creator who is signed in but not connected', () => {
    signIn();
    renderDialog();

    expect(screen.getByText('Enable Payments')).toBeInTheDocument();
    expect(mocks.checkPaykit).toHaveBeenCalledTimes(1);
    expect(mocks.startPaykit).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('shows a spinner instead of the QR while it checks the Paykit setup', () => {
    signIn();
    mocks.paykitFlow = { status: PaykitSetupFlowStatus.CHECKING, mode: 'setup', setupUrl: null, error: null };
    renderDialog();

    expect(screen.getByText('Checking whether your Bitkit wallet is connected.')).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('svg.animate-spin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bitkit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'App Store' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Bitkit payout account setup')).not.toBeInTheDocument();
  });

  it('links Bitkit from the Enable Payments step in a new tab', () => {
    signIn();
    mocks.paykitFlow = {
      status: PaykitSetupFlowStatus.AWAITING_APPROVAL,
      mode: 'setup',
      setupUrl: 'https://paykit.server/setup?state=STATE',
      error: null,
    };
    renderDialog();

    const link = screen.getByRole('link', { name: 'Bitkit' });
    expect(link).toHaveAttribute('href', BITKIT_WEBSITE_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('text-base', 'font-bold');
  });

  it('renders the Paykit iframe with the postMessage sandbox on the Bitkit step', () => {
    signIn();
    mocks.paykitFlow = {
      status: PaykitSetupFlowStatus.AWAITING_APPROVAL,
      mode: 'setup',
      setupUrl: 'https://paykit.server/setup?state=STATE',
      error: null,
    };
    renderDialog();

    const iframe = screen.getByTitle('Bitkit payout account setup');
    expect(iframe).toHaveAttribute('src', 'https://paykit.server/setup?state=STATE');
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
  });

  it('links the store badges to Bitkit on the Bitkit step', () => {
    signIn();
    mocks.paykitFlow = {
      status: PaykitSetupFlowStatus.AWAITING_APPROVAL,
      mode: 'setup',
      setupUrl: 'https://paykit.server/setup?state=STATE',
      error: null,
    };
    renderDialog();

    expect(screen.getByAltText('Bitkit')).toBeInTheDocument();
    expect(screen.queryByAltText('Pubky Ring')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'App Store' })).toHaveAttribute('href', BITKIT_APP_STORE_URL);
    expect(screen.getByRole('link', { name: 'Google Play' })).toHaveAttribute('href', BITKIT_PLAY_STORE_URL);
  });

  it('rechecks the setup status when the Paykit setup fails', () => {
    signIn();
    mocks.flow = {
      status: LocksAuthFlowStatus.ERROR,
      connectUrl: null,
      session: null,
      error: { message: 'locks-boom' },
    };
    mocks.paykitFlow = {
      status: PaykitSetupFlowStatus.ERROR,
      mode: 'setup',
      setupUrl: null,
      error: { message: 'paykit-boom' },
    };
    renderDialog();

    expect(screen.getByText('paykit-boom')).toBeInTheDocument();
    expect(screen.queryByText('locks-boom')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mocks.checkPaykit).toHaveBeenCalledTimes(1);
    expect(mocks.startPaykit).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('retries only the setup-status check when payments are unavailable', () => {
    signIn();
    mocks.paykitFlow = { status: PaykitSetupFlowStatus.UNAVAILABLE, mode: 'setup', setupUrl: null, error: null };
    renderDialog();

    expect(screen.getByText('Payments are unavailable right now. Please try again later.')).toBeInTheDocument();
    expect(screen.queryByTitle('Bitkit payout account setup')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mocks.checkPaykit).toHaveBeenCalledTimes(1);
    expect(mocks.startPaykit).not.toHaveBeenCalled();
  });

  it('calls onSuccess then closes on the Success step', () => {
    signIn({ paykitConnected: true });
    const { onOpenChange, onSuccess } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('retries the flow when Try again is clicked on the Error step', () => {
    mocks.flow = {
      status: LocksAuthFlowStatus.ERROR,
      connectUrl: null,
      session: null,
      error: { message: 'boom' },
    };
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('requests close when Cancel is clicked', () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets the flow when the modal closes', () => {
    const { rerender } = renderDialog({ open: true });
    expect(mocks.reset).not.toHaveBeenCalled();

    rerender(<DialogLocksAuth open={false} onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    expect(mocks.reset).toHaveBeenCalled();
    expect(mocks.resetPaykit).toHaveBeenCalled();
  });
  describe('Paykit already holds the creator', () => {
    it('makes Reconnect Bitkit the main action and drops Try again', () => {
      signIn();
      mocks.paykitFlow = {
        status: PaykitSetupFlowStatus.RECONNECT_REQUIRED,
        mode: 'setup',
        setupUrl: null,
        error: null,
      };
      renderDialog();
      mocks.checkPaykit.mockClear();

      expect(screen.getByRole('heading', { name: 'Reconnect Bitkit' })).toBeInTheDocument();
      expect(screen.getByText(/Paykit already has a Bitkit setup for your account/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(screen.queryByTitle('Bitkit payout account setup')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Reconnect Bitkit' }));

      expect(mocks.reconnectPaykit).toHaveBeenCalledTimes(1);
      expect(mocks.checkPaykit).not.toHaveBeenCalled();
    });

    it('warns that a reconnect moves Bitcoin receiving to a new account', () => {
      signIn();
      mocks.paykitFlow = {
        status: PaykitSetupFlowStatus.RECONNECT_REQUIRED,
        mode: 'setup',
        setupUrl: null,
        error: null,
      };
      renderDialog();

      expect(screen.getByText(/new Bitcoin account/)).toBeInTheDocument();
    });

    it('renders the reconnect iframe with the reconnect copy', () => {
      signIn();
      mocks.paykitFlow = {
        status: PaykitSetupFlowStatus.AWAITING_APPROVAL,
        mode: 'reconnect',
        setupUrl: 'https://paykit.server/setup/reconnect?creator=pubkyX&state=STATE',
        error: null,
      };
      renderDialog();

      const iframe = screen.getByTitle('Bitkit payout account reconnect');
      expect(iframe).toHaveAttribute('src', 'https://paykit.server/setup/reconnect?creator=pubkyX&state=STATE');
      expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
      expect(screen.getByRole('heading', { name: 'Reconnect Bitkit' })).toBeInTheDocument();
      expect(screen.getByText(/wallet to reconnect payments\./)).toBeInTheDocument();
      expect(screen.queryByTitle('Bitkit payout account setup')).not.toBeInTheDocument();
    });

    it('offers the reconnect again, not a setup retry, when the reconnect failed', () => {
      signIn();
      mocks.paykitFlow = {
        status: PaykitSetupFlowStatus.ERROR,
        mode: 'reconnect',
        setupUrl: null,
        error: { message: 'Paykit reconnect failed: setup-failed' },
      };
      renderDialog();

      expect(screen.getByText('Reconnecting Bitkit failed.')).toBeInTheDocument();
      expect(screen.queryByText(/Paykit reconnect failed/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Reconnect Bitkit' }));

      expect(mocks.reconnectPaykit).toHaveBeenCalledTimes(1);
      expect(mocks.startPaykit).not.toHaveBeenCalled();
    });
  });

  describe('a failed setup Paykit holds no creator for', () => {
    it('says nothing was set up and makes Connect Bitkit the single main action', () => {
      signIn();
      mocks.paykitFlow = { status: PaykitSetupFlowStatus.SETUP_INCOMPLETE, mode: 'setup', setupUrl: null, error: null };
      renderDialog();
      mocks.checkPaykit.mockClear();

      expect(screen.getByText(/nothing was set up yet/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reconnect Bitkit' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Connect Bitkit' }));

      expect(mocks.checkPaykit).toHaveBeenCalledTimes(1);
      expect(mocks.reconnectPaykit).not.toHaveBeenCalled();
    });
  });
});
