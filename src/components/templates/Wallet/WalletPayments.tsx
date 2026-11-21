'use client';

import { useEffect, useState } from 'react';
import type {
  Activity,
  KeptReason,
  Network,
  ReceiveQuote,
  ReceiveRequest,
  ReceiveStatus,
  SendResult,
  SendReview,
  WalletClientInterface,
} from '@beignet/wallet-core';
import { buildBip21, parseSats, WalletError } from '@beignet/wallet-core';
import { ArrowDownLeft, ArrowUpRight, Copy, Moon, Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/atoms/Button/Button';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Switch } from '@/atoms/Switch/Switch';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { copyToClipboard } from '@/libs/utils/utils';
import { bitcoinAmount, lightningAmount } from '@/libs/wallet/amount';
import {
  quoteWalletMaximum,
  reviewWalletDrain,
  reviewWalletPayment,
  WalletDrainAvailable,
  type WalletMaximum,
} from '@/libs/wallet/sendPayment';
import type { OfflineReceiveDraft } from '@/services/wallet/session';
import { Detail, type WalletNavigation, WalletPanel, type WalletTask, Warnings } from './WalletPanel';
import { reviewedRecipientAmount, SendReceipt, type SendSubmission, WalletReceipt } from './WalletReceipt';
import { WalletScanner } from './WalletScanner';

type PaymentProps = {
  client: WalletClientInterface;
  ready?: boolean;
  task: WalletTask;
  refresh: () => void;
  navigation?: WalletNavigation;
};

function AmountField({
  value,
  onChange,
  disabled,
  required = false,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="payment-amount">
        Amount <span className="sr-only">in bitcoin</span>
        {!required && ' (optional)'}
      </Label>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
        >
          ₿
        </span>
        <Input
          id="payment-amount"
          aria-describedby={hint ? 'receive-amount-hint' : undefined}
          required={required}
          className="pl-8"
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]+"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint && (
        <p id="receive-amount-hint" aria-live="polite" className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function PaymentCode({ label, value, preview = false }: { label: string; value: string; preview?: boolean }) {
  return (
    <details className="w-full min-w-0 rounded-lg border border-border px-3 py-2 text-sm">
      <summary className="cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
        View {label}
        {preview && value.length > 24 && (
          <span aria-hidden className="ml-2 font-mono text-xs">
            {value.slice(0, 10)}…{value.slice(-8)}
          </span>
        )}
      </summary>
      <Textarea
        aria-label={label}
        value={value}
        readOnly
        spellCheck={false}
        className="mt-2 max-h-28 min-h-16 font-mono text-xs wrap-anywhere"
      />
    </details>
  );
}

export function WalletSend({
  client,
  ready = true,
  navigation,
  sendPayment,
  activity,
  network,
  recipient,
  task,
  refresh,
}: PaymentProps & {
  sendPayment: (review: SendReview) => Promise<SendResult>;
  network: Network;
  recipient?: string;
  activity?: Activity[];
}) {
  const engineTask = ready && !task.busy ? task : null;
  const [request, setRequest] = useState(recipient || '');
  const [maximum, setMaximum] = useState<WalletMaximum | null>(null);
  const [drainOffer, setDrainOffer] = useState<WalletDrainAvailable | null>(null);
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<{ payment: SendReview; recipient?: string; destination: string } | null>(null);
  const [submission, setSubmission] = useState<SendSubmission | null>(null);
  const [expired, setExpired] = useState(false);
  async function prepare() {
    try {
      setReview(await reviewWalletPayment(client, request, network, maximum ? undefined : amount, maximum));
    } catch (error) {
      if (error instanceof WalletDrainAvailable) setDrainOffer(error);
      throw error;
    }
  }
  function changeDestination(input: string) {
    setRequest(input);
    setDrainOffer(null);
    setMaximum(null);
    setExpired(false);
    task.clearError();
  }
  async function chooseMaximum() {
    setMaximum(null);
    setDrainOffer(null);
    setAmount('');
    try {
      setMaximum(await quoteWalletMaximum(client, request, network));
    } catch (error) {
      if (error instanceof WalletDrainAvailable) setDrainOffer(error);
      throw error;
    }
  }
  async function send() {
    if (!review) return;
    const payment = review.payment;
    const attempt = { review: payment, startedAt: Date.now() };
    setReview(null);
    setSubmission(attempt);
    try {
      const result = await sendPayment(payment);
      setSubmission({ ...attempt, result });
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'QUOTE_EXPIRED') {
        setSubmission(null);
        setExpired(true);
        return;
      }
      if (err instanceof WalletError && (err.code === 'INVALID_REVIEW' || err.code === 'REVIEW_CHANGED')) {
        setSubmission(null);
        throw err;
      }
      setSubmission({ ...attempt, interrupted: true });
      throw err;
    } finally {
      refresh();
    }
  }
  function reset() {
    setRequest('');
    setDrainOffer(null);
    setAmount('');
    setMaximum(null);
    setSubmission(null);
    setExpired(false);
    task.clearError();
  }
  function leaveReview(next: () => void) {
    if (review?.payment.method === 'drain') {
      void engineTask?.run(async () => {
        await client.cancelDrain(review.payment.id);
        next();
      });
    } else next();
  }
  return (
    <WalletPanel
      title={review ? 'Review payment' : 'Send bitcoin'}
      icon={ArrowUpRight}
      navigation={navigation && { ...navigation, back: () => leaveReview(navigation.back) }}
    >
      {review ? (
        <>
          <dl>
            {review.recipient && <Detail compact label="Pubky recipient" value={review.recipient} />}
            {review.payment.route === 'bitcoin' && (
              <Detail compact label="Bitcoin address" value={review.payment.destination} />
            )}
            {review.payment.description && <Detail compact label="Description" value={review.payment.description} />}
            <Detail
              compact
              label="Payment method"
              value={review.payment.route === 'lightning' ? 'Lightning' : 'Bitcoin on-chain'}
            />
            {review.payment.drain && (
              <>
                <Detail
                  compact
                  label="Estimated channel closing fee"
                  value={bitcoinAmount(review.payment.drain.closeFeeSats)}
                />
                <Detail compact label="Estimated sweep fee" value={bitcoinAmount(review.payment.drain.sweepFeeSats)} />
              </>
            )}
            <Detail
              compact
              label={review.payment.minRecipientSats != null ? 'Recipient gets at least' : 'Recipient amount'}
              value={reviewedRecipientAmount(review.payment)}
            />
            {review.payment.estimatedFeeSats != null && (
              <Detail compact label="Estimated routing fee" value={bitcoinAmount(review.payment.estimatedFeeSats)} />
            )}
            <Detail
              compact
              label={review.payment.feeLabel || 'Fee'}
              value={
                review.payment.maxFeeMsat
                  ? lightningAmount(review.payment.maxFeeMsat)
                  : bitcoinAmount(review.payment.feeSats)
              }
            />
            <Detail
              compact
              label={
                review.payment.method === 'drain'
                  ? 'Estimated total'
                  : review.payment.route === 'lightning'
                    ? 'Maximum total'
                    : 'Total'
              }
              value={
                review.payment.debitMsat
                  ? lightningAmount(review.payment.debitMsat)
                  : bitcoinAmount(review.payment.totalSats)
              }
            />
            {review.payment.max && review.payment.keptSats != null && (
              <Detail
                compact
                label="Kept in channels"
                value={keptAmount(review.payment.keptSats, review.payment.keptReason)}
              />
            )}
          </dl>
          {review.payment.route === 'lightning' && (
            <PaymentCode label="Lightning invoice" value={review.payment.destination} preview />
          )}
          {review.destination !== review.payment.destination && (
            <PaymentCode
              label={review.recipient ? "recipient's original payment request" : 'original payment request'}
              value={review.destination}
            />
          )}
          <Warnings items={review.payment.warnings} />
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" disabled={!engineTask} onClick={() => engineTask?.run(send)}>
              {task.busy ? 'Sending…' : review.payment.method === 'drain' ? 'Confirm wallet drain' : 'Confirm payment'}
            </Button>
            <Button variant="outline" disabled={task.busy} onClick={() => leaveReview(() => setReview(null))}>
              Edit
            </Button>
          </div>
        </>
      ) : submission ? (
        <>
          <SendReceipt submission={submission} activity={activity} />
          {(submission.result || submission.interrupted) && (
            <Button variant="outline" className="self-start" onClick={reset}>
              New payment
            </Button>
          )}
        </>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!engineTask || !request.trim() || drainOffer) return;
            setExpired(false);
            void engineTask.run(prepare);
          }}
        >
          {expired && <p role="status">The quote expired. Review the payment again.</p>}
          <div className="grid gap-2">
            <Label htmlFor="payment-destination">Pay to</Label>
            <Textarea
              id="payment-destination"
              required
              spellCheck={false}
              autoCapitalize="none"
              autoComplete="off"
              placeholder="Lightning request, Bitcoin address, or Pubky ID"
              value={request}
              disabled={task.busy}
              onChange={(e) => changeDestination(e.target.value)}
            />
          </div>
          {!task.busy && (
            <WalletScanner
              onRead={(value) => {
                changeDestination(value);
                setAmount('');
              }}
            />
          )}
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <AmountField
              value={maximum ? String(maximum.quote.amountSats) : amount}
              onChange={(value) => {
                setMaximum(null);
                setDrainOffer(null);
                setAmount(value);
                task.clearError();
              }}
              disabled={task.busy}
            />
            <Button
              type="button"
              variant={maximum ? 'default' : 'outline'}
              aria-pressed={!!maximum}
              disabled={!engineTask || !request.trim()}
              onClick={() => engineTask?.run(chooseMaximum)}
            >
              Max
            </Button>
          </div>
          {drainOffer && (
            <div className="grid gap-2 rounded-xl border border-border p-4 text-sm">
              <p>
                To send the remaining funds to this address, review the channel closing and sweep fees. The transfers
                can take several blocks.
              </p>
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                disabled={!engineTask}
                onClick={() =>
                  engineTask?.run(async () => {
                    setReview(await reviewWalletDrain(client, request, network, drainOffer));
                  })
                }
              >
                Empty wallet to this address
              </Button>
            </div>
          )}
          {maximum && (
            <p className="text-sm text-muted-foreground" role="status">
              Maximum quoted for this destination. {keptAmount(maximum.quote.keptSats, maximum.quote.keptReason)} kept
              in channels.
            </p>
          )}
          {!maximum && !drainOffer && (
            <p className="text-sm text-muted-foreground">Leave the amount empty when the request specifies one.</p>
          )}
          <Button
            type="submit"
            variant="brand"
            className="justify-self-start"
            disabled={!engineTask || !request.trim() || !!drainOffer}
          >
            {task.busy ? 'Working…' : 'Review payment'}
          </Button>
        </form>
      )}
    </WalletPanel>
  );
}

function receiveAmount(input: string) {
  if (input === '') return 0;
  if (input !== input.trim()) return undefined;
  try {
    return parseSats(input);
  } catch {
    return undefined;
  }
}

function receiveFeeTerms(flatFeeSats: number, feePpm: number) {
  if (!feePpm) return bitcoinAmount(flatFeeSats);
  const percent = (feePpm / 1_000_000).toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 4 });
  const rate = `${percent} of the payment`;
  return flatFeeSats ? `${bitcoinAmount(flatFeeSats)} + ${rate}` : rate;
}

// The smallest fixed amount the engine can hold for an offline receive.
const MIN_OFFLINE_SATS = 354;

export function WalletReceive({
  client,
  ready = true,
  navigation,
  task,
  refresh,
  request,
  setRequest,
  receipt,
  unavailable,
  receivedWhileAway = false,
  newBitcoinAddress,
  offlineCapacity,
  primaryConnected,
  primaryOfflineAvailable,
  offlineDraft,
  offlineDraftReady = true,
  reloadOfflineDraft,
  discardOfflineDraft,
  issueOffline,
}: PaymentProps & {
  request: ReceiveRequest | null;
  setRequest: (request: ReceiveRequest | null) => void;
  receipt: ReceiveStatus | undefined;
  unavailable: boolean;
  receivedWhileAway?: boolean;
  newBitcoinAddress: () => Promise<string>;
  offlineCapacity?: number;
  primaryConnected?: boolean;
  primaryOfflineAvailable?: boolean | null;
  offlineDraft?: OfflineReceiveDraft | null;
  offlineDraftReady?: boolean;
  reloadOfflineDraft?: () => Promise<void>;
  discardOfflineDraft: (id: string) => Promise<void>;
  issueOffline: (quote: ReceiveQuote) => Promise<ReceiveRequest>;
}) {
  const engineTask = ready && !task.busy ? task : null;
  const [deposit, setDeposit] = useState<{ address: string; uri: string; amountSats?: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [quote, setQuote] = useState<ReceiveQuote | null>(null);
  const [expiredQuote, setExpiredQuote] = useState<ReceiveQuote | null>(null);
  useEffect(() => {
    if (quote?.mode !== 'offline') return;
    const timer = window.setTimeout(
      () => setExpiredQuote(quote),
      Math.min(2_147_483_647, Math.max(0, quote.expiresAt - Date.now())),
    );
    return () => window.clearTimeout(timer);
  }, [quote]);
  const [offline, setOffline] = useState(false);
  const [primaryNeedsAmount, setPrimaryNeedsAmount] = useState(false);
  const [useOnline, setUseOnline] = useState(false);
  const [attemptedDraft, setAttemptedDraft] = useState<OfflineReceiveDraft | null>(null);
  const [hostSupport, setHostSupport] = useState<'checking' | 'available' | 'unavailable' | 'error'>('checking');
  const [check, setCheck] = useState(0);
  useEffect(() => {
    if (!ready || !primaryConnected) return;
    let active = true;
    Promise.resolve()
      .then(() => client.getConfig())
      .then((config) => {
        if (active) setHostSupport(config.offlineReceiveAvailable ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (active) setHostSupport('error');
      });
    return () => {
      active = false;
    };
  }, [client, check, ready, primaryConnected]);
  const pending = offlineDraft ?? attemptedDraft;
  const canReceiveOffline =
    ready &&
    offlineDraftReady &&
    hostSupport === 'available' &&
    primaryConnected === true &&
    primaryOfflineAvailable !== false &&
    (offlineCapacity === undefined || offlineCapacity >= MIN_OFFLINE_SATS);
  let switchHint = 'Accept a Lightning payment while your wallet is closed.';
  if (!ready) switchHint = 'Offline capacity will be checked when connected.';
  else if (!offlineDraftReady)
    switchHint = reloadOfflineDraft
      ? 'Could not check for a saved offline request.'
      : 'Checking for a saved offline request…';
  else if (primaryConnected === false) switchHint = 'Offline receiving needs a connection to your primary.';
  else if (!primaryConnected) switchHint = 'Checking the Lightning connection…';
  else if (hostSupport === 'checking') switchHint = 'Checking offline support…';
  else if (hostSupport === 'error') switchHint = 'Could not check offline support.';
  else if (hostSupport === 'unavailable') switchHint = 'This browser wallet does not support offline receiving.';
  else if (primaryOfflineAvailable === false) switchHint = 'Your primary does not offer offline receiving.';
  else if (!canReceiveOffline)
    switchHint = 'There is no room for an offline payment right now. You can still receive with the wallet open.';
  const offlineRange =
    offlineCapacity === undefined || offlineCapacity < MIN_OFFLINE_SATS
      ? `Enter at least ${bitcoinAmount(MIN_OFFLINE_SATS)}. Your primary will check available capacity.`
      : `Enter ${bitcoinAmount(MIN_OFFLINE_SATS)} to ${bitcoinAmount(offlineCapacity)} for an offline invoice.`;
  const amountSats = receiveAmount(amount);
  const canReviewAmount =
    amountSats !== undefined &&
    (offline
      ? canReceiveOffline &&
        !pending &&
        amountSats >= MIN_OFFLINE_SATS &&
        (offlineCapacity === undefined || amountSats <= offlineCapacity)
      : amountSats > 0 || !primaryNeedsAmount);
  const onlineHint =
    amountSats === undefined
      ? 'Enter a whole number within the Bitcoin supply.'
      : primaryNeedsAmount
        ? 'Enter an amount for a Lightning request with this primary.'
        : 'Leave blank or enter 0 to let the sender choose the amount.';
  const jitFee = quote?.jitFee;
  async function reviewOnline(sats: number) {
    try {
      setQuote(await client.quoteReceive({ amountSats: sats === 0 ? undefined : sats, description }));
    } catch (error) {
      if (sats > 0 || !(error instanceof WalletError) || error.code !== 'AMOUNT_REQUIRED') throw error;
      setPrimaryNeedsAmount(true);
    }
  }
  async function reviewOffline(amountSats: number, note: string, draft?: OfflineReceiveDraft) {
    const next = await client.quoteReceive({
      mode: 'offline',
      amountSats,
      description: note,
      ...(draft && { requestId: draft.id, ...(draft.peer && { peer: draft.peer }) }),
    });
    if (next.mode !== 'offline' || next.amountSats !== amountSats) {
      throw new Error('Your primary could not confirm an offline quote for this amount.');
    }
    if (draft && (next.id !== draft.id || (draft.peer && next.peer !== draft.peer))) {
      throw new Error('Could not match this quote to your saved offline request.');
    }
    setQuote(next);
  }
  async function issue() {
    if (!quote) return;
    if (quote.mode === 'offline' && quote.amountSats !== null) {
      const draft = { id: quote.id, amountSats: quote.amountSats, description: quote.description, peer: quote.peer };
      if (quote.expiresAt <= Date.now()) {
        await reviewOffline(draft.amountSats, draft.description, draft);
        return;
      }
      setAttemptedDraft(draft);
      try {
        const issued = await issueOffline(quote);
        if (!issued.offlineReceive || !issued.bolt11)
          throw new Error('Could not verify the offline invoice. Check Activity before retrying.');
        setRequest(issued);
        setAttemptedDraft(null);
        refresh();
      } finally {
        setQuote(null);
      }
      return;
    }
    try {
      setRequest(await client.receive(quote));
      refresh();
    } finally {
      setQuote(null);
    }
  }
  return (
    <WalletPanel title="Receive bitcoin" icon={ArrowDownLeft} navigation={navigation}>
      {deposit ? (
        <div className="grid w-full min-w-0 justify-items-start gap-3">
          {deposit.uri.length <= 2900 && (
            <QRCodeSVG
              title="Bitcoin deposit QR code"
              value={deposit.uri}
              size={208}
              level="L"
              marginSize={4}
              className="size-48 justify-self-center rounded-xl sm:size-52"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  await copyToClipboard({ text: deposit.uri });
                  setCopied(true);
                })
              }
            >
              <Copy />
              {copied ? 'Copied' : 'Copy Bitcoin request'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDeposit(null);
                setCopied(false);
              }}
            >
              New request
            </Button>
          </div>
          <dl className="w-full">
            <Detail label="Bitcoin address" value={deposit.address} />
            {deposit.amountSats != null && (
              <Detail compact label="Requested amount" value={bitcoinAmount(deposit.amountSats)} />
            )}
          </dl>
        </div>
      ) : request ? (
        <RequestCode
          key={request.id}
          request={request}
          task={task}
          receipt={receipt}
          unavailable={unavailable}
          receivedWhileAway={receivedWhileAway}
          reset={() => {
            if (request.offlineReceive) {
              setOffline(false);
              setUseOnline(false);
              setAmount('');
              setDescription('');
            }
            setRequest(null);
            task.clearError();
          }}
        />
      ) : quote ? (
        <>
          {quote.mode === 'offline' && (
            <p className="flex items-center gap-2 text-sm font-medium">
              <Moon aria-hidden className="size-4 text-brand" /> Offline Lightning invoice
            </p>
          )}
          <dl>
            <Detail
              compact
              label="Requested amount"
              value={quote.amountSats === null ? 'Sender chooses' : bitcoinAmount(quote.amountSats)}
            />
            {jitFee && (
              <Detail compact label="Lightning payment limit" value={bitcoinAmount(jitFee.maxReceivableSats)} />
            )}
            {jitFee && (jitFee.flatFeeSats > 0 || jitFee.feePpm > 0) ? (
              <>
                <Detail
                  compact
                  label="Fee if the primary adds capacity"
                  value={receiveFeeTerms(jitFee.flatFeeSats, jitFee.feePpm)}
                />
                <Detail compact label="Maximum receive fee" value={bitcoinAmount(jitFee.maxFeeSats)} />
              </>
            ) : (
              <Detail compact label="Receive fee" value={bitcoinAmount(quote.feeSats)} />
            )}
            {quote.netSats !== null && <Detail compact label="You receive" value={bitcoinAmount(quote.netSats)} />}
            {quote.description && <Detail compact label="Description" value={quote.description} />}
          </dl>
          <Warnings items={quote.warnings} />
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" disabled={!engineTask} onClick={() => engineTask?.run(issue)}>
              {quote === expiredQuote
                ? task.busy
                  ? 'Refreshing quote…'
                  : 'Refresh quote'
                : task.busy
                  ? 'Creating request…'
                  : 'Create request'}
            </Button>
            <Button
              variant="outline"
              disabled={task.busy}
              onClick={() => {
                setQuote(null);
                task.clearError();
              }}
            >
              {pending && quote.mode === 'offline' ? 'Back' : 'Edit'}
            </Button>
          </div>
        </>
      ) : pending && !useOnline ? (
        <div className="grid gap-3">
          <div>
            <p className="font-semibold">Unfinished offline request</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{bitcoinAmount(pending.amountSats)}</p>
            {pending.description && <p className="text-sm wrap-anywhere">{pending.description}</p>}
          </div>
          <p className="text-sm text-muted-foreground">
            Your primary may have reserved capacity. Resume this request to check the same invoice.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="brand"
              disabled={!engineTask}
              onClick={() => engineTask?.run(() => reviewOffline(pending.amountSats, pending.description, pending))}
            >
              {task.busy ? 'Checking request…' : 'Resume offline request'}
            </Button>
            <Button
              variant="outline"
              disabled={task.busy}
              onClick={() => {
                setUseOnline(true);
                setOffline(false);
                task.clearError();
              }}
            >
              Receive online
            </Button>
            <Button
              variant="ghost"
              disabled={!engineTask}
              onClick={() =>
                engineTask?.run(async () => {
                  await discardOfflineDraft(pending.id);
                  setAttemptedDraft(null);
                  setOffline(false);
                })
              }
            >
              Stop retrying
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-3"
          onChange={() => {
            // A saved offline request can arrive after the user starts typing.
            if (!ready || !offlineDraftReady) setUseOnline(true);
          }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!canReviewAmount || !engineTask) return;
            void engineTask.run(async () => {
              if (offline) await reviewOffline(amountSats, description);
              else await reviewOnline(amountSats);
            });
          }}
        >
          <AmountField
            required={offline || primaryNeedsAmount}
            hint={offline ? offlineRange : onlineHint}
            value={amount}
            onChange={setAmount}
            disabled={task.busy}
          />
          <div className="grid gap-2">
            <Label htmlFor="payment-description">Description (optional)</Label>
            <Input
              id="payment-description"
              disabled={task.busy}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {pending ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start"
              disabled={task.busy}
              onClick={() => setUseOnline(false)}
            >
              Resume offline request
            </Button>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <Moon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <Label htmlFor="receive-offline">Receive offline</Label>
                <p id="receive-offline-hint" className="text-xs text-muted-foreground">
                  {switchHint}
                </p>
                {ready && (reloadOfflineDraft || hostSupport === 'error') && (
                  <button
                    type="button"
                    disabled={task.busy}
                    className="rounded-sm text-xs underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => {
                      if (reloadOfflineDraft) void engineTask?.run(reloadOfflineDraft);
                      else {
                        setHostSupport('checking');
                        setCheck((n) => n + 1);
                      }
                    }}
                  >
                    Check again
                  </button>
                )}
              </div>
              <Switch
                id="receive-offline"
                type="button"
                aria-describedby="receive-offline-hint"
                checked={offline}
                disabled={!engineTask || (!offline && !canReceiveOffline)}
                onCheckedChange={(enabled) => {
                  setOffline(enabled);
                  setUseOnline(!enabled);
                  task.clearError();
                }}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              className="justify-self-start disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
              variant="brand"
              disabled={!engineTask || !canReviewAmount}
            >
              {task.busy ? 'Preparing request…' : 'Review request'}
            </Button>
            {!offline && (
              <Button
                type="button"
                className="justify-self-start"
                variant="outline"
                disabled={!engineTask || amountSats === undefined}
                onClick={() =>
                  engineTask?.run(async () => {
                    if (amountSats === undefined) return;
                    const address = await newBitcoinAddress();
                    const requestedAmount = amountSats || undefined;
                    setDeposit({
                      address,
                      amountSats: requestedAmount,
                      uri: buildBip21({ address, amountSats: requestedAmount, message: description }),
                    });
                  })
                }
              >
                Receive on-chain
              </Button>
            )}
          </div>
        </form>
      )}
    </WalletPanel>
  );
}

function RequestCode({
  request,
  receipt,
  task,
  unavailable,
  receivedWhileAway,
  reset,
}: {
  request: ReceiveRequest;
  receipt: ReceiveStatus | undefined;
  task: WalletTask;
  unavailable: boolean;
  receivedWhileAway: boolean;
  reset: () => void;
}) {
  const reduced = useReducedMotion();
  const [unified, setUnified] = useState(!request.offlineReceive && !request.bolt11);
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(() => request.expiresAt <= Date.now());
  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, request.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [request.expiresAt]);
  const phase = receipt?.phase;
  const [alreadyPaid] = useState(phase === 'completed');
  let message = expired ? 'Request expired' : unavailable ? 'Payment status unavailable' : 'Waiting for payment';
  if (receipt) {
    if (phase === 'completed')
      message = `${receivedWhileAway ? 'Received while you were away' : 'Received'} ${bitcoinAmount(receipt.receivedSats)}`;
    if (phase === 'partial') message = `Partially paid: ${bitcoinAmount(receipt.receivedSats)}`;
    if (phase === 'pending') message = 'Payment pending';
  }
  const payload = unified ? request.uri : request.bolt11;
  const expiry = new Date(request.expiresAt);
  const expiryLabel = expiry.toLocaleString(undefined, {
    ...(expiry.toDateString() !== new Date().toDateString() && { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
  const qr = unified ? payload : request.bolt11.toUpperCase();
  const shareable = (!phase || phase === 'waiting') && !expired;
  const newRequest = (
    <Button variant="outline" onClick={reset}>
      New request
    </Button>
  );
  return (
    <>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={phase === 'completed' ? 'sr-only' : 'font-semibold'}
      >
        {message}
      </p>
      {receipt?.phase === 'partial' && request.amountSats !== null && (
        <p className="text-sm text-muted-foreground">
          {bitcoinAmount(Math.max(0, request.amountSats - receipt.receivedSats))} remaining.
        </p>
      )}
      <motion.div
        layout={reduced ? false : 'size'}
        transition={{ layout: { duration: 0.24, ease: 'easeOut' } }}
        className="relative origin-top"
      >
        {phase === 'completed' && receipt ? (
          <WalletReceipt
            receipt={receipt}
            description={request.description}
            animateEntrance={!alreadyPaid}
            receivedWhileAway={receivedWhileAway}
          />
        ) : (
          shareable && (
            <div className="grid w-full min-w-0 justify-items-start gap-3">
              {request.offlineReceive && (
                <div className="justify-self-center text-center">
                  <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    <Moon aria-hidden className="size-4" /> Offline Lightning invoice
                  </p>
                  {request.amountSats != null && (
                    <p className="text-2xl font-semibold tabular-nums">{bitcoinAmount(request.amountSats)}</p>
                  )}
                </div>
              )}
              {!request.offlineReceive && request.uri && request.bolt11 && request.uri !== request.bolt11 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Request format">
                  <Button
                    size="sm"
                    variant={!unified ? 'default' : 'outline'}
                    aria-pressed={!unified}
                    onClick={() => {
                      setUnified(false);
                      setCopied(false);
                    }}
                  >
                    <Zap /> Lightning
                  </Button>
                  <Button
                    size="sm"
                    variant={unified ? 'default' : 'outline'}
                    aria-pressed={unified}
                    onClick={() => {
                      setUnified(true);
                      setCopied(false);
                    }}
                  >
                    Unified request
                  </Button>
                </div>
              )}
              {new TextEncoder().encode(qr).length <= 2900 && (
                <QRCodeSVG
                  title="Payment request QR code"
                  value={qr}
                  size={208}
                  level="L"
                  marginSize={4}
                  className="size-48 justify-self-center rounded-xl sm:size-52"
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={task.busy}
                  onClick={() =>
                    task.run(async () => {
                      await copyToClipboard({ text: payload });
                      setCopied(true);
                    })
                  }
                >
                  <Copy />
                  {copied ? 'Copied' : 'Copy request'}
                </Button>
                {newRequest}
              </div>
              <Warnings items={request.warnings} />
              <p className="text-xs text-muted-foreground">
                {request.offlineReceive
                  ? 'You can close your wallet. Reopen it to see your receipt and balance once paid.'
                  : 'Keep your wallet open and unlocked.'}{' '}
                Expires <time dateTime={expiry.toISOString()}>{expiryLabel}</time>.
              </p>
              <PaymentCode label={unified ? 'Payment request' : 'Lightning invoice'} value={payload} />
            </div>
          )
        )}
      </motion.div>
      {!shareable && <div>{newRequest}</div>}
    </>
  );
}

function keptAmount(amount: number, reason?: KeptReason) {
  const detail = reason === 'reserve' ? 'channel reserve' : reason === 'commitment-cost' ? 'commitment cost' : '';
  return detail ? `${bitcoinAmount(amount)} (${detail})` : bitcoinAmount(amount);
}
