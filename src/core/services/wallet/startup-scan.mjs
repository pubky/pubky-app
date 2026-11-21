// The tested relay accepts the engine's normal batches with a shorter pause.
// Limit this to wallets whose saved coins and transactions each fit in one batch.
const batchSize = 20;
const batchDelay = 15;
const defaultDelay = 50;
const refreshWaitMs = 30_000;

function incomplete() {
  return Object.assign(new Error('Bitcoin sync is incomplete. Retry the connection before sending.'), {
    code: 'WALLET_SYNC_INCOMPLETE',
  });
}

function smallScan(wallet) {
  const windows = wallet.gapLimitOptions;
  if (
    !windows ||
    !['lookAhead', 'lookBehind', 'lookAheadChange', 'lookBehindChange'].every(
      (name) => Number.isInteger(windows[name]) && windows[name] > 0 && windows[name] <= batchSize,
    )
  )
    return false;
  if (!Array.isArray(wallet.utxos) || wallet.utxos.length > batchSize || !wallet.transactions) return false;
  let transactions = 0;
  for (const key in wallet.transactions) {
    if (Object.hasOwn(wallet.transactions, key) && ++transactions > batchSize) return false;
  }
  return true;
}

/** Beignet extension API 1 supplies the on-chain wallet before its first refresh. */
export function createStartupScan() {
  let attachment;
  let timer;
  let attempted = false;
  let accelerated = false;

  function restoreCadence() {
    clearTimeout(timer);
    const electrum = attachment?.wallet.electrum;
    if (accelerated && electrum?.batchDelay === batchDelay) electrum.batchDelay = defaultDelay;
    accelerated = false;
  }

  const extension = {
    id: 'pubky-startup-scan',
    version: '1',
    api: 1,
    attach({ wallet, generation }) {
      restoreCadence();
      const current = { wallet, verified: false };
      attachment = current;
      if (
        !attempted &&
        generation === 1 &&
        wallet.electrum?.batchLimit === batchSize &&
        wallet.electrum.batchDelay === defaultDelay &&
        smallScan(wallet)
      ) {
        accelerated = true;
        wallet.electrum.batchDelay = batchDelay;
        // Limit the faster cadence even when new history makes the scan grow.
        timer = setTimeout(restoreCadence, 1500);
      }
      attempted = true;
      return {
        stop() {
          if (attachment !== current) return;
          restoreCadence();
          attachment = undefined;
        },
      };
    },
  };

  return {
    nodeOptions: { extensions: [extension] },
    restoreCadence,
    async confirm(refresh) {
      const current = attachment;
      if (!current) throw incomplete();
      if (current.verified) return;
      const { wallet } = current;
      restoreCadence();
      // The engine can return while its scan is still running. Requesting a
      // refresh then queues a second full scan. Observe the original result.
      const deadline = performance.now() + refreshWaitMs;
      while (wallet.isRefreshing && attachment === current && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (attachment !== current || wallet.isRefreshing) throw incomplete();
      if (wallet.refreshFailed) {
        await refresh();
        if (attachment !== current || wallet.isRefreshing || wallet.refreshFailed) throw incomplete();
      }
      current.verified = true;
    },
  };
}
