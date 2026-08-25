import type { Session as LocksSdkSession } from '@pubky/locks-sdk';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BITKIT_APP_STORE_URL, BITKIT_PLAY_STORE_URL } from '@/config/externalLinks';
import { LocksAuthFlowStatus } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow.types';
import { PaykitSetupFlowStatus } from '@/hooks/usePaykitSetupFlow/usePaykitSetupFlow.types';
import { useLocksAuthStore } from '@/stores/locksAuth/locksAuth.store';
import { locksAuthInitialState } from '@/stores/locksAuth/locksAuth.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { DialogLocksAuth } from './DialogLocksAuth';

// Controllable stand-in for the auth flow so the modal's status branches can be driven directly.
// NOTE: the hoisted factory runs before imports, so it can't reference LocksAuthFlowStatus — the
// enum's IDLE value is the string 'idle', and each test resets `flow` with the real enum member.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  start: vi.fn(),
  reset: vi.fn(),
  startPaykit: vi.fn(),
  resetPaykit: vi.fn(),
  flow: {
    status: 'idle' as string,
    connectUrl: null as string | null,
    session: null as unknown,
    error: null as unknown,
  },
  paykitFlow: {
    status: 'idle' as string,
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

vi.mock('@/hooks/usePaykitSetupFlow/usePaykitSetupFlow', () => ({
  usePaykitSetupFlow: () => ({
    ...mocks.paykitFlow,
    iframeRef: { current: null },
    start: mocks.startPaykit,
    reset: mocks.resetPaykit,
  }),
}));

const fakeSession = asOpaque<LocksSdkSession>({ id: 'locks-session' });

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
    mocks.paykitFlow = { status: PaykitSetupFlowStatus.IDLE, setupUrl: null, error: null };
    useLocksAuthStore.setState(locksAuthInitialState);
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

  it.each([LocksAuthFlowStatus.CONNECTING, LocksAuthFlowStatus.EXCHANGING])(
    'shows the loader while the Enable step is %s',
    (status) => {
      mocks.flow = { status, connectUrl: null, session: null, error: null };
      renderDialog();

      expect(screen.queryByTitle('Lock Server authorization')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog').querySelector('svg.animate-spin')).toBeInTheDocument();
    },
  );

  it('opens at the Bitkit step for a creator who is signed in but not connected', () => {
    signIn();
    renderDialog();

    expect(screen.getByText('Enable Payments')).toBeInTheDocument();
    expect(mocks.startPaykit).toHaveBeenCalledTimes(1);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('renders the Paykit iframe with the postMessage sandbox on the Bitkit step', () => {
    signIn();
    mocks.paykitFlow = {
      status: PaykitSetupFlowStatus.AWAITING_APPROVAL,
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
    renderDialog();

    expect(screen.getByAltText('Bitkit')).toBeInTheDocument();
    expect(screen.queryByAltText('Pubky Ring')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'App Store' })).toHaveAttribute('href', BITKIT_APP_STORE_URL);
    expect(screen.getByRole('link', { name: 'Google Play' })).toHaveAttribute('href', BITKIT_PLAY_STORE_URL);
  });

  it('retries only the Paykit setup when it fails', () => {
    signIn();
    mocks.flow = {
      status: LocksAuthFlowStatus.ERROR,
      connectUrl: null,
      session: null,
      error: { message: 'locks-boom' },
    };
    mocks.paykitFlow = { status: PaykitSetupFlowStatus.ERROR, setupUrl: null, error: { message: 'paykit-boom' } };
    renderDialog();

    expect(screen.getByText('paykit-boom')).toBeInTheDocument();
    expect(screen.queryByText('locks-boom')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mocks.startPaykit).toHaveBeenCalledTimes(1);
    expect(mocks.start).not.toHaveBeenCalled();
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
});
