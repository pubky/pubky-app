import { useEffect, useRef } from 'react';
import type { ReceiveRequest, WalletClientInterface } from '@beignet/wallet-core';
import { type QueryClient, skipToken, useQuery } from '@tanstack/react-query';

/** Track the active invoice for the lifetime of the unlocked dashboard, including when Receive is closed. */
export function useReceiveTracker(
  client: WalletClientInterface,
  queries: QueryClient,
  walletId: string,
  request: ReceiveRequest | null,
) {
  const settlementTimers = useRef<number[]>([]);
  useEffect(() => {
    queries.mount();
    return () => {
      queries.unmount();
      settlementTimers.current.forEach(window.clearTimeout);
    };
  }, [queries]);
  const status = useQuery(
    {
      queryKey: ['receive', walletId, request?.id],
      queryFn: request ? () => client.getReceiveStatus(request) : skipToken,
      refetchInterval: (query) => {
        if (!request || query.state.data?.phase === 'completed') return false;
        if (query.state.data?.phase === 'waiting' && Date.now() >= request.expiresAt) return false;
        return query.state.status === 'error' ? 5000 : 1200;
      },
    },
    queries,
  );
  const receipt = status.data;
  const phase = receipt?.phase;
  // The channel ledger can settle just after the invoice. Always read the wallet's authoritative
  // balance and activity. Adding an invoice amount here could double-count it or omit fees.
  useEffect(() => {
    if (!phase || phase === 'waiting') return;
    const snapshot = { queryKey: ['wallet', walletId] };
    const refresh = () => {
      void queries.invalidateQueries(snapshot, { cancelRefetch: false });
    };
    refresh();
    if (phase !== 'completed') return;
    settlementTimers.current.forEach(window.clearTimeout);
    settlementTimers.current = [900, 2800].map((ms) => window.setTimeout(refresh, ms));
  }, [queries, walletId, request?.id, phase, receipt?.receivedSats, receipt?.confirmedSats, receipt?.pendingSats]);
  return { receipt, unavailable: status.isError };
}
