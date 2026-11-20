'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SendReview } from '@beignet/wallet-core';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { ArrowRight, Wallet } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { bitcoinAmount } from '@/libs/wallet/amount';
import { getBitkitFundingAddress } from '@/libs/wallet/bitkitFunding';
import { fundingInProgress, type FundingState } from '@/libs/wallet/fundingState';
import { checkoutNetworks } from '@/libs/wallet/networks';
import type { TLockPrice } from '@/services/locks/locks.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { type UnlockedWallet, WalletAccount } from './WalletAccount';
import { Detail, WalletPanel, Warnings } from './WalletPanel';

interface FundingProps {
  account: string;
  price: TLockPrice;
  state?: FundingState;
  purchaseWaiting?: boolean;
  onState: (state: FundingState) => void;
}

const transferStatus = {
  submitting: 'Submitting your transfer to Bitkit.',
  completed: 'Your transfer to Bitkit completed.',
  pending: 'Your transfer to Bitkit is pending confirmation.',
  uncertain: 'The status of your transfer to Bitkit is unknown. Check Activity in Pubky Wallet.',
  failed: 'Your transfer to Bitkit failed. Check Activity in Pubky Wallet.',
};

function TransferReceipt({ state, purchaseWaiting }: { state: FundingState; purchaseWaiting: boolean }) {
  return (
    <div
      role="status"
      className="sentry-block grid gap-2 rounded-xl border border-border p-4 text-sm"
      data-sentry-block
    >
      <p>
        {state.status === 'pending' && !state.txid
          ? 'Your transfer to Bitkit is pending.'
          : transferStatus[state.status]}
      </p>
      {state.txid && <p className="wrap-anywhere">Transfer transaction ID {state.txid}</p>}
      {fundingInProgress(state) && (
        <p>
          Keep checkout open with Pubky Wallet unlocked until the transfer is confirmed. If you leave, reopen your
          wallet and check Activity before sending again.
        </p>
      )}
      {purchaseWaiting && <p>Review the separate purchase request in Bitkit to unlock this post.</p>}
    </div>
  );
}

function TrackTransfer({
  wallet,
  state,
  queries,
  onState,
  purchaseWaiting,
}: {
  wallet: UnlockedWallet;
  state: FundingState;
  queries: QueryClient;
  onState: FundingProps['onState'];
  purchaseWaiting: boolean;
}) {
  const activity = useQuery(
    {
      queryKey: ['funding-activity', state.id],
      queryFn: async () => {
        const { activity } = await wallet.session.client.snapshot();
        return (
          activity.find(
            (row) =>
              row.kind === 'sent' &&
              (row.id === 'submission:' + state.id ||
                row.reference === state.id ||
                (!!state.txid && row.txid === state.txid) ||
                (!!state.channelSendId && row.channelSend?.id === state.channelSendId)),
          ) ?? null
        );
      },
      refetchInterval: 3_000,
    },
    queries,
  );
  useEffect(() => {
    const row = activity.data;
    if (!row || row.status === 'expired' || state.status === 'submitting') return;
    const txid = row.txid || state.txid;
    if (row.status !== state.status || txid !== state.txid) onState({ ...state, status: row.status, txid });
  }, [activity.data, state, onState]);
  return (
    <>
      <TransferReceipt state={state} purchaseWaiting={purchaseWaiting} />
      {activity.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          Could not refresh the transfer. Pubky Wallet will check again.
        </p>
      )}
    </>
  );
}

export function CheckoutFunding({ account, price, state, onState, purchaseWaiting = true }: FundingProps) {
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [queries] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  const networks = useQuery(
    {
      queryKey: ['checkout-networks'],
      queryFn: ({ signal }) => checkoutNetworks(signal),
    },
    queries,
  );
  const tracking = fundingInProgress(state);
  // Recovery follows the network already approved, even if the operator changes future checkout settings.
  const network = tracking ? state?.network : networks.data?.walletNetwork;
  const locks = networks.data?.locksNetwork;
  const address = useQuery(
    {
      queryKey: ['bitkit-funding', account, network],
      queryFn: () => getBitkitFundingAddress(account, network!),
      enabled: expanded && !!network && network === locks && !state,
      refetchOnWindowFocus: false,
    },
    queries,
  );
  if (state && (!tracking || !expanded))
    return (
      <>
        <TransferReceipt state={state} purchaseWaiting={purchaseWaiting} />
        {tracking && (
          <Button type="button" variant="outline" onClick={() => setExpanded(true)}>
            Reopen wallet to track transfer
          </Button>
        )}
      </>
    );
  if (!tracking) {
    if (networks.isPending) return <p className="text-sm text-muted-foreground">Checking the wallet networks…</p>;
    if (!network || !locks || networks.isError)
      return (
        <p className="text-sm text-muted-foreground">
          Pubky Wallet funding is unavailable because the checkout networks could not be verified. Continue in Bitkit.
        </p>
      );
    if (network !== locks)
      return (
        <p className="text-sm text-muted-foreground">
          Pubky Wallet uses {network}. This checkout uses {locks}. Continue in Bitkit on {locks}.
        </p>
      );
  }
  if (!expanded)
    return (
      <Button type="button" variant="outline" onClick={() => setExpanded(true)}>
        <Wallet /> Fund my Bitkit from Pubky Wallet
      </Button>
    );
  return (
    <section className="sentry-block grid min-w-0 gap-3" data-sentry-block>
      {!tracking && (
        <p className="text-sm">
          Transfer bitcoin to your own Bitkit wallet on {network}. To unlock this post, approve the separate purchase
          request in Bitkit.
        </p>
      )}
      {!tracking && address.isFetching && <p role="status">Looking up your Bitkit address…</p>}
      {!tracking && address.isError && <p role="alert">{address.error.message}</p>}
      {(tracking || (address.isSuccess && !address.isFetching)) && (
        <WalletAccount
          key={JSON.stringify([account, network, revision])}
          account={account}
          reset={() => setRevision((n) => n + 1)}
          renderReady={(wallet) =>
            wallet.network === network ? (
              tracking && state ? (
                <TrackTransfer
                  wallet={wallet}
                  state={state}
                  queries={queries}
                  onState={onState}
                  purchaseWaiting={purchaseWaiting}
                />
              ) : (
                <FundingTransfer
                  account={account}
                  price={price}
                  address={address.data!}
                  wallet={wallet}
                  onState={onState}
                />
              )
            ) : (
              <p role="alert">
                Your unlocked wallet uses {wallet.network}. This checkout uses {network}. Continue in Bitkit.
              </p>
            )
          }
        />
      )}
      {!state && (
        <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setExpanded(false)}>
          Back to checkout
        </Button>
      )}
    </section>
  );
}

function FundingTransfer({
  account,
  price,
  wallet: { session, network, task },
  address,
  onState,
}: Omit<FundingProps, 'state'> & { wallet: UnlockedWallet; address: string }) {
  const [amount, setAmount] = useState(price.asset === 'BTC' ? price.amount : '');
  const [review, setReview] = useState<SendReview>();
  const active = useRef(true);
  const submitted = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const valid = /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount)) && Number(amount) > 0;
  function stillEligible() {
    const auth = useAuthStore.getState();
    return active.current && auth.session && auth.currentUserPubky === account;
  }
  async function prepare() {
    if (!valid || !stillEligible()) return;
    const quote = await session.client.prepareSend({ request: address, amountSats: amount });
    if (
      quote.route !== 'bitcoin' ||
      quote.method ||
      quote.destination !== address ||
      quote.amountSats !== Number(amount)
    ) {
      throw new Error('The transfer quote does not match your Bitkit address and amount.');
    }
    if (stillEligible()) setReview(quote);
  }
  async function confirm() {
    if (!review || submitted.current || !stillEligible()) return;
    const [networks, latestAddress] = await Promise.all([
      checkoutNetworks(),
      getBitkitFundingAddress(account, network),
    ]);
    if (!stillEligible()) return;
    if (networks.locksNetwork !== network || networks.walletNetwork !== network || latestAddress !== address) {
      setReview(undefined);
      throw new Error('Your Bitkit address or checkout network changed. Close the transfer and reopen checkout.');
    }
    if (review.expiresAt <= Date.now()) {
      setReview(undefined);
      throw new Error('This transfer quote expired. Review the transfer again.');
    }
    submitted.current = true;
    const tracking = { id: review.id, network };
    onState({ ...tracking, status: 'submitting' });
    try {
      const result = await session.client.send(review);
      onState({ ...tracking, status: result.status, txid: result.txid, channelSendId: result.channelSend?.id });
    } catch {
      onState({ ...tracking, status: 'uncertain' });
    }
  }
  return (
    <WalletPanel title={review ? 'Review Bitkit transfer' : 'Fund my Bitkit'} icon={Wallet}>
      <dl className="grid gap-2">
        <Detail label="Your Bitkit address" value={address} />
        {review && (
          <>
            <Detail label="Amount to Bitkit" value={bitcoinAmount(review.amountSats)} />
            <Detail label={review.feeLabel || 'Network fee'} value={bitcoinAmount(review.feeSats)} />
            <Detail label="Total from Pubky Wallet" value={bitcoinAmount(review.totalSats)} />
          </>
        )}
      </dl>
      {review ? (
        <>
          <Warnings items={review.warnings} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="brand" disabled={task.busy} onClick={() => void task.run(confirm)}>
              {task.busy ? 'Submitting transfer…' : 'Confirm transfer to my Bitkit'}
            </Button>
            <Button type="button" variant="outline" disabled={task.busy} onClick={() => setReview(undefined)}>
              Edit
            </Button>
          </div>
        </>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void task.run(prepare);
          }}
        >
          <Label htmlFor="bitkit-transfer-amount">Funding amount (₿)</Label>
          <Input
            id="bitkit-transfer-amount"
            value={amount}
            inputMode="numeric"
            pattern="[0-9]+"
            required
            disabled={task.busy}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {price.asset === 'USD' ? 'Check the bitcoin amount in your Bitkit purchase request. ' : ''}Choose how much
            to add for the purchase and Bitkit’s own network fee.
          </p>
          <Button type="submit" variant="brand" className="justify-self-start" disabled={!valid || task.busy}>
            Review transfer <ArrowRight />
          </Button>
        </form>
      )}
    </WalletPanel>
  );
}
