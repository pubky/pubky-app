import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TPayToUnlockStage } from '@/hooks/usePayToUnlock/usePayToUnlock.types';
import type { TPaykitConnectionState } from '@/services/locks/locks.types';
import { DialogPayToUnlock } from './DialogPayToUnlock';

const mocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/libs/utils/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/utils/utils')>();
  return { ...actual, copyToClipboard: (args: { text: string }) => mocks.copyToClipboard(args) };
});
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (args: unknown) => mocks.toast(args) }));
vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: () => ({ profile: { name: 'Jane Whitlock', avatarUrl: undefined }, isLoading: false }),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string | null }) => unknown) =>
    selector({ currentUserPubky: 'reader1' }),
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, size }: { value: string; size: number }) => (
    <div data-testid="qr-code" data-value={value} data-size={size} />
  ),
}));

type DialogOverrides = {
  open?: boolean;
  price?: React.ComponentProps<typeof DialogPayToUnlock>['price'];
  isSubmitting?: boolean;
  onRetry?: () => void;
  isStalled?: boolean;
  handshakePubky?: string | null;
  connectionState?: TPaykitConnectionState | null;
  isConnectionPending?: boolean;
  walletSetupNeeded?: boolean;
  onRecheck?: () => void;
  onViewContent?: () => void;
  onOpenChange?: (open: boolean) => void;
  wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>;
};

const dialogElement = (stage: TPayToUnlockStage, overrides: DialogOverrides = {}) => (
  <DialogPayToUnlock
    open={overrides.open ?? true}
    onOpenChange={overrides.onOpenChange ?? vi.fn()}
    lockTitle="My locked post"
    authorId="pubkycreator"
    price={overrides.price ?? { amount: '1000', asset: 'BTC' }}
    stage={stage}
    isStalled={overrides.isStalled ?? false}
    handshakePubky={overrides.handshakePubky ?? null}
    connectionState={overrides.connectionState ?? null}
    isConnectionPending={overrides.isConnectionPending ?? false}
    walletSetupNeeded={overrides.walletSetupNeeded ?? false}
    isSubmitting={overrides.isSubmitting ?? false}
    onRetry={overrides.onRetry ?? vi.fn()}
    onRecheck={overrides.onRecheck ?? vi.fn()}
    onViewContent={overrides.onViewContent ?? vi.fn()}
  />
);

const renderDialog = (stage: TPayToUnlockStage, overrides: DialogOverrides = {}) =>
  render(dialogElement(stage, overrides), { wrapper: overrides.wrapper });

describe('DialogPayToUnlock', () => {
  it.each([
    ['waiting', 'COST TO UNLOCK'],
    ['paid', 'PAYMENT RECEIVED'],
    ['unopened', 'PAYMENT RECEIVED'],
  ] as const)('keeps USD denomination in the %s checkout state', (stage, label) => {
    renderDialog(stage, { price: { amount: '500', asset: 'USD' } });
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  // clearAllMocks keeps implementations, so a rejected copy would leak into later tests.
  beforeEach(() => {
    mocks.copyToClipboard.mockReset();
  });

  it('keeps connection instructions conditional through recovery and subsequent handshakes', () => {
    const { rerender } = renderDialog('waiting', { isConnectionPending: true });
    expect(screen.getByText('Checking your Bitkit connection…')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();

    for (const [connectionState, copy] of [
      ['none', /is not ready yet/],
      ['handshake', /Connecting to this creator/],
      ['recovery_required', /needs to be restored/],
      ['handshake', /Connecting to this creator/],
    ] as const) {
      rerender(dialogElement('waiting', { connectionState, handshakePubky: 'lockcreator' }));
      expect(screen.getByText(copy)).toBeInTheDocument();
      expect(
        screen.getByText('If this creator is not in your Bitkit contacts, scan this code to add them.'),
      ).toBeInTheDocument();
      expect(screen.getByText('If this creator is not in your Bitkit contacts, add them.')).toBeInTheDocument();
      expect(screen.queryAllByRole('status', { name: 'Loading' })).toHaveLength(
        connectionState === 'handshake' ? 1 : 0,
      );
      expect(screen.getByTestId('qr-code')).toHaveAttribute('data-value', 'pubkylockcreator');
      expect(screen.getByRole('link', { name: 'Open in Bitkit' })).toHaveAttribute(
        'href',
        'bitkit://contact?pubky=pubkylockcreator',
      );
    }

    rerender(dialogElement('waiting', { connectionState: 'connected' }));
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
    expect(screen.getByText(/Review and confirm it there when it appears/)).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('applies wrapping and shrink constraints to the lock title', () => {
    renderDialog('retry');

    const title = screen.getByText('My locked post');
    expect(title).toHaveClass('min-w-0', 'wrap-anywhere');
    expect(title.parentElement).toHaveClass('min-w-0');
  });

  it('always shows the grouped price and the creator', () => {
    renderDialog('retry');
    expect(screen.getByText('₿ 1,000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'J' })).toHaveAttribute('href', '/profile/pubkycreator');
  });

  // The wallet may live on another device, so the store links stay next to the price on both screens.
  it('shows the Bitkit links on the retry screen too', () => {
    renderDialog('retry');
    expect(screen.getByRole('link', { name: 'App Store' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Play' })).toBeInTheDocument();
  });

  // The Lock Server's 451: nothing to retry and nothing to install, so the screen only says why.
  it('region-blocked: says paid unlocks are not available here, with no retry and no Bitkit', () => {
    const onOpenChange = vi.fn();
    renderDialog('region-blocked', { onOpenChange });

    expect(screen.getByRole('status')).toHaveTextContent("Paid unlocks aren't available in your region yet.");
    expect(screen.getByRole('button', { name: 'About this limit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('pay-to-unlock-retry')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'App Store' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Google Play' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Bitkit/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    expect(screen.queryByText('PAYMENT RECEIVED')).not.toBeInTheDocument();

    const close = document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement;
    expect(close).toHaveTextContent('Close');
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('retry: shows the Bitkit instruction and the Try again button', () => {
    const onRetry = vi.fn();
    renderDialog('retry', { onRetry });

    expect(screen.getByText('The payment could not continue. Try again when Bitkit is ready.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('expired: offers a new attempt without blaming Bitkit or showing a payment spinner', () => {
    const onRetry = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog('expired', { onRetry, onOpenChange });

    expect(screen.getByText('The payment was not completed. You can try again.')).toBeInTheDocument();
    expect(screen.queryByText(/when Bitkit is ready/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'App Store' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Play' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('The payment is still running')).not.toBeInTheDocument();
  });

  it('expired: disables the new attempt while its submission is in flight', () => {
    renderDialog('expired', { isSubmitting: true });
    expect(document.querySelector('[data-cy="pay-to-unlock-retry"]')).toBeDisabled();
  });

  it('install: shows the setup steps, the store links and the I completed the steps button, and no QR', () => {
    const onRetry = vi.fn();
    renderDialog('install', { onRetry, handshakePubky: 'pubkylockcreator' });

    expect(screen.getByText(/Install Bitkit/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'App Store' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Play' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy creator pubky' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Bitkit' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'I completed the steps' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // Nothing to cancel past submission — the purchase continues server-side, so the button only closes.
  it('waiting: asks the reader to check for a request, with no primary button and Close instead of Cancel', () => {
    renderDialog('waiting', { connectionState: 'connected' });

    expect(screen.getByText(/Review and confirm it there when it appears/)).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy creator pubky' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again|I completed the steps/ })).not.toBeInTheDocument();
    // The footer button reads Close (the X in the corner is also named Close, hence the data-cy hook).
    expect(document.querySelector('[data-cy="pay-to-unlock-cancel"]')).toHaveTextContent('Close');
  });

  // An unknown link says nothing about payment-request delivery.
  it('waiting: says it is checking the connection until the link state is known', () => {
    const { rerender } = renderDialog('waiting', { isConnectionPending: true });

    expect(screen.getByText('Checking your Bitkit connection…')).toBeInTheDocument();
    expect(screen.queryByText(/Check Bitkit for a payment request/)).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy creator pubky' })).not.toBeInTheDocument();

    rerender(dialogElement('waiting', { connectionState: 'connected' }));
    expect(screen.getByText(/Review and confirm it there when it appears/)).toBeInTheDocument();
    expect(screen.queryByText('Checking your Bitkit connection…')).not.toBeInTheDocument();
  });

  it.each([
    ['none', /is not ready yet/],
    ['handshake', /Connecting to this creator/],
  ] as const)('waiting: keeps the %s message and handoff while rechecking a parked wait', (connectionState, copy) => {
    const state = { connectionState, handshakePubky: 'lockcreator' };
    const { rerender } = renderDialog('waiting', { ...state, isStalled: true });

    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();

    rerender(dialogElement('waiting', { ...state, isConnectionPending: true }));

    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByText('Checking your Bitkit connection…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy creator pubky' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Bitkit' })).toBeInTheDocument();
    expect(screen.queryAllByRole('status', { name: 'Loading' })).toHaveLength(connectionState === 'handshake' ? 1 : 0);
  });

  it('waiting: stops the handshake loader when polling parks and keeps the contact handoff', () => {
    const onRecheck = vi.fn();
    const state = { connectionState: 'handshake', handshakePubky: 'lockcreator', onRecheck } as const;
    const { rerender } = renderDialog('waiting', state);

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    rerender(dialogElement('waiting', { ...state, isStalled: true }));

    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Connecting to this creator/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy creator pubky' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Bitkit' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  // Notices and the parked prompt take precedence over a pending connection read.
  it.each([
    ['the wallet setup notice', { walletSetupNeeded: true }, /Finish setting up Bitkit/],
    ['the blocked notice', { connectionState: 'blocked' }, /cannot receive payments from you/],
    [
      'the recovery notice',
      { connectionState: 'recovery_required', handshakePubky: 'lockcreator' },
      /needs to be restored/,
    ],
    ['the parked copy', { isStalled: true }, /This purchase is still pending/],
  ] as const)('waiting + pending link read: shows %s instead of the checking copy', (_name, state, copy) => {
    renderDialog('waiting', { isConnectionPending: true, ...state });

    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByText('Checking your Bitkit connection…')).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it('waiting: shows the creator pubky QR while the hook hands one over', () => {
    const { rerender } = renderDialog('waiting', { handshakePubky: 'lockcreator' });

    expect(screen.getByRole('button', { name: 'Copy creator pubky' })).toBeInTheDocument();
    expect(screen.getByTestId('qr-code')).toHaveAttribute('data-value', 'pubkylockcreator');
    // The QR screen stays clean: setup belongs to the install screen.
    expect(screen.queryByText(/Install Bitkit/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'App Store' })).not.toBeInTheDocument();

    rerender(dialogElement('waiting', { handshakePubky: 'pubkylockcreator' }));
    expect(screen.getByTestId('qr-code')).toHaveAttribute('data-value', 'pubkylockcreator');

    rerender(dialogElement('waiting'));
    expect(screen.queryByRole('button', { name: 'Copy creator pubky' })).not.toBeInTheDocument();
  });

  it.each(['none', 'handshake', 'recovery_required'] as const)(
    'waiting: copies the QR value while the connection is %s',
    async (connectionState) => {
      mocks.copyToClipboard.mockResolvedValue(undefined);
      renderDialog('waiting', { connectionState, handshakePubky: 'lockcreator' });

      fireEvent.click(screen.getByRole('button', { name: 'Copy creator pubky' }));

      await vi.waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith({
          variant: 'info',
          title: 'Pubky copied to clipboard',
          dismissButton: true,
        }),
      );
      expect(mocks.copyToClipboard).toHaveBeenCalledWith({ text: 'pubkylockcreator' });
    },
  );

  // A rejected clipboard write must not be reported as copied.
  it('waiting: reports a failed QR copy', async () => {
    mocks.copyToClipboard.mockRejectedValue(new Error('denied'));
    renderDialog('waiting', { handshakePubky: 'lockcreator' });

    fireEvent.click(screen.getByRole('button', { name: 'Copy creator pubky' }));

    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not copy to clipboard' }),
    );
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }));
  });

  // A phone cannot scan its own screen, so the link must hand Bitkit the value the QR carries.
  it('waiting: the Bitkit handoff links to the contact deeplink with the QR value', () => {
    const { rerender } = renderDialog('waiting', { handshakePubky: 'lockcreator' });
    const href = 'bitkit://contact?pubky=pubkylockcreator';

    expect(screen.getByRole('link', { name: 'Open in Bitkit' })).toHaveAttribute('href', href);

    rerender(dialogElement('waiting', { handshakePubky: 'pubkylockcreator' }));
    expect(screen.getByRole('link', { name: 'Open in Bitkit' })).toHaveAttribute('href', href);

    // The handoff leaves with the QR: with no pubky there is nothing to hand over.
    rerender(dialogElement('waiting'));
    expect(screen.queryByRole('link', { name: 'Open in Bitkit' })).not.toBeInTheDocument();
  });

  it('waiting: shows the blocked notice without a handoff or spinner', () => {
    renderDialog('waiting', { connectionState: 'blocked' });

    expect(screen.getByText(/cannot receive payments/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy creator pubky' })).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });

  it.each(['none', 'handshake', 'recovery_required', 'connected'] as const)(
    'waiting: asks for wallet setup while %s, with no handoff or spinner',
    (connectionState) => {
      renderDialog('waiting', { connectionState, walletSetupNeeded: true });

      expect(screen.getByText('Finish setting up Bitkit, then keep it open.')).toBeInTheDocument();
      expect(screen.queryByText(/Check Bitkit for a payment request/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Copy creator pubky' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Open in Bitkit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    },
  );

  // Parked is not failed: a reader who never leaves the tab gets no visibility event, so the only
  // way back to a live purchase is an explicit re-check.
  it('waiting + stalled: replaces the request copy with the Check again prompt', () => {
    const onRecheck = vi.fn();
    renderDialog('waiting', { isStalled: true, onRecheck });

    expect(screen.queryByText(/Check Bitkit for a payment request/)).not.toBeInTheDocument();
    expect(screen.getByText(/This purchase is still pending/)).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  // A notice says something the parked copy does not, so it stays.
  it.each([
    ['a link notice', { connectionState: 'blocked' as const }, /cannot receive payments/],
    [
      'the recovery notice',
      { connectionState: 'recovery_required' as const, handshakePubky: 'lockcreator' },
      /needs to be restored/,
    ],
    ['the wallet setup notice', { walletSetupNeeded: true }, /Finish setting up Bitkit/],
  ])('waiting + stalled: keeps %s next to the Check again prompt', (_name, notice, copy) => {
    renderDialog('waiting', { isStalled: true, ...notice });

    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByText(/This purchase is still pending/)).toBeInTheDocument();
  });

  it('checking: renders no primary button while the purchase state resolves', () => {
    renderDialog('checking');
    expect(screen.queryByRole('button', { name: /Try again|I completed the steps/ })).not.toBeInTheDocument();
  });

  it('blocked: explains the failed check and offers no way to pay', () => {
    renderDialog('blocked');
    expect(screen.getByText(/could not be checked/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again|I completed the steps/ })).not.toBeInTheDocument();
  });

  it('paid: shows the Figma confirmation state and reveals content only from its button', () => {
    const onViewContent = vi.fn();
    renderDialog('paid', { onViewContent });

    expect(screen.getByRole('heading', { name: 'Unlocked' })).toBeInTheDocument();
    expect(screen.getByText('PAYMENT RECEIVED')).toHaveClass('text-brand');
    expect(screen.getByText('₿ 1,000')).toBeInTheDocument();
    expect(screen.getByText('Thank you for supporting creators!')).toBeInTheDocument();
    expect(document.querySelector('.lucide-circle-check')).toHaveClass('size-[72px]');
    expect(document.querySelector('.lucide-circle-check')).toHaveAttribute('stroke-width', '0.5');
    expect(document.querySelector('[data-cy="pay-to-unlock-cancel"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Content' }));
    expect(onViewContent).toHaveBeenCalledTimes(1);
  });

  it('paid: closing reveals the content already in memory', () => {
    const onViewContent = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog('paid', { onViewContent, onOpenChange });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onViewContent).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('finishing: shows the received payment and loading state without payment instructions or actions', () => {
    renderDialog('finishing');

    expect(screen.getByText('PAYMENT RECEIVED')).toHaveClass('text-brand');
    expect(screen.getByText('Opening your content…')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText(/Check Bitkit|COST TO UNLOCK|Thank you for supporting/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again|View Content|Copy creator pubky/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open in Bitkit' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-cy="pay-to-unlock-cancel"]')).toHaveTextContent('Close');
  });

  it('finishing: a parked content check offers Check again without sending the reader to Bitkit', () => {
    const onRecheck = vi.fn();
    renderDialog('finishing', { isStalled: true, onRecheck });

    expect(screen.getByText('Your payment is complete. Check again to open the content.')).toBeInTheDocument();
    expect(screen.queryByText(/Check Bitkit|Opening your content/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('finishing: closing still asks first and acknowledges the completed payment', () => {
    const onOpenChange = vi.fn();
    renderDialog('finishing', { onOpenChange });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(screen.getByRole('heading', { name: 'Payment received' })).toBeInTheDocument();
    expect(screen.queryByText(/The payment is still running|has not finished yet/)).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('updates an open close prompt when the payment completes before the content is ready', () => {
    const overrides = { onViewContent: vi.fn(), onOpenChange: vi.fn() };
    const { rerender } = renderDialog('waiting', overrides);
    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);

    rerender(dialogElement('finishing', overrides));
    expect(screen.getByRole('heading', { name: 'Payment received' })).toBeInTheDocument();
    expect(screen.queryByText(/has not finished yet/)).not.toBeInTheDocument();

    rerender(dialogElement('paid', overrides));
    fireEvent.click(screen.getByRole('button', { name: 'Close anyway' }));
    expect(overrides.onViewContent).toHaveBeenCalledTimes(1);
    expect(overrides.onOpenChange).not.toHaveBeenCalled();
  });

  // A completed purchase must not ask the reader to make another payment.
  it('unopened: says the payment landed and offers the retry, with no cost to pay', () => {
    const onRecheck = vi.fn();
    renderDialog('unopened', { onRecheck });

    expect(screen.getByText('PAYMENT RECEIVED')).toHaveClass('text-brand');
    expect(screen.getByText(/could not be opened/)).toBeInTheDocument();
    expect(screen.queryByText(/Check Bitkit/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-recheck"]') as HTMLElement);
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  // Nothing is running behind it, so this close needs no confirmation.
  it('unopened: closes without asking', () => {
    const onOpenChange = vi.fn();
    renderDialog('unopened', { onOpenChange });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('The payment is still running')).not.toBeInTheDocument();
  });

  it('waiting: the close button asks before it closes', () => {
    const onOpenChange = vi.fn();
    renderDialog('waiting', { onOpenChange });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(screen.getByText('The payment is still running')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('waiting: Keep waiting dismisses the prompt and leaves the modal open', () => {
    const onOpenChange = vi.fn();
    renderDialog('waiting', { onOpenChange });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-keep-waiting"]') as HTMLElement);
    expect(screen.queryByText('The payment is still running')).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // The parent closes the modal itself on an expired session, past the prompt's own buttons.
  it('does not bring the close prompt back after the parent closes the modal', () => {
    const { rerender } = renderDialog('waiting');

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(screen.getByText('The payment is still running')).toBeInTheDocument();

    rerender(dialogElement('waiting', { open: false }));
    rerender(dialogElement('checking'));
    expect(screen.getByText('My locked post')).toBeInTheDocument();
    expect(screen.queryByText('The payment is still running')).not.toBeInTheDocument();
  });

  it('waiting: Close anyway closes the modal', () => {
    const onOpenChange = vi.fn();
    renderDialog('waiting', { onOpenChange });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-close-anyway"]') as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // Polling never stopped under the prompt, so the payment can land while it is up. Closing then
  // must reveal the content already downloaded — dropping it leaves the background recovery to mint
  // a second credential and fetch the same post again.
  it('waiting: Close anyway reveals content that arrived while the prompt was up', () => {
    const overrides = { onViewContent: vi.fn(), onOpenChange: vi.fn() };
    const { rerender } = renderDialog('waiting', overrides);

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(screen.getByText('The payment is still running')).toBeInTheDocument();

    rerender(dialogElement('paid', overrides));
    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-close-anyway"]') as HTMLElement);

    expect(overrides.onViewContent).toHaveBeenCalledTimes(1);
    expect(overrides.onOpenChange).not.toHaveBeenCalled();
  });

  // Nothing is in flight on the retry screen, so that close needs no prompt.
  it('retry: the cancel button closes without asking', () => {
    const onOpenChange = vi.fn();
    renderDialog('retry', { onOpenChange });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('The payment is still running')).not.toBeInTheDocument();
  });

  // Install only runs the wallet check (the hook moves to checking before it submits), and closing
  // cancels that check, so this close needs no prompt.
  it('install: the cancel button closes without asking, even during the wallet check', () => {
    const onOpenChange = vi.fn();
    renderDialog('install', { onOpenChange, isSubmitting: true });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('The payment is still running')).not.toBeInTheDocument();
  });

  // The submission is in flight before the stage flips to waiting; closing then must still ask.
  it('checking: asks before closing while the automatic submission is in flight', () => {
    const onOpenChange = vi.fn();
    renderDialog('checking', { onOpenChange, isSubmitting: true });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('The payment is still running')).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-close-anyway"]') as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('locks the primary button while a submission is in flight', () => {
    renderDialog('retry', { isSubmitting: true });
    expect(document.querySelector('[data-cy="pay-to-unlock-retry"]')).toBeDisabled();
  });

  // Escape goes through Radix, not the footer button, so the confirm prompt has to catch that path too.
  it('waiting: Escape asks before closing', () => {
    const onOpenChange = vi.fn();
    renderDialog('waiting', { onOpenChange });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByText('The payment is still running')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // The dialog is portaled, but React still bubbles its clicks to the post card, which would navigate.
  it('clicks inside the dialog do not reach the post card', () => {
    const cardClick = vi.fn();
    renderDialog('retry', { wrapper: ({ children }) => <div onClick={cardClick}>{children}</div> });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(cardClick).not.toHaveBeenCalled();
  });
});
