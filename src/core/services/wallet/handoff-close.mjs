// The pinned runtime falls back to destroy after a shutdown error and the wallet
// reports abandoned writes in its stop result. Observe the public instance methods
// for this close only. All return values and rejections still go to the engine.
import { sha256 } from '@noble/hashes/sha256';
import { pendingHandoff } from './handoff.mjs';

const uncertain = () =>
  Object.assign(new Error('The wallet could not verify a clean shutdown.'), {
    code: 'WALLET_CLOSE_UNCERTAIN',
  });

const channelFlags = [
  ['dataLossDetected', 'CHANNEL_DATA_LOSS'],
  ['stateUncertain', 'CHANNEL_STATE_UNCERTAIN'],
  ['restoreRevokedRisk', 'CHANNEL_COMMITMENT_REVOKED'],
  ['restoreRecencyUnproven', 'CHANNEL_RESTORE_RECENCY'],
  ['reestablishRecencyUnproven', 'CHANNEL_REESTABLISH_RECENCY'],
  ['reestablishSecretMissing', 'CHANNEL_REESTABLISH_SECRET'],
  ['needsCommitment', 'CHANNEL_NEEDS_COMMITMENT'],
  ['awaitingLocalFeeCommitment', 'CHANNEL_FEE_COMMITMENT'],
  ['awaitingClosingSig', 'CHANNEL_CLOSE_SIGNATURE'],
];

function channelIssue(node, observedIds) {
  try {
    const manager = node.getChannelManager();
    for (const channel of manager.listChannels()) {
      const id = channel.getChannelId();
      if (!id) return 'CHANNEL_PROVISIONAL';
      if (id.length !== 32) return 'CHANNEL_STATE_UNREADABLE';
      observedIds.add(id.toString('hex'));
      const state = channel.getFullState();
      if (!(state?.htlcs instanceof Map) || !Array.isArray(state.pendingLocalUpdates))
        return 'CHANNEL_STATE_UNREADABLE';
      if (state.state === 'CLOSED') {
        // After the closing transaction confirms and all outputs resolve, the last
        // commitment and its recovery or replay flags are history for this channel.
        const monitor = manager.getMonitor(id);
        if (!monitor) return 'CHANNEL_MONITOR_UNAVAILABLE';
        if (monitor.isCommitmentConfirmed() !== true) return 'CHANNEL_CLOSE_UNCONFIRMED';
        if (monitor.isFullyResolved() !== true) return 'CHANNEL_CLOSE_UNRESOLVED';
        continue;
      }
      for (const [flag, reason] of channelFlags) {
        if (state[flag]) return reason;
      }
      if (state.pendingLocalUpdates.length > 0) return 'CHANNEL_PENDING_UPDATES';
      if (state.state === 'AWAITING_REESTABLISH') return 'CHANNEL_RECONNECTING';
      if (state.state === 'SPLICING') return 'CHANNEL_SPLICING';
      if (state.state !== 'NORMAL') return 'CHANNELS_UNSETTLED';
      if (state.htlcs.size > 0) return 'CHANNEL_ACTIVE_HTLCS';
    }
    return null;
  } catch {
    return 'CHANNEL_STATE_UNREADABLE';
  }
}

export function createHandoffClose() {
  let build;
  let database;
  let capture;

  function activeBuild(network) {
    if (
      build?.started &&
      !build.shutdown &&
      build.node &&
      build.network === network &&
      database?.db &&
      database.path === '/wallet/' + network + '.db'
    )
      return build;
  }

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
    assertChannelsReady(network) {
      // Evaluate the exact shutdown predicate while the node still owns its
      // sockets, lease and database. Inspection failures leave the wallet live.
      const current = activeBuild(network);
      const observedIds = new Set();
      const reason = current ? channelIssue(current.node, observedIds) : 'CHANNEL_STATE_UNREADABLE';
      if (reason) throw pendingHandoff(reason);
      current.observedIds = observedIds;
    },
    async close(engine, network, writeDatabase) {
      const current = activeBuild(network);
      if (!current || typeof writeDatabase !== 'function') throw uncertain();
      const db = database.db;
      const node = current.node;
      const wallet = current.wallet;
      const undo = [];
      const observedIds = current.observedIds ?? new Set();
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
              if (channelIssue(node, observedIds)) failure();
              const result = original.apply(this, args);
              result
                .then(() => {
                  nodeStopped = !channelIssue(node, observedIds);
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
                if (channelIssue(node, observedIds) || [...observedIds].some((id) => !saved.has(id))) failure();
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
