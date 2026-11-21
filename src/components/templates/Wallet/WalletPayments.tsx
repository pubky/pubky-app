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
import { ArrowDownLeft, ArrowUpRight, Copy, Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/atoms/Button/Button';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
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
import { Detail, type WalletNavigation, WalletPanel, type WalletTask, Warnings } from './WalletPanel';
import { reviewedRecipientAmount, SendReceipt, type SendSubmission, WalletReceipt } from './WalletReceipt';
import { WalletScanner } from './WalletScanner';

type PaymentProps = {
  client: WalletClientInterface;
  task: WalletTask;
  refresh: () => void;
  navigation?: WalletNavigation;
};

function AmountField({
  value,
  onChange,
  disabled,
  payerChooses = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  payerChooses?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="payment-amount">
        Amount <span className="sr-only">in bitcoin</span>
        {!payerChooses && ' (optional)'}
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
          aria-describedby={payerChooses ? 'receive-amount-hint' : undefined}
          className="pl-8"
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]+"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {payerChooses && (
        <p id="receive-amount-hint" className="text-sm text-muted-foreground">
          Leave blank or enter 0 to let the sender choose how much to pay.
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
      void task.run(async () => {
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
            <Button variant="brand" disabled={task.busy} onClick={() => task.run(send)}>
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
            setExpired(false);
            void task.run(prepare);
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
              disabled={task.busy || !request.trim()}
              onClick={() => task.run(chooseMaximum)}
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
                disabled={task.busy}
                onClick={() =>
                  task.run(async () => {
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
            disabled={task.busy || !request.trim() || !!drainOffer}
          >
            {task.busy ? 'Working…' : 'Review payment'}
          </Button>
        </form>
      )}
    </WalletPanel>
  );
}

function receiveAmount(input: string) {
  if (input.trim() === '') return undefined;
  const sats = parseSats(input);
  return sats === 0 ? undefined : sats;
}

function receiveFeeTerms(flatFeeSats: number, feePpm: number) {
  if (!feePpm) return bitcoinAmount(flatFeeSats);
  const percent = (feePpm / 1_000_000).toLocaleString('en-US', { style: 'percent', maximumFractionDigits: 4 });
  const rate = `${percent} of the payment`;
  return flatFeeSats ? `${bitcoinAmount(flatFeeSats)} + ${rate}` : rate;
}

export function WalletReceive({
  client,
  navigation,
  task,
  refresh,
  request,
  setRequest,
  receipt,
  unavailable,
  receivedWhileAway = false,
  newBitcoinAddress,
}: PaymentProps & {
  request: ReceiveRequest | null;
  setRequest: (request: ReceiveRequest | null) => void;
  receipt: ReceiveStatus | undefined;
  unavailable: boolean;
  receivedWhileAway?: boolean;
  newBitcoinAddress: () => Promise<string>;
}) {
  const [deposit, setDeposit] = useState<{ address: string; uri: string; amountSats?: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [quote, setQuote] = useState<ReceiveQuote | null>(null);
  const jitFee = quote?.jitFee;
  async function issue() {
    if (!quote) return;
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
            setRequest(null);
            task.clearError();
          }}
        />
      ) : quote ? (
        <>
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
            <Button variant="brand" disabled={task.busy} onClick={() => task.run(issue)}>
              {task.busy ? 'Creating request…' : 'Create request'}
            </Button>
            <Button
              variant="outline"
              disabled={task.busy}
              onClick={() => {
                setQuote(null);
                task.clearError();
              }}
            >
              Edit
            </Button>
          </div>
        </>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void task.run(async () => {
              setQuote(await client.quoteReceive({ amountSats: receiveAmount(amount), description }));
            });
          }}
        >
          <AmountField payerChooses value={amount} onChange={setAmount} disabled={task.busy} />
          <div className="grid gap-2">
            <Label htmlFor="payment-description">Description (optional)</Label>
            <Input
              id="payment-description"
              disabled={task.busy}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="justify-self-start" variant="brand" disabled={task.busy}>
              {task.busy ? 'Preparing request…' : 'Review request'}
            </Button>
            <Button
              type="button"
              className="justify-self-start"
              variant="outline"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  const amountSats = receiveAmount(amount);
                  const address = await newBitcoinAddress();
                  setDeposit({ address, amountSats, uri: buildBip21({ address, amountSats, message: description }) });
                })
              }
            >
              Receive on-chain
            </Button>
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
  const [unified, setUnified] = useState(!request.bolt11);
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
              {request.uri && request.bolt11 && request.uri !== request.bolt11 && (
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
                Keep your wallet open and unlocked. Expires{' '}
                {new Date(request.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
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
