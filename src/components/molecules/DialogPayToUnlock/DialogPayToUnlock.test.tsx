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

const renderDialog = (
  stage: TPayToUnlockStage,
  overrides: {
    isSubmitting?: boolean;
    onSubmit?: () => void;
    isStalled?: boolean;
    onRecheck?: () => void;
    onViewContent?: () => void;
    onOpenChange?: (open: boolean) => void;
    wrapper?: React.JSXElementConstructor<{ children: React.ReactNode }>;
  } = {},
) =>
  render(
    <DialogPayToUnlock
      open
      onOpenChange={overrides.onOpenChange ?? vi.fn()}
      lockTitle="My locked post"
      authorId="pubkycreator"
      priceSats="1000"
      stage={stage}
      isStalled={overrides.isStalled ?? false}
      isSubmitting={overrides.isSubmitting ?? false}
      onSubmit={overrides.onSubmit ?? vi.fn()}
      onRecheck={overrides.onRecheck ?? vi.fn()}
      onViewContent={overrides.onViewContent ?? vi.fn()}
    />,
    { wrapper: overrides.wrapper },
  );

describe('DialogPayToUnlock', () => {
  it('always shows the grouped price and the creator', () => {
    renderDialog('pay');
    expect(screen.getByText('₿ 1,000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'J' })).toHaveAttribute('href', '/profile/pubkycreator');
  });

  // The wallet may live on another device, so the store links stay next to the price on both screens.
  it('shows the Bitkit links on the pay screen too', () => {
    renderDialog('pay');
    expect(screen.getByRole('link', { name: 'App Store' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Play' })).toBeInTheDocument();
  });

  it('pay: shows the Bitkit instruction and the Pay button', () => {
    const onSubmit = vi.fn();
    renderDialog('pay', { onSubmit });

    fireEvent.click(screen.getByRole('button', { name: 'Pay with Bitkit' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('install: shows the setup steps, store links, and the completed-steps button', () => {
    const onSubmit = vi.fn();
    renderDialog('install', { onSubmit });

    expect(screen.getByText(/Install Bitkit/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'App Store' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Play' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I completed the steps' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // Nothing to cancel past submission — the purchase continues server-side, so the button only closes.
  it('waiting: shows the awaiting label, no primary button, and Close instead of Cancel', () => {
    renderDialog('waiting');

    expect(screen.getByText('AWAITING PAYMENT')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay with Bitkit|I completed the steps/ })).not.toBeInTheDocument();
    // The footer button reads Close (the X in the corner is also named Close, hence the data-cy hook).
    expect(document.querySelector('[data-cy="pay-to-unlock-cancel"]')).toHaveTextContent('Close');
  });

  // Parked is not failed: a reader who never leaves the tab gets no visibility event, so the only
  // way back to a live purchase is an explicit re-check.
  it('waiting + stalled: swaps the spinner for a Check again button', () => {
    const onRecheck = vi.fn();
    renderDialog('waiting', { isStalled: true, onRecheck });

    expect(screen.queryByText('AWAITING PAYMENT')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('checking: renders no primary button while the purchase state resolves', () => {
    renderDialog('checking');
    expect(screen.queryByRole('button', { name: /Pay with Bitkit|I completed the steps/ })).not.toBeInTheDocument();
  });

  it('blocked: explains the failed check and offers no way to pay', () => {
    renderDialog('blocked');
    expect(screen.getByText(/could not be checked/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay with Bitkit|I completed the steps/ })).not.toBeInTheDocument();
  });

  it('paid: shows the Figma confirmation state and reveals content only from its button', () => {
    const onViewContent = vi.fn();
    renderDialog('paid', { onViewContent });

    expect(screen.getByRole('heading', { name: 'Unlocked' })).toBeInTheDocument();
    expect(screen.getByText('PAYMENT RECEIVED')).toHaveClass('text-brand');
    expect(screen.getByText('₿ 1,000')).toBeInTheDocument();
    expect(screen.getByText('Unlocked. Thank you for supporting creators!')).toBeInTheDocument();
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

  // Nothing is in flight before the payment starts, so that close needs no prompt.
  it('pay: the cancel button closes without asking while nothing has been submitted', () => {
    const onOpenChange = vi.fn();
    renderDialog('pay', { onOpenChange });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('The payment is still running')).not.toBeInTheDocument();
  });

  // The submission is in flight before the stage flips to waiting; closing then must still ask.
  it('pay: asks before closing while a submission is in flight', () => {
    const onOpenChange = vi.fn();
    renderDialog('pay', { onOpenChange, isSubmitting: true });

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-cancel"]') as HTMLElement);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('The payment is still running')).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-cy="pay-to-unlock-close-anyway"]') as HTMLElement);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('locks the primary button while a submission is in flight', () => {
    renderDialog('pay', { isSubmitting: true });
    expect(document.querySelector('[data-cy="pay-to-unlock-submit"]')).toBeDisabled();
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
    renderDialog('pay', { wrapper: ({ children }) => <div onClick={cardClick}>{children}</div> });

    fireEvent.click(screen.getByRole('button', { name: 'Pay with Bitkit' }));
    expect(cardClick).not.toHaveBeenCalled();
  });
});
