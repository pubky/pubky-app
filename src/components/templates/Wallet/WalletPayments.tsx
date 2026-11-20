'use client';

import { useEffect, useState } from 'react';
import type {
  Network,
  ReceiveQuote,
  ReceiveRequest,
  SendResult,
  SendReview,
  WalletClientInterface,
} from '@beignet/wallet-core';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Copy, Zap } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/atoms/Button/Button';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Textarea } from '@/atoms/Textarea/Textarea';
import { copyToClipboard } from '@/libs/utils/utils';
import { resolveRecipient } from '@/libs/wallet/resolveRecipient';
import { WalletPanel, type WalletTask } from './WalletPanel';

type PaymentProps = { client: WalletClientInterface; task: WalletTask; refresh: () => void };

function SatsField({
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
      <Label htmlFor="payment-amount">Amount in sats (optional)</Label>
      <Input
        id="payment-amount"
        disabled={disabled}
        inputMode="numeric"
        pattern="[0-9]+"
        placeholder="Amount"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function WalletSend({
  client,
  network,
  recipient,
  task,
  refresh,
}: PaymentProps & { network: Network; recipient?: string }) {
  const [request, setRequest] = useState(recipient || '');
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<{ payment: SendReview; recipient?: string; destination: string } | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [expired, setExpired] = useState(false);
  async function prepare() {
    const target = await resolveRecipient(request.trim(), network);
    const payment = await client.prepareSend({ request: target.destination, amountSats: amount || undefined });
    setReview({ payment, destination: target.destination, recipient: target.pubky });
  }
  async function send() {
    if (!review) return;
    const payment = review.payment;
    try {
      setResult(await client.send(payment));
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'QUOTE_EXPIRED') {
        setExpired(true);
        return;
      }
      setUncertain(true);
      throw err;
    } finally {
      setReview(null);
      refresh();
    }
  }
  function reset() {
    setRequest('');
    setAmount('');
    setResult(null);
    setUncertain(false);
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
            <Detail label="Amount" value={sats(review.payment.amountSats)} />
            <Detail label={review.payment.feeLabel || 'Fee'} value={sats(review.payment.feeSats)} />
            <Detail
              label={review.payment.route === 'lightning' ? 'Maximum total' : 'Total'}
              value={sats(review.payment.totalSats)}
            />
          </dl>
          <Warnings items={review.payment.warnings} />
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" disabled={task.busy} onClick={() => task.run(send)}>
              {task.busy ? 'Sending…' : 'Confirm payment'}
            </Button>
            <Button
              variant="outline"
              disabled={task.busy}
              onClick={() => {
                setReview(null);
                task.clearError();
              }}
            >
              Edit
            </Button>
          </div>
        </>
      ) : result || uncertain ? (
        <>
          <p role="status" className="font-semibold">
            {uncertain
              ? 'Payment status unknown'
              : result!.status === 'completed'
                ? 'Payment sent'
                : `Payment ${result!.status}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {uncertain || result?.status === 'uncertain'
              ? 'Check Activity before trying another payment.'
              : result?.message}
          </p>
          {result && (
            <dl className="grid gap-2">
              <Detail label="Amount" value={sats(result.amountSats)} />
              {(result.txid || result.paymentHash) && (
                <Detail
                  label={result.txid ? 'Transaction ID' : 'Payment hash'}
                  value={result.txid || result.paymentHash || ''}
                />
              )}
            </dl>
          )}
          <Button variant="outline" className="self-start" onClick={reset}>
            New payment
          </Button>
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
              onChange={(e) => setRequest(e.target.value)}
            />
          </div>
          <SatsField value={amount} onChange={setAmount} disabled={task.busy} />
          <p className="text-sm text-muted-foreground">Leave the amount empty when the request specifies one.</p>
          <Button type="submit" variant="brand" className="justify-self-start" disabled={task.busy || !request.trim()}>
            {task.busy ? 'Working…' : 'Review payment'}
          </Button>
        </form>
      )}
    </WalletPanel>
  );
}

export function WalletReceive({ client, task, refresh, queries }: PaymentProps & { queries: QueryClient }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [quote, setQuote] = useState<ReceiveQuote | null>(null);
  const [request, setRequest] = useState<ReceiveRequest | null>(null);
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
      {request ? (
        <RequestCode
          key={request.id}
          request={request}
          client={client}
          task={task}
          queries={queries}
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
              value={quote.amountSats === null ? 'Any amount' : sats(quote.amountSats)}
            />
            <Detail label="Receive fee" value={sats(quote.feeSats)} />
            {quote.netSats !== null && <Detail label="You receive" value={sats(quote.netSats)} />}
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
          <SatsField value={amount} onChange={setAmount} disabled={task.busy} />
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
        </form>
      )}
    </WalletPanel>
  );
}

function RequestCode({
  request,
  client,
  task,
  queries,
  reset,
}: {
  request: ReceiveRequest;
  client: WalletClientInterface;
  task: WalletTask;
  queries: QueryClient;
  reset: () => void;
}) {
  const [unified, setUnified] = useState(!request.bolt11);
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(() => request.expiresAt <= Date.now());
  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, request.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [request.expiresAt]);
  const status = useQuery(
    {
      queryKey: ['receive', request.id],
      queryFn: () => client.getReceiveStatus(request),
      refetchInterval: (query) => (query.state.data?.phase === 'completed' ? false : 5000),
    },
    queries,
  );
  const phase = status.data?.phase;
  let message = expired ? 'Request expired' : status.isError ? 'Payment status unavailable' : 'Waiting for payment';
  if (status.data) {
    if (phase === 'completed') message = `Received ${sats(status.data.receivedSats)}`;
    if (phase === 'partial') message = `Partially paid: ${sats(status.data.receivedSats)}`;
    if (phase === 'pending') message = 'Payment pending';
  }
  const payload = unified ? request.uri : request.bolt11;
  const qr = unified ? payload : request.bolt11.toUpperCase();
  return (
    <>
      <p role="status" className="font-semibold">
        {message}
      </p>
      {status.data?.phase === 'partial' && request.amountSats !== null && (
        <p className="text-sm text-muted-foreground">
          {sats(Math.max(0, request.amountSats - status.data.receivedSats))} remaining.
        </p>
      )}
      {(!phase || phase === 'waiting') && !expired && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted-foreground">Keep this wallet open and unlocked while waiting for payment.</p>
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
      )}
      <Button className="self-start" variant="outline" onClick={reset}>
        New request
      </Button>
    </>
  );
}

function sats(amount: number) {
  return `${amount.toLocaleString()} sats`;
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-border pb-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm wrap-anywhere">{value}</dd>
    </div>
  );
}
function Warnings({ items }: { items: string[] }) {
  return items.length ? (
    <ul className="grid gap-2 rounded-xl border border-border p-3 text-sm">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  ) : null;
}
