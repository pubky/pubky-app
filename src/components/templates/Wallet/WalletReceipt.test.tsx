import type { Activity, DrainProgress, ReceiveRequest, SendReview } from '@beignet/wallet-core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityReceipt, SendReceipt, type SendSubmission } from './WalletReceipt';

const startedAt = Date.UTC(2026, 0, 1);
const review: SendReview = {
  id: 'send-1',
  destination: 'lnbcrt1example',
  description: 'Coffee',
  amountSats: 47,
  feeSats: 3,
  feeLabel: 'Fee limit',
  totalSats: 50,
  route: 'lightning',
  expiresAt: startedAt + 60_000,
  warnings: [],
};
const paymentHash = 'ab'.repeat(32);
const pending = {
  startedAt,
  review,
  result: {
    id: review.id,
    amountSats: 47,
    feeSats: 3,
    feeKnown: true,
    feeEstimated: true,
    message: 'Submitted.',
    status: 'pending',
    paymentHash,
  },
} satisfies SendSubmission;
const settled: Activity = {
  id: `payment:${paymentHash}`,
  kind: 'sent',
  title: 'Payment sent',
  description: 'Coffee',
  status: 'completed',
  amountSats: 47,
  feeSats: 2,
  feeKnown: true,
  reference: paymentHash,
  paymentHash,
  timestamp: startedAt + 3000,
};

describe('Wallet receipts', () => {
  it('settles a pending send in place only for the same outgoing payment', () => {
    const { rerender } = render(
      <SendReceipt
        submission={pending}
        activity={[
          { ...settled, id: 'incoming', kind: 'received' },
          { ...settled, id: 'unrelated', paymentHash: 'cd'.repeat(32) },
          { ...settled, status: 'failed', timestamp: startedAt - 1000 },
          { ...settled, id: 'submission:other-attempt', status: 'failed' },
        ]}
      />,
    );
    const amount = screen.getByText('₿47');
    expect(screen.getByRole('status')).toHaveTextContent('Payment pending');
    expect(screen.getByText('Estimated fee')).toBeVisible();
    rerender(<SendReceipt submission={pending} activity={[settled]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payment sent');
    expect(screen.getByText('₿47')).toBe(amount);
    expect(screen.getByText('Fee paid')).toBeVisible();
    expect(screen.queryByText('Submitted.')).toBeNull();
    rerender(<SendReceipt submission={pending} activity={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payment sent');
  });

  it('moves an unknown send to pending only when the engine identifies the submitted payment', () => {
    const submission = { ...pending, result: { ...pending.result, status: 'uncertain' as const } };
    const pendingRow: Activity = { ...settled, status: 'pending' };
    const { rerender } = render(
      <SendReceipt
        submission={submission}
        activity={[
          { ...pendingRow, id: `submission:${review.id}` },
          { ...pendingRow, id: 'unrelated', paymentHash: 'cd'.repeat(32) },
        ]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Payment status unknown');
    rerender(<SendReceipt submission={submission} activity={[pendingRow]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payment pending');
    expect(screen.queryByText('Check Activity before trying another payment.')).toBeNull();
    rerender(<SendReceipt submission={submission} activity={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payment pending');
    rerender(<SendReceipt submission={submission} activity={[settled]} />);
    rerender(<SendReceipt submission={submission} activity={[pendingRow]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payment sent');
  });

  it('keeps the exact Pay All minimum readable until the wallet reports settlement', () => {
    const submission = {
      startedAt,
      review: { ...review, max: true as const, minRecipientSats: 47, debitMsat: '50025', maxFeeMsat: '3000' },
    };
    const { rerender } = render(<SendReceipt submission={submission} />);
    expect(screen.getByText('Reviewed minimum')).toBeVisible();
    expect(screen.getByText('₿47 + 25 msat')).toBeVisible();
    rerender(
      <SendReceipt
        submission={{
          ...submission,
          result: {
            ...pending.result,
            status: 'completed',
            feeEstimated: false,
            payAll: {
              debitMsat: '50025',
              maxFeeMsat: '3000',
              deliveredMsat: '48500',
              feeMsat: '1525',
              remainderMsat: '0',
            },
          },
        }}
      />,
    );
    expect(screen.getByText('₿48 + 500 msat')).toBeVisible();
    expect(screen.getByText('₿1 + 525 msat')).toBeVisible();
    expect(screen.queryByText('Reviewed minimum')).toBeNull();
  });

  it('revises a completed drain only when its coordinator reports a newer revision', () => {
    const drain: DrainProgress = {
      requestId: review.id,
      address: 'bcrt1example',
      revision: 3,
      phase: 'completed',
      amountSats: 47,
      feeSats: 3,
      debitSats: 50,
      reviewedDebitSats: 50,
      closeAmountSats: 47,
      closeFeeSats: 3,
      sweepAmountSats: 0,
      sweepFeeSats: 0,
      feeEstimated: false,
      txids: ['tx1'],
      createdAt: startedAt,
      expiresAt: review.expiresAt,
    };
    const submission = { ...pending, result: { ...pending.result, status: 'completed' as const, drain } };
    const row: Activity = {
      ...settled,
      id: `drain:${review.id}`,
      status: 'pending',
      drain: { ...drain, phase: 'pending', revision: 2 },
    };
    const { rerender } = render(<SendReceipt submission={submission} activity={[row]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payment sent');
    rerender(
      <SendReceipt
        submission={submission}
        activity={[{ ...row, drain: { ...drain, phase: 'pending', revision: 4 } }]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Payment pending');
    rerender(<SendReceipt submission={submission} activity={[row]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payment pending');
  });

  it('shows the observed partial amount and remaining balance without claiming offline settlement', () => {
    const request: ReceiveRequest = {
      id: 'request-1',
      paymentHash,
      uri: 'bitcoin:example',
      bolt11: 'lnbcrt1example',
      amountSats: 100,
      feeSats: 0,
      description: 'Coffee',
      expiresAt: startedAt + 60000,
      warnings: [],
      demo: true,
    };
    const row: Activity = {
      ...settled,
      kind: 'received',
      status: 'pending',
      amountSats: 100,
      feeKnown: false,
      receiveRequest: request,
      receiveStatus: { phase: 'partial', receivedSats: 40, confirmedSats: 40, pendingSats: 0, txids: [] },
    };
    render(<ActivityReceipt row={row} receivedWhileAway />);
    expect(screen.getByRole('status')).toHaveTextContent('Partially paid');
    expect(screen.getByText('₿40')).toBeVisible();
    expect(screen.getByText('Amount remaining')).toBeVisible();
    expect(screen.getByText('₿60')).toBeVisible();
    expect(screen.queryByText('Received while you were away')).toBeNull();
    expect(screen.queryByText('Fee paid')).toBeNull();
  });

  it.each(['failed', 'uncertain', 'expired'] as const)(
    'keeps a %s payment distinct from a successful receipt',
    (status) => {
      const row: Activity = { ...settled, kind: status === 'expired' ? 'request' : 'sent', status, feeKnown: false };
      render(<ActivityReceipt row={row} receivedWhileAway />);
      expect(screen.queryByText('Payment sent')).toBeNull();
      expect(screen.queryByText('Received while you were away')).toBeNull();
      expect(
        screen.getByText(
          status === 'uncertain'
            ? 'Payment status unknown'
            : status === 'expired'
              ? 'Request expired'
              : 'Payment failed',
        ),
      ).toBeVisible();
    },
  );
});
