import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TPayToUnlockStage } from '@/hooks/usePayToUnlock/usePayToUnlock.types';
import { DialogPayToUnlock } from './DialogPayToUnlock';

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: () => ({ profile: { name: 'John Carvalho', avatarUrl: undefined }, isLoading: false }),
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
  isSubmitting?: boolean;
  onRetry?: () => void;
  isStalled?: boolean;
  handshakePubky?: string | null;
  connectionIssue?: 'recovery_required' | 'blocked' | null;
  onRecheck?: () => void;
  onViewContent?: () => void;
  onOpenChange?: (open: boolean) => void;
  wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>;
};

const dialogElement = (stage: TPayToUnlockStage, overrides: DialogOverrides = {}) => (
  <DialogPayToUnlock
    open
    onOpenChange={overrides.onOpenChange ?? vi.fn()}
    lockTitle="My locked post"
    authorId="pubkycreator"
    priceSats="1000"
    stage={stage}
    isStalled={overrides.isStalled ?? false}
    handshakePubky={overrides.handshakePubky ?? null}
    connectionIssue={overrides.connectionIssue ?? null}
    isSubmitting={overrides.isSubmitting ?? false}
    onRetry={overrides.onRetry ?? vi.fn()}
    onRecheck={overrides.onRecheck ?? vi.fn()}
    onViewContent={overrides.onViewContent ?? vi.fn()}
  />
);

const renderDialog = (stage: TPayToUnlockStage, overrides: DialogOverrides = {}) =>
  render(dialogElement(stage, overrides), { wrapper: overrides.wrapper });

describe('DialogPayToUnlock', () => {
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

  it('retry: shows the Bitkit instruction and the Try again button', () => {
    const onRetry = vi.fn();
    renderDialog('retry', { onRetry });

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('install: shows the setup steps, the store links and the I completed the steps button, and no QR', () => {
    const onRetry = vi.fn();
    renderDialog('install', { onRetry, handshakePubky: 'pubkylockcreator' });

    expect(screen.getByText(/Install Bitkit/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'App Store' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Play' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Creator Pubky QR code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay with Bitkit' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'I completed the steps' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // Nothing to cancel past submission — the purchase continues server-side, so the button only closes.
  it('waiting: asks the reader to confirm in Bitkit, with no primary button and Close instead of Cancel', () => {
    renderDialog('waiting');

    // Desktop leads with "Awaiting payment."; mobile moves that under the spinner.
    expect(screen.getByText('Awaiting payment.')).toBeInTheDocument();
    expect(screen.getByText('Please confirm in Bitkit.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Creator Pubky QR code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again|I completed the steps/ })).not.toBeInTheDocument();
    // The footer button reads Close (the X in the corner is also named Close, hence the data-cy hook).
    expect(document.querySelector('[data-cy="pay-to-unlock-cancel"]')).toHaveTextContent('Close');
  });

  it('waiting: shows the creator pubky QR while the hook hands one over', () => {
    const { rerender } = renderDialog('waiting', { handshakePubky: 'lockcreator' });

    expect(screen.getByRole('img', { name: 'Creator Pubky QR code' })).toBeInTheDocument();
    expect(screen.getByTestId('qr-code')).toHaveAttribute('data-value', 'pubkylockcreator');
    expect(screen.getByText('Scan with Bitkit and pay to unlock.')).toBeInTheDocument();
    // The QR screen stays clean: setup belongs to the install screen.
    expect(screen.queryByText(/Install Bitkit/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'App Store' })).not.toBeInTheDocument();

    rerender(dialogElement('waiting', { handshakePubky: 'pubkylockcreator' }));
    expect(screen.getByTestId('qr-code')).toHaveAttribute('data-value', 'pubkylockcreator');

    rerender(dialogElement('waiting'));
    expect(screen.queryByRole('img', { name: 'Creator Pubky QR code' })).not.toBeInTheDocument();
  });

  // A phone cannot scan its own screen, so the link must hand Bitkit the value the QR carries.
  it('waiting: the Bitkit handoff links to the contact deeplink with the QR value', () => {
    const { rerender } = renderDialog('waiting', { handshakePubky: 'lockcreator' });
    const href = 'bitkit://contact?pubky=pubkylockcreator';

    expect(screen.getByRole('link', { name: 'Pay with Bitkit' })).toHaveAttribute('href', href);

    rerender(dialogElement('waiting', { handshakePubky: 'pubkylockcreator' }));
    expect(screen.getByRole('link', { name: 'Pay with Bitkit' })).toHaveAttribute('href', href);

    // The handoff leaves with the QR: with no pubky there is nothing to hand over.
    rerender(dialogElement('waiting'));
    expect(screen.queryByRole('link', { name: 'Pay with Bitkit' })).not.toBeInTheDocument();
  });

  it.each([
    ['blocked', /cannot receive payments/],
    ['recovery_required', /is being restored/],
  ] as const)('waiting: replaces the QR with a notice for %s', (connectionIssue, copy) => {
    renderDialog('waiting', { connectionIssue });

    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Creator Pubky QR code' })).not.toBeInTheDocument();
  });

  // Parked is not failed: a reader who never leaves the tab gets no visibility event, so the only
  // way back to a live purchase is an explicit re-check.
  it('waiting + stalled: replaces the awaiting copy with the Check again prompt', () => {
    const onRecheck = vi.fn();
    renderDialog('waiting', { isStalled: true, onRecheck });

    expect(screen.queryByText('Please confirm in Bitkit.')).not.toBeInTheDocument();
    expect(screen.getByText(/Still waiting for the payment/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  // The link notice says something the parked copy does not, so it stays.
  it('waiting + stalled: keeps a link notice next to the Check again prompt', () => {
    renderDialog('waiting', { isStalled: true, connectionIssue: 'blocked' });

    expect(screen.getByText(/cannot receive payments/)).toBeInTheDocument();
    expect(screen.getByText(/Still waiting for the payment/)).toBeInTheDocument();
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

  // The payment went through here, so the waiting copy ("pay in Bitkit, then check again") would
  // be telling a reader who already paid to pay again.
  it('unopened: says the payment landed and offers the retry, with no cost to pay', () => {
    const onRecheck = vi.fn();
    renderDialog('unopened', { onRecheck });

    expect(screen.getByText('PAYMENT RECEIVED')).toHaveClass('text-brand');
    expect(screen.getByText(/could not be opened/)).toBeInTheDocument();
    expect(screen.queryByText(/Pay in Bitkit/)).not.toBeInTheDocument();
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
