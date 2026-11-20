// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStartupScan } from './startup-scan.mjs';

const smallWallet = () => ({
  electrum: { batchLimit: 20, batchDelay: 50 },
  gapLimitOptions: { lookAhead: 20, lookBehind: 20, lookAheadChange: 20, lookBehindChange: 20 },
  utxos: [],
  transactions: {},
  isRefreshing: false,
  refreshFailed: false,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('keeps the batch size and scan windows intact and restores the cadence after startup', async () => {
  const wallet = smallWallet();
  const scan = createStartupScan();
  const extension = scan.nodeOptions.extensions[0];
  const initial = structuredClone(wallet);
  extension.attach({ wallet, generation: 1 });
  expect(wallet).toEqual({ ...initial, electrum: { batchDelay: 15, batchLimit: 20 } });
  scan.restoreCadence();
  const refresh = vi.fn();
  await scan.confirm(refresh);
  expect(wallet).toEqual(initial);
  expect(refresh).not.toHaveBeenCalled();
  extension.attach({ wallet, generation: 2 });
  expect(wallet).toEqual(initial);
});

it('restores the settings when startup stalls or the engine stops', () => {
  for (const stopEarly of [true, false]) {
    const scan = createStartupScan();
    const wallet = smallWallet();
    const attachment = scan.nodeOptions.extensions[0].attach({ wallet, generation: 1 });
    expect(wallet.electrum.batchDelay).toBe(15);
    if (stopEarly) attachment.stop!();
    else vi.advanceTimersByTime(1500);
    expect(wallet.electrum.batchDelay).toBe(50);
    expect(vi.getTimerCount()).toBe(0);
  }
});

it('leaves a large wallet or a custom engine configuration alone', () => {
  const scan = createStartupScan();
  const wallet = smallWallet();
  for (const change of [
    { utxos: Array(21).fill({}) },
    { transactions: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i, {}])) },
    { gapLimitOptions: { ...wallet.gapLimitOptions, lookAhead: 40 } },
    { electrum: { batchLimit: 10, batchDelay: 50 } },
  ]) {
    const large = { ...structuredClone(wallet), ...change };
    scan.nodeOptions.extensions[0].attach({ wallet: large, generation: 1 });
    expect(large.electrum.batchDelay).toBe(50);
  }
  expect(vi.getTimerCount()).toBe(0);
});

it('requires a successful default-cadence retry if the startup refresh failed or is incomplete', async () => {
  const wallet = smallWallet();
  const scan = createStartupScan();
  scan.nodeOptions.extensions[0].attach({ wallet, generation: 1 });
  wallet.refreshFailed = true;
  await expect(
    scan.confirm(async () => {
      expect(wallet.electrum.batchDelay).toBe(50);
    }),
  ).rejects.toMatchObject({ code: 'WALLET_SYNC_INCOMPLETE' });
  wallet.refreshFailed = false;
  wallet.isRefreshing = true;
  const retry = vi.fn(async () => {
    wallet.isRefreshing = false;
  });
  await scan.confirm(retry);
  await scan.confirm(retry);
  expect(retry).toHaveBeenCalledOnce();
});
