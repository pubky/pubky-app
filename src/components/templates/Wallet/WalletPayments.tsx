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
import { Detail, WalletPanel, type WalletTask, Warnings } from './WalletPanel';
import { reviewedRecipientAmount, SendReceipt, type SendSubmission, WalletReceipt } from './WalletReceipt';
import { WalletScanner } from './WalletScanner';

type PaymentProps = { client: WalletClientInterface; task: WalletTask; refresh: () => void };

function AmountField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="payment-amount">
        Amount <span className="sr-only">in bitcoin</span> (optional)
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
          className="pl-8"
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]+"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export function WalletSend({
  client,
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
  return (
    <WalletPanel title={review ? 'Review payment' : 'Send bitcoin'} icon={ArrowUpRight}>
      {review ? (
        <>
          <dl className="grid gap-3">
            {review.recipient && <Detail label="Pubky recipient" value={review.recipient} />}
            <Detail
              label={review.recipient ? "Payment details from the recipient's homeserver" : 'Destination'}
              value={review.destination}
            />
            {review.payment.destination !== review.destination && (
              <Detail label="Paying" value={review.payment.destination} />
            )}
            {review.payment.description && <Detail label="Description" value={review.payment.description} />}
            <Detail
              label="Payment method"
              value={review.payment.route === 'lightning' ? 'Lightning' : 'Bitcoin on-chain'}
            />
            {review.payment.drain && (
              <>
                <Detail
                  label="Estimated channel closing fee"
                  value={bitcoinAmount(review.payment.drain.closeFeeSats)}
                />
                <Detail label="Estimated sweep fee" value={bitcoinAmount(review.payment.drain.sweepFeeSats)} />
              </>
            )}
            <Detail
              label={review.payment.minRecipientSats != null ? 'Recipient gets at least' : 'Recipient amount'}
              value={reviewedRecipientAmount(review.payment)}
            />
            {review.payment.estimatedFeeSats != null && (
              <Detail label="Estimated routing fee" value={bitcoinAmount(review.payment.estimatedFeeSats)} />
            )}
            <Detail
              label={review.payment.feeLabel || 'Fee'}
              value={
                review.payment.maxFeeMsat
                  ? lightningAmount(review.payment.maxFeeMsat)
                  : bitcoinAmount(review.payment.feeSats)
              }
            />
            <Detail
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
              <Detail label="Kept in channels" value={keptAmount(review.payment.keptSats, review.payment.keptReason)} />
            )}
          </dl>
          <Warnings items={review.payment.warnings} />
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" disabled={task.busy} onClick={() => task.run(send)}>
              {task.busy ? 'Sending…' : review.payment.method === 'drain' ? 'Confirm wallet drain' : 'Confirm payment'}
            </Button>
            <Button
              variant="outline"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  if (review.payment.method === 'drain') await client.cancelDrain(review.payment.id);
                  setReview(null);
                })
              }
            >
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
          className="grid gap-4"
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

export function WalletReceive({
  client,
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
  const [deposit, setDeposit] = useState<{ address: string; uri: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [quote, setQuote] = useState<ReceiveQuote | null>(null);
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
    <WalletPanel title="Receive bitcoin" icon={ArrowDownLeft}>
      {deposit ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted-foreground">
            This address receives on-chain bitcoin. Deposits appear in your wallet after network sync.
          </p>
          {deposit.uri.length <= 2900 && (
            <QRCodeSVG
              title="Bitcoin deposit QR code"
              value={deposit.uri}
              size={208}
              level="L"
              marginSize={4}
              className="rounded-xl"
            />
          )}
          <Detail label="Bitcoin address" value={deposit.address} />
          {amount && <Detail label="Requested amount" value={bitcoinAmount(parseSats(amount))} />}
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
          <dl className="grid gap-3">
            <Detail
              label="Requested amount"
              value={quote.amountSats === null ? 'Any amount' : bitcoinAmount(quote.amountSats)}
            />
            <Detail label="Receive fee" value={bitcoinAmount(quote.feeSats)} />
            {quote.netSats !== null && <Detail label="You receive" value={bitcoinAmount(quote.netSats)} />}
            {quote.description && <Detail label="Description" value={quote.description} />}
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
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void task.run(async () => {
              setQuote(await client.quoteReceive({ amountSats: amount || undefined, description }));
            });
          }}
        >
          <AmountField value={amount} onChange={setAmount} disabled={task.busy} />
          <div className="grid gap-2">
            <Label htmlFor="payment-description">Description (optional)</Label>
            <Input
              id="payment-description"
              disabled={task.busy}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
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
                const amountSats = amount ? parseSats(amount) : undefined;
                if (amountSats === 0)
                  throw new WalletError('Enter an amount greater than zero or leave it blank.', 'INVALID_AMOUNT');
                const address = await newBitcoinAddress();
                setDeposit({ address, uri: buildBip21({ address, amountSats, message: description }) });
              })
            }
          >
            Receive on-chain
          </Button>
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
          (!phase || phase === 'waiting') &&
          !expired && (
            <div className="flex w-full flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground">
                Keep this wallet open and unlocked while waiting for payment.
              </p>
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
                  className="rounded-xl"
                />
              )}
              <div className="grid w-full gap-2">
                <Label htmlFor="receive-code">{unified ? 'Payment request' : 'Lightning invoice'}</Label>
                <Textarea id="receive-code" readOnly value={payload} className="max-h-24 font-mono text-xs" />
              </div>
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
              <p className="text-xs text-muted-foreground">Expires {new Date(request.expiresAt).toLocaleString()}</p>
              <Warnings items={request.warnings} />
            </div>
          )
        )}
      </motion.div>
      <Button className="self-start" variant="outline" onClick={reset}>
        New request
      </Button>
    </>
  );
}

function keptAmount(amount: number, reason?: KeptReason) {
  const detail = reason === 'reserve' ? 'channel reserve' : reason === 'commitment-cost' ? 'commitment cost' : '';
  return detail ? `${bitcoinAmount(amount)} (${detail})` : bitcoinAmount(amount);
}
