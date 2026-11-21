// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createStartupScan } from './startup-scan.mjs';

const smallWallet = () => ({
  electrum: { batchLimit: 20, batchDelay: 50 },
  gapLimitOptions: { lookAhead: 20, lookBehind: 20, lookAheadChange: 20, lookBehindChange: 20 },
  utxos: [] as object[],
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
  const wallet = smallWallet();
  for (const change of [
    { utxos: Array(21).fill({}) },
    { transactions: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [i, {}])) },
    { gapLimitOptions: { ...wallet.gapLimitOptions, lookAhead: 40 } },
    { electrum: { batchLimit: 10, batchDelay: 50 } },
  ]) {
    const scan = createStartupScan();
    const large = { ...structuredClone(wallet), ...change };
    scan.nodeOptions.extensions[0].attach({ wallet: large, generation: 1 });
    expect(large.electrum.batchDelay).toBe(50);
  }
  expect(vi.getTimerCount()).toBe(0);
});

it.each([0, 35])('waits for the running scan with %s saved coins without scheduling a second scan', async (coins) => {
  const wallet = smallWallet();
  const scan = createStartupScan();
  wallet.utxos = Array(coins).fill({});
  scan.nodeOptions.extensions[0].attach({ wallet, generation: 1 });
  wallet.isRefreshing = true;
  const retry = vi.fn();
  const ready = vi.fn();
  const result = scan.confirm(retry).then(ready);
  await vi.advanceTimersByTimeAsync(500);
  expect(ready).not.toHaveBeenCalled();
  expect(retry).not.toHaveBeenCalled();
  wallet.isRefreshing = false;
  await vi.advanceTimersByTimeAsync(100);
  await result;
  expect(ready).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
});

it.each(['timeout', 'stop'])('keeps an unfinished scan fenced after %s', async (condition) => {
  const wallet = smallWallet();
  const scan = createStartupScan();
  const attachment = scan.nodeOptions.extensions[0].attach({ wallet, generation: 1 });
  wallet.isRefreshing = true;
  const retry = vi.fn();
  const result = expect(scan.confirm(retry)).rejects.toMatchObject({ code: 'WALLET_SYNC_INCOMPLETE' });
  if (condition === 'stop') attachment.stop!();
  await vi.runAllTimersAsync();
  await result;
  expect(retry).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('retries a failed scan once at the original cadence and checks its outcome', async () => {
  const wallet = smallWallet();
  const scan = createStartupScan();
  scan.nodeOptions.extensions[0].attach({ wallet, generation: 1 });
  wallet.isRefreshing = true;
  const retry = vi.fn(async () => {
    expect(wallet.electrum.batchDelay).toBe(50);
  });
  const failure = expect(scan.confirm(retry)).rejects.toMatchObject({ code: 'WALLET_SYNC_INCOMPLETE' });
  wallet.isRefreshing = false;
  wallet.refreshFailed = true;
  await vi.advanceTimersByTimeAsync(100);
  await failure;
  expect(retry).toHaveBeenCalledOnce();
  retry.mockImplementationOnce(async () => {
    wallet.refreshFailed = false;
  });
  await scan.confirm(retry);
  await scan.confirm(retry);
  expect(retry).toHaveBeenCalledTimes(2);
});

it('rechecks a timed-out scan on retry and fences results from a previous engine generation', async () => {
  const scan = createStartupScan();
  const first = smallWallet();
  const host = scan.nodeOptions.extensions[0];
  const prior = host.attach({ wallet: first, generation: 1 });
  first.isRefreshing = true;
  const refresh = vi.fn();
  const timedOut = expect(scan.confirm(refresh)).rejects.toMatchObject({ code: 'WALLET_SYNC_INCOMPLETE' });
  await vi.runAllTimersAsync();
  await timedOut;
  const waiting = expect(scan.confirm(refresh)).rejects.toMatchObject({ code: 'WALLET_SYNC_INCOMPLETE' });
  await vi.advanceTimersByTimeAsync(100);
  prior.stop!();
  const replacement = smallWallet();
  replacement.refreshFailed = true;
  host.attach({ wallet: replacement, generation: 2 });
  expect(replacement.electrum.batchDelay).toBe(50);
  await vi.runAllTimersAsync();
  await waiting;
  expect(refresh).not.toHaveBeenCalled();
  await expect(scan.confirm(refresh)).rejects.toMatchObject({ code: 'WALLET_SYNC_INCOMPLETE' });
  expect(refresh).toHaveBeenCalledOnce();
  replacement.refreshFailed = false;
  await scan.confirm(refresh);
  expect(refresh).toHaveBeenCalledOnce();
});
