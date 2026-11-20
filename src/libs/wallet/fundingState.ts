import type { Network, SendResult } from '@beignet/wallet-core';

export type FundingState = {
  status: 'submitting' | SendResult['status'];
  id?: string;
  network?: Network;
  txid?: string;
  channelSendId?: string;
};

/** An accepted splice still needs its unlocked peer to negotiate and broadcast. */
export function fundingInProgress(state?: FundingState) {
  return !!state?.id && !!state.network && ['submitting', 'pending', 'uncertain'].includes(state.status);
}
