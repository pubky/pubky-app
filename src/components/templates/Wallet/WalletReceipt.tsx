'use client';

import { useEffect, useState } from 'react';
import type { Activity, PaymentStatus, ReceiveStatus, SendResult, SendReview } from '@beignet/wallet-core';
import { CircleAlert, Clock3, X } from 'lucide-react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { bitcoinAmount, lightningAmount, walletMessage } from '@/libs/wallet/amount';
import { Detail } from './WalletPanel';

export function WalletBalance({ amount }: { amount: number }) {
  const reduced = useReducedMotion();
  const value = useMotionValue(amount);
  const formatted = useTransform(value, (n) => bitcoinAmount(Math.round(n)));
  useEffect(() => {
    if (reduced || value.get() === amount) {
      value.set(amount);
      return;
    }
    const animation = animate(value, amount, { duration: 0.38, ease: [0.22, 1, 0.36, 1] });
    return () => animation.stop();
  }, [amount, reduced, value]);
  return (
    <span role="group" aria-label={bitcoinAmount(amount)}>
      <motion.span aria-hidden="true">{formatted}</motion.span>
    </span>
  );
}

function ReceiptSummary({
  status,
  title,
  amount,
  amountLabel,
  minimum = false,
  note,
  animateEntrance = false,
  announce = true,
}: {
  status: PaymentStatus;
  title: string;
  amount: string;
  amountLabel?: string;
  minimum?: boolean;
  note?: string;
  animateEntrance?: boolean;
  announce?: boolean;
}) {
  const reduced = useReducedMotion();
  const [initialStatus] = useState(status);
  const draw = !reduced && (animateEntrance || initialStatus !== 'completed');
  const Icon = status === 'uncertain' ? CircleAlert : status === 'failed' ? X : Clock3;
  return (
    <div className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-6 text-center">
      {status === 'completed' ? (
        <motion.svg
          aria-hidden="true"
          viewBox="0 0 56 56"
          className="mb-1 size-14 text-brand"
          fill="none"
          initial={draw ? { scale: 0.85 } : false}
          animate={{ scale: 1 }}
          transition={{ duration: draw ? 0.32 : 0, ease: [0.22, 1, 0.36, 1] }}
        >
          <circle cx="28" cy="28" r="26" fill="currentColor" opacity="0.12" />
          <motion.path
            d="m16.5 28 7.5 7.5 15-15"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={draw ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: draw ? 0.28 : 0, delay: draw ? 0.06 : 0 }}
          />
        </motion.svg>
      ) : (
        <span
          aria-hidden
          className="mb-1 grid size-14 place-items-center rounded-full bg-background text-muted-foreground"
        >
          <Icon className="size-7" />
        </span>
      )}
      <div role={announce ? 'status' : undefined} aria-atomic={announce || undefined} className="grid w-full gap-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-3xl leading-tight font-bold tracking-tight wrap-anywhere tabular-nums">
          {minimum ? (
            <span className="block text-xs font-medium tracking-normal text-muted-foreground">Reviewed minimum</span>
          ) : (
            amountLabel && <span className="sr-only">{amountLabel} </span>
          )}
          {amount}
        </p>
      </div>
      {note && <p className="max-w-full text-sm wrap-anywhere text-muted-foreground">{note}</p>}
    </div>
  );
}

export function WalletReceipt({
  receipt,
  description,
  animateEntrance,
  receivedWhileAway = false,
}: {
  receipt: ReceiveStatus;
  description: string;
  animateEntrance: boolean;
  receivedWhileAway?: boolean;
}) {
  return (
    <ReceiptSummary
      status="completed"
      title={receivedWhileAway ? 'Received while you were away' : 'Payment received'}
      amount={bitcoinAmount(receipt.receivedSats)}
      note={description}
      animateEntrance={animateEntrance}
      announce={false}
    />
  );
}

function paymentAmount(payment: Activity | SendResult) {
  return payment.payAll ? lightningAmount(payment.payAll.deliveredMsat) : bitcoinAmount(payment.amountSats);
}

export function reviewedRecipientAmount(review: SendReview) {
  if (review.debitMsat && review.maxFeeMsat) {
    return lightningAmount((BigInt(review.debitMsat) - BigInt(review.maxFeeMsat)).toString());
  }
  return bitcoinAmount(review.minRecipientSats ?? review.amountSats);
}

export function activityReceiptAmount(row: Activity) {
  if (row.kind === 'request' && row.receiveRequest?.amountSats === null) return 'Any amount';
  if (row.kind === 'received' && row.receiveStatus && row.receiveStatus.phase !== 'waiting') {
    return bitcoinAmount(row.receiveStatus.receivedSats);
  }
  return paymentAmount(row);
}

function paymentTitle(status: PaymentStatus, kind: Activity['kind']) {
  if (status === 'completed') {
    if (kind === 'received') return 'Payment received';
    if (kind === 'sent') return 'Payment sent';
    return kind === 'transfer' ? 'Transfer completed' : 'Request completed';
  }
  if (kind === 'request') {
    if (status === 'expired') return 'Request expired';
    if (status === 'pending') return 'Waiting for payment';
  }
  if (status === 'uncertain') return 'Payment status unknown';
  return `${kind === 'transfer' ? 'Transfer' : 'Payment'} ${status}`;
}

export function activityReceiptTitle(row: Activity) {
  if (row.status === 'pending' && row.receiveStatus?.phase === 'partial') return 'Partially paid';
  if (row.kind === 'request' && row.status === 'pending' && row.receiveStatusUnavailable)
    return 'Payment status unavailable';
  return paymentTitle(row.status, row.kind);
}

function ReceiptDetails({ payment }: { payment: Activity | SendResult }) {
  const row = 'kind' in payment ? payment : undefined;
  const incoming = row?.receiveStatus;
  const txids = new Set(
    [
      ...(payment.drain?.txids ?? []),
      ...(incoming?.txids ?? []),
      incoming?.fundingTxid,
      incoming?.txid,
      payment.txid,
    ].filter((id): id is string => !!id),
  );
  const hash = payment.paymentHash || incoming?.paymentHash;
  const address = row?.address || payment.drain?.address;
  const offlineInvoice = row?.receiveRequest?.offlineReceive === true;
  const showFee = !row || row.kind === 'sent' || row.feeKnown;
  const knownFee = payment.feeKnown || payment.payAll;
  const feePaid = payment.status === 'completed' && (!row || row.kind === 'sent');
  return (
    <dl className="grid gap-2">
      {row && <Detail label="Date" value={new Date(row.timestamp).toLocaleString()} />}
      {offlineInvoice && incoming?.method === 'lightning' && <Detail label="Payment method" value="Lightning" />}
      {incoming?.phase === 'partial' && row?.receiveRequest?.amountSats != null && (
        <Detail
          label="Amount remaining"
          value={bitcoinAmount(Math.max(0, row.receiveRequest.amountSats - incoming.receivedSats))}
        />
      )}
      {showFee && (
        <Detail
          label={payment.feeEstimated ? 'Estimated fee' : feePaid ? 'Fee paid' : 'Fee'}
          value={
            knownFee
              ? payment.payAll
                ? lightningAmount(payment.payAll.feeMsat)
                : bitcoinAmount(payment.feeSats)
              : 'Not yet reported'
          }
        />
      )}
      {address && (!offlineInvoice || incoming?.method === 'bitcoin') && (
        <Detail label="Bitcoin address" value={address} />
      )}
      {Array.from(txids, (txid) => (
        <Detail key={txid} label="Transaction ID" value={txid} />
      ))}
      {hash && <Detail label="Payment hash" value={hash} />}
      {row?.reference && !hash && !txids.has(row.reference) && <Detail label="Reference" value={row.reference} />}
    </dl>
  );
}

export function ActivityReceipt({ row, receivedWhileAway = false }: { row: Activity; receivedWhileAway?: boolean }) {
  const away = receivedWhileAway && row.kind === 'received' && row.status === 'completed';
  return (
    <>
      <ReceiptSummary
        status={row.status}
        title={away ? 'Received while you were away' : activityReceiptTitle(row)}
        amount={activityReceiptAmount(row)}
        note={row.description}
      />
      <ReceiptDetails payment={row} />
    </>
  );
}

export type SendSubmission = { review: SendReview; startedAt: number; result?: SendResult; interrupted?: boolean };

function matchesSubmission({ review, result, startedAt }: SendSubmission, row: Activity) {
  if (row.kind !== 'sent') return false;
  if (row.id === review.id) return true;
  if (row.id.startsWith('submission:')) return row.id === `submission:${review.id}`;
  if (row.id.startsWith('drain:')) return row.id === `drain:${review.id}`;
  // An invoice may be retried after a failed attempt. Its earlier failure cannot resolve the new attempt.
  if (row.status === 'failed' && row.timestamp < startedAt) return false;
  return (
    (result?.txid && row.txid === result.txid) ||
    (result?.paymentHash && row.paymentHash === result.paymentHash) ||
    (result?.channelSend && row.channelSend?.id === result.channelSend.id)
  );
}

function updatesReceipt(previous: Activity | SendResult | undefined, row: Activity) {
  // Only the drain coordinator can reopen a settled send after a reorg.
  if (previous?.drain)
    return row.drain?.requestId === previous.drain.requestId && row.drain.revision > previous.drain.revision;
  if (previous?.status === 'failed') return false;
  if (previous?.status === 'completed') {
    if (row.status !== 'completed' || previous.payAll) return false;
    return !!row.payAll || ((!previous.feeKnown || previous.feeEstimated) && row.feeKnown && !row.feeEstimated);
  }
  if (previous?.status === 'uncertain' && row.status === 'pending') {
    return (
      (!!row.paymentHash && row.id === `payment:${row.paymentHash}`) ||
      (!!row.txid && row.id === `transaction:${row.txid}`) ||
      (!!row.channelSend && row.id === `channel-send:${row.channelSend.id}`)
    );
  }
  return row.status === 'completed' || row.status === 'failed';
}

export function SendReceipt({ submission, activity = [] }: { submission: SendSubmission; activity?: Activity[] }) {
  const { review, result, interrupted } = submission;
  const [verified, setVerified] = useState<Activity>();
  const previous = verified && updatesReceipt(result, verified) ? verified : result;
  const update = activity.find((row) => matchesSubmission(submission, row) && updatesReceipt(previous, row));
  // Retain verified progress even if a later wallet read temporarily omits its row.
  if (update && update !== verified) setVerified(update);
  const payment = update ?? previous;
  const status = payment?.status ?? (interrupted ? 'uncertain' : 'pending');
  const title = !payment && !interrupted ? 'Sending payment' : paymentTitle(status, 'sent');
  const minimum = review.minRecipientSats != null && !payment?.payAll && status !== 'completed';
  let message = '';
  if (status === 'uncertain') message = 'Check Activity before trying another payment.';
  else if (payment === result && result?.message && result.message !== `${title}.`)
    message = walletMessage(result.message);
  return (
    <>
      <ReceiptSummary
        status={status}
        title={title}
        amount={payment && !minimum ? paymentAmount(payment) : reviewedRecipientAmount(review)}
        minimum={minimum}
        amountLabel={status === 'completed' ? 'Recipient received' : 'Payment amount'}
        note={review.description}
        animateEntrance
      />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {payment && <ReceiptDetails payment={payment} />}
    </>
  );
}
