import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocksAuthFlowStatus } from '@/hooks/useLocksAuthFlow/useLocksAuthFlow.types';
import { DialogLocksAuth } from './DialogLocksAuth';

// Controllable stand-in for the auth flow so the modal's status branches can be driven directly.
// NOTE: the hoisted factory runs before imports, so it can't reference LocksAuthFlowStatus — the
// enum's IDLE value is the string 'idle', and each test resets `flow` with the real enum member.
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  start: vi.fn(),
  reset: vi.fn(),
  flow: {
    status: 'idle' as string,
    connectUrl: null as string | null,
    session: null as unknown,
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

const fakeSession = { lockServer: () => 'ls', exportSecret: () => 'secret' };

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

  it('hands the session to onSuccess then closes on the Success step', () => {
    mocks.flow = { status: LocksAuthFlowStatus.SUCCESS, connectUrl: null, session: fakeSession, error: null };
    const { onOpenChange, onSuccess } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onSuccess).toHaveBeenCalledWith(fakeSession);
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
  });
});
