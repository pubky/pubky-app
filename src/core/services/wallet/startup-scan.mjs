// The tested relay accepts the engine's normal batches with a shorter pause.
// Limit this to wallets whose saved coins and transactions each fit in one batch.
const batchSize = 20;
const batchDelay = 15;
const defaultDelay = 50;

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
  let wallet;
  let timer;
  let attempted = false;

  function restoreCadence() {
    clearTimeout(timer);
    if (wallet?.electrum.batchDelay === batchDelay) wallet.electrum.batchDelay = defaultDelay;
  }

  const extension = {
    id: 'pubky-startup-scan',
    version: '1',
    api: 1,
    attach({ wallet: attached, generation }) {
      if (
        attempted ||
        generation !== 1 ||
        attached.electrum?.batchLimit !== batchSize ||
        attached.electrum.batchDelay !== defaultDelay ||
        !smallScan(attached)
      )
        return {};
      attempted = true;
      wallet = attached;
      wallet.electrum.batchDelay = batchDelay;
      // Limit the faster cadence even when new history makes the scan grow,
      // the peer is slow, or startup fails before reporting its sync mark.
      timer = setTimeout(restoreCadence, 1500);
      return {
        stop() {
          restoreCadence();
          wallet = undefined;
        },
      };
    },
  };

  return {
    nodeOptions: { extensions: [extension] },
    restoreCadence,
    async confirm(refresh) {
      const checked = wallet;
      if (!checked) return;
      restoreCadence();
      // The engine's startup wait is bounded. Retry an unfinished or failed
      // refresh with the original cadence before returning payment readiness.
      if (checked.isRefreshing || checked.refreshFailed) {
        await refresh();
        if (wallet !== checked || checked.isRefreshing || checked.refreshFailed) {
          throw Object.assign(new Error('Bitcoin sync is incomplete. Retry the connection before sending.'), {
            code: 'WALLET_SYNC_INCOMPLETE',
          });
        }
      }
      wallet = undefined;
    },
  };
}
