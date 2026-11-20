import type { Network } from '@beignet/wallet-core';

export function walletNetwork(value: unknown): Network | null {
  return value === 'mainnet' || value === 'testnet' || value === 'regtest' ? value : null;
}

export async function checkoutNetworks(signal?: AbortSignal) {
  const response = await fetch('/api/wallet/networks', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Could not check the wallet networks.');
  const data = await response.json();
  return { walletNetwork: walletNetwork(data?.walletNetwork), locksNetwork: walletNetwork(data?.locksNetwork) };
}
