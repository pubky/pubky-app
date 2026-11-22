// The pinned runtime falls back to destroy after a shutdown error and the wallet
// reports abandoned writes in its stop result. Observe the public instance methods
// for this close only. All return values and rejections still go to the engine.
import { sha256 } from '@noble/hashes/sha256';

const uncertain = () =>
  Object.assign(new Error('The wallet could not verify a clean shutdown.'), {
    code: 'WALLET_CLOSE_UNCERTAIN',
  });

function quietChannels(node, observedIds) {
  const manager = node.getChannelManager();
  return manager.listChannels().every((channel) => {
    const id = channel.getChannelId();
    if (id?.length !== 32) return false;
    observedIds.add(id.toString('hex'));
    const state = channel.getFullState();
    if (!(state.htlcs instanceof Map)) return false;
    if (state.state === 'CLOSED') {
      // The engine retains the last commitment's HTLCs after on-chain resolution.
      // Both monitor checks are required for its closeStatus.resolution to be 'resolved'.
      const monitor = manager.getMonitor(id);
      if (monitor?.isFullyResolved() !== true || monitor.isCommitmentConfirmed() !== true) return false;
    } else if (state.state !== 'NORMAL' || state.htlcs.size !== 0) return false;
    return (
      state.pendingLocalUpdates?.length === 0 &&
      !state.needsCommitment &&
      !state.awaitingLocalFeeCommitment &&
      !state.awaitingClosingSig &&
      !state.dataLossDetected &&
      !state.stateUncertain &&
      !state.restoreRevokedRisk &&
      !state.restoreRecencyUnproven &&
      !state.reestablishRecencyUnproven &&
      !state.reestablishSecretMissing
    );
  });
}

export function createHandoffClose() {
  let build;
  let database;
  let capture;
  return {
    extension: {
      id: 'pubky-handoff',
      version: '1',
      api: 1,
      attach({ wallet, network }) {
        const current = { wallet, network, started: false, shutdown: false };
        build = current;
        return {
          bind(node) {
            current.node = node;
          },
          start() {
            current.started = true;
          },
          stop(reason) {
            current.shutdown = reason === 'shutdown';
          },
        };
      },
    },
    opened(path, db) {
      if (/^\/wallet\/(mainnet|testnet|regtest)\.db$/.test(path)) database = { path, db };
      return db;
    },
    // SQL.js calls save synchronously from backup. Hash and commit the same
    // final export before releasing the live database.
    capture(path, bytes) {
      if (!capture || capture.path !== path) return false;
      try {
        const digest = sha256(bytes);
        capture.writeDatabase(database.path, bytes);
        capture.digest = digest;
      } finally {
        bytes.fill(0);
      }
      return true;
    },
    async close(engine, network, writeDatabase) {
      const current = build;
      const db = database?.db;
      if (
        !current?.started ||
        current.shutdown ||
        current.network !== network ||
        database?.path !== '/wallet/' + network + '.db' ||
        !current.node ||
        !db ||
        typeof writeDatabase !== 'function'
      )
        throw uncertain();
      const node = current.node;
      const wallet = current.wallet;
      const undo = [];
      const observedIds = new Set();
      let nodeStopped = false;
      let walletStopped = false;
      let dbClosed = false;
      let failed = false;
      let backup;
      const failure = () => {
        failed = true;
      };
      function observe(target, name, wrap) {
        const original = target[name];
        if (typeof original !== 'function') throw uncertain();
        const descriptor = Object.getOwnPropertyDescriptor(target, name);
        target[name] = wrap(original);
        undo.push(() => {
          if (descriptor) Object.defineProperty(target, name, descriptor);
          else delete target[name];
        });
      }
      try {
        node.on('node:error', failure);
        observe(
          node,
          'gracefulShutdown',
          (original) =>
            function (...args) {
              if (!quietChannels(node, observedIds)) failure();
              const result = original.apply(this, args);
              result
                .then(() => {
                  nodeStopped = quietChannels(node, observedIds);
                }, failure)
                .catch(failure);
              return result;
            },
        );
        observe(
          wallet,
          'stop',
          (original) =>
            function (...args) {
              const result = original.apply(this, args);
              result
                .then((r) => {
                  walletStopped = r?.isOk() === true && r.value === 'Wallet stopped.';
                }, failure)
                .catch(failure);
              return result;
            },
        );
        capture = { path: '/pubky/handoff-check/' + crypto.randomUUID(), writeDatabase };
        observe(
          db,
          'close',
          (original) =>
            function (...args) {
              try {
                if (!nodeStopped || !walletStopped || db.inTransaction !== false) failure();
                const checked = db.prepare('PRAGMA quick_check').pluck().all();
                if (checked.length !== 1 || checked[0] !== 'ok') failure();
                const saved = new Set(db.prepare('SELECT channel_id FROM channels').pluck().all());
                if (!quietChannels(node, observedIds) || [...observedIds].some((id) => !saved.has(id))) failure();
                if (!failed && build === current && current.shutdown) backup = db.backup(capture.path).catch(failure);
              } catch {
                failure();
              }
              const result = original.apply(this, args);
              dbClosed = true;
              return result;
            },
        );
        await engine.close();
        await backup;
        if (
          failed ||
          build !== current ||
          !current.shutdown ||
          !nodeStopped ||
          !walletStopped ||
          !dbClosed ||
          !capture.digest
        ) {
          throw uncertain();
        }
        return capture.digest;
      } finally {
        capture = undefined;
        node.off('node:error', failure);
        for (const restore of undo.reverse()) restore();
      }
    },
  };
}
