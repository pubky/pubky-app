import { createPortableRuntime } from '@beignet/portable-engine';
import { createSqlJsDatabaseFactory } from '@beignet/portable-engine/sqljs';
import { createAwayReceipts } from './away-receipts.mjs';
import { lastBalance, rememberBalance } from './balance.mjs';
import { provisionRingWallet, ringBinding, ringDeviceId } from './ring.mjs';
import { createStartupScan } from './startup-scan.mjs';
import { createStartupSockets } from './startup-sockets.mjs';
import { inspectFiles, openFiles, unlockVolume } from './storage.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const profilePath = '/pubky/deployment.json';
const configurationError = () =>
  Object.assign(new Error('The wallet relay is unavailable or is not configured for this wallet.'), {
    code: 'WALLET_CONFIGURATION',
  });
let engine;
let volume;
let awayReceipts;
let activeStore;
let shutdownFailed = false;
let owner;
let transition;
let closing = false;
let renewTimer;
let background = false;
let grantAbort;
let openingGrant;
let startupScan;
let transport;
let compiledDatabase;
let connectionIssue;
let activeGrant;
let ringOperation;
let activeRequests = 0;
// An unreviewed earlier payment survives a later successful send.
let sending = false;
let previousPaymentMarker = 0;
const busy = () => Object.assign(new Error('Another wallet operation is running.'), { code: 'WALLET_BUSY' });

async function connection() {
  const response = await fetch('/api/wallet/connection', {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    signal: AbortSignal.any([grantAbort.signal, AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw configurationError();
  const grant = await response.json();
  if (
    !['mainnet', 'testnet', 'regtest'].includes(grant.network) ||
    !/^(02|03)[a-fA-F0-9]{64}@[^\s]+$/.test(grant.primaryUri) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(grant.token) ||
    !Number.isFinite(grant.expiresAt) ||
    grant.expiresAt <= Date.now() ||
    grant.electrum?.host !== 'electrum.relay' ||
    grant.electrum.port !== 50001 ||
    grant.electrum.tls !== false
  ) {
    throw configurationError();
  }
  // The engine additionally enforces WSS, with WS allowed on loopback only.
  return grant;
}

// Loading the static SQL module neither opens a database nor reads a wallet file.
function prepareDatabase() {
  if (!compiledDatabase) {
    compiledDatabase = createSqlJsDatabaseFactory({
      load: (path) => volume.read(path),
      save: (path, data) => volume.write(path, data),
      locateFile: (name) => new URL(name, self.location.href).href,
    });
    void compiledDatabase.catch(() => { compiledDatabase = undefined; });
  }
  return compiledDatabase;
}

// The short-lived ticket only authorizes the deployment's fixed relay.
function prepareGrant() {
  if (!openingGrant) {
    grantAbort ??= new AbortController();
    const pending = connection();
    openingGrant = pending;
    void pending.catch(() => {
      if (openingGrant === pending) openingGrant = undefined;
    });
  }
  return openingGrant;
}

function discardIdleSockets() {
  transport?.close();
  transport = undefined;
}

function transportFor(grant) {
  if (transport?.grant !== grant) {
    discardIdleSockets();
    transport = { grant, ...createStartupSockets(grant) };
  }
  return transport;
}

function profile(grant) {
  return { network: grant.network, primaryUri: grant.primaryUri, electrum: grant.electrum };
}

function sameDeployment(left, right) {
  return (
    left.network === right.network &&
    left.primaryUri === right.primaryUri &&
    left.peerUrl === right.peerUrl &&
    left.electrumUrl === right.electrumUrl
  );
}

function renew(grant) {
  const delay = Math.max(1000, Math.min(240000, (grant.expiresAt - Date.now()) * 0.7));
  renewTimer = setTimeout(async () => {
    try {
      const next = await connection();
      if (closing || grantAbort?.signal.aborted) return;
      // Never move an existing wallet's authenticated peer to a different route.
      if (!sameDeployment(next, grant)) throw configurationError();
      grant.token = next.token;
      grant.expiresAt = next.expiresAt;
    } catch {
      // Established sockets continue. The relay verifies expiry on every new dial.
      if (!closing) renewTimer = setTimeout(() => renew(grant), 10000);
      return;
    }
    renew(grant);
  }, delay);
}

function rejectIfClosing() {
  if (closing) throw Object.assign(new Error('The wallet is locked.'), { code: 'WALLET_CLOSED' });
}

async function open(account, password, onUnlocked) {
  prepareDatabase();
  const store = await openFiles(account);
  try {
    volume = await unlockVolume(store, account, password);
    awayReceipts = createAwayReceipts(volume, background);
    rejectIfClosing();
    if (onUnlocked) onUnlocked(lastBalance(volume));
    const old = volume.read(profilePath);
    const saved = old && JSON.parse(decoder.decode(old));
    const existing = !!volume.read('/wallet/registry.json');
    connectionIssue = undefined;
    let grant;
    try {
      grant = await prepareGrant();
      rejectIfClosing();
      if (grant.expiresAt - Date.now() < 15000) {
        openingGrant = undefined;
        grant = await prepareGrant();
      }
      openingGrant = undefined;
    } catch {
      grant = undefined;
      rejectIfClosing();
      if (!saved || !existing) throw configurationError();
      connectionIssue =
        'The wallet relay is unavailable. You can view your recovery phrase. Lock and reopen to reconnect.';
    }
    const moved = saved && grant && (grant.network !== saved.network || grant.primaryUri !== saved.primaryUri);
    if (moved && existing) {
      grant = undefined;
      connectionIssue =
        'This wallet uses a different Bitcoin network or primary node. You can view your recovery phrase. Reopen with the original relay settings to make payments.';
    }
    const defaults = grant ? profile(grant) : saved;
    // A returning wallet can still reveal its phrase when its relay is down.
    const offline = Object.assign(
      () => {
        throw configurationError();
      },
      { fixedUpstream: true },
    );
    if (!grant) discardIdleSockets();
    const relay = grant && transportFor(grant);
    if (relay && existing && !background) relay.prepareElectrum();
    const databaseFactory = await prepareDatabase();
    rejectIfClosing();
    const fastStart = existing && grant?.network === 'mainnet' && grant.fastElectrumStart === true;
    startupScan = fastStart ? createStartupScan() : undefined;
    const primaryKey = grant?.primaryUri.split('@')[0].toLowerCase();
    engine = await createPortableRuntime({
      nodeOptions: startupScan?.nodeOptions,
      databaseFactory,
      volume,
      electrum: defaults.electrum,
      socketFactory: relay?.socketFactory ?? offline,
      onDiagnostic({ phase, message }) {
        if (
          (phase === 'peer:connect' || phase === 'peer:disconnect') &&
          !closing &&
          owner === account &&
          grant &&
          activeGrant === grant &&
          message.split(' ', 1)[0].toLowerCase() === primaryKey
        ) {
          // A hint to reread verified wallet state. No diagnostic payload leaves the worker.
          self.postMessage({ event: 'primary-change', account });
        }
        if (phase === 'engine-perf' && message.startsWith('initial-sync ')) startupScan?.restoreCadence();
        // Replenish an unused transport if restoring the node took long enough for it to expire.
        const createdNode = phase === 'engine-perf' && message.startsWith('create ');
        if (createdNode && relay && transport === relay && !closing && !background) {
          relay.preparePeer();
        }
      },
    });
    activeStore = store;
    rejectIfClosing();
    engine.setAppBackgrounded(background);
    if (!saved || (moved && !existing)) volume.write(profilePath, encoder.encode(JSON.stringify(defaults)));
    if (grant) renew(grant);
    activeGrant = grant;
    owner = account;
    return defaults;
  } catch (error) {
    if (volume) await close();
    else {
      discardIdleSockets();
      grantAbort?.abort();
      grantAbort = undefined;
      openingGrant = undefined;
      store.close();
    }
    throw error;
  }
}

async function close() {
  clearTimeout(renewTimer);
  grantAbort?.abort();
  grantAbort = undefined;
  openingGrant = undefined;
  discardIdleSockets();
  // The engine releases its realm claim even when stop fails. A second
  // engine.close() could then succeed without a shutdown. Keep the vault
  // lease and any pending payment marker until this worker is terminated.
  try {
    if (shutdownFailed) throw new Error();
    await engine?.close();
  } catch {
    shutdownFailed = true;
    throw Object.assign(new Error('Wallet shutdown was interrupted. Reopen and check Activity.'), {
      code: 'WALLET_CLOSE_UNCERTAIN',
    });
  }
  activeStore = undefined;
  startupScan = undefined;
  engine = undefined;
  volume?.close();
  volume = undefined;
  awayReceipts = undefined;
  owner = undefined;
  activeGrant = undefined;
}

async function handle({ id, operation, account, payload, notifyUnlocked }) {
  if (operation === 'close') {
    closing = true;
    discardIdleSockets();
    grantAbort?.abort();
    // Opening and provisioning each finish their own cleanup before the lease is released.
    await Promise.allSettled([transition, ringOperation]);
    await close();
    return;
  }
  rejectIfClosing();
  if (operation === 'visibility') {
    background = !!payload;
    awayReceipts?.setHidden(background);
    if (background) discardIdleSockets();
    engine?.setAppBackgrounded(background);
    return;
  }
  if (operation === 'inspect' || operation === 'open') {
    if (engine || transition) throw new Error('The wallet is already opening.');
    transition =
      operation === 'open'
        ? open(account, payload, notifyUnlocked === true
          ? (balance) => self.postMessage({ id, event: 'unlocked', account, balance })
          : undefined)
        : (async () => {
            prepareDatabase();
            const state = await inspectFiles(account);
            rejectIfClosing();
            const pending = prepareGrant();
            if (state.exists && !background) {
              // Preparing public Electrum checks needs only the relay ticket.
              // Wallet queries still start after unlock and the Ring device check.
              void pending
                .then((grant) => {
                  if (!closing && !background && openingGrant === pending && grant.expiresAt - Date.now() >= 15000) {
                    transportFor(grant).prepareElectrum();
                  }
                })
                .catch(() => {});
            }
            return state;
          })();
    try {
      return await transition;
    } finally {
      transition = undefined;
    }
  }
  if (!engine || account !== owner) throw new Error('Unlock this wallet first.');
  if (ringOperation) throw busy();
  if (operation === 'begin-send') {
    if (connectionIssue) throw configurationError();
    if (sending) throw busy();
    previousPaymentMarker = activeStore.markPayment();
    sending = true;
    return;
  }
  if (operation === 'finish-send') {
    if (!sending) throw new Error('No wallet payment is being submitted.');
    sending = false;
    if (['completed', 'pending', 'failed'].includes(payload)) activeStore.restorePaymentMarker(previousPaymentMarker);
    return;
  }
  if (operation === 'acknowledge-payment') {
    if (sending) throw busy();
    activeStore.clearPayment(payload === 'legacy');
    return;
  }
  if (operation === 'remember-balance') return rememberBalance(volume, payload);
  if (operation === 'offline-draft') return awayReceipts.draft(payload.walletId);
  if (operation === 'begin-offline-receive') return awayReceipts.begin(payload.walletId, payload.draft);
  if (operation === 'finish-offline-receive') return awayReceipts.issued(payload.walletId, payload.request);
  if (operation === 'discard-offline-draft') return awayReceipts.discard(payload.walletId, payload.id);
  if (operation === 'away-receipts')
    return awayReceipts.observe(payload.walletId, payload.rows, payload.primaryConnected);
  if (operation === 'ring-binding') return ringBinding(volume);
  if (operation === 'ring-device') return ringDeviceId(volume);
  if (operation === 'ring-wallet') {
    if (activeRequests) throw busy();
    if (connectionIssue || !activeGrant) throw configurationError();
    ringOperation = provisionRingWallet({
      engine,
      volume,
      account,
      deployment: profile(activeGrant),
      key: payload?.key,
      network: payload?.network,
      mode: payload?.mode,
      verify: async () => {
        const next = await connection();
        rejectIfClosing();
        if (owner !== account || !sameDeployment(next, activeGrant)) throw configurationError();
        activeGrant.token = next.token;
        activeGrant.expiresAt = next.expiresAt;
      },
    });
    try {
      return await ringOperation;
    } finally {
      ringOperation = undefined;
    }
  }
  if (operation === 'request') {
    // A recovery-only session cannot mutate wallet or channel state.
    if (
      connectionIssue &&
      !(
        payload.method === 'GET' &&
        (payload.path === '/api/config' ||
          payload.path === '/api/wallets' ||
          /^\/wallets\/[0-9a-f]{32}\/api\/mnemonic$/.test(payload.path))
      )
    ) {
      throw Object.assign(new Error(connectionIssue), { code: 'WALLET_CONFIGURATION' });
    }
    const bound = !!ringBinding(volume);
    if (
      bound &&
      payload.method?.toUpperCase() === 'POST' &&
      ['/api/wallets', '/api/wallets/import'].includes(payload.path)
    ) {
      throw Object.assign(new Error('This device vault is reserved for its Ring wallet.'), {
        code: 'WALLET_RING_BINDING',
      });
    }
    activeRequests++;
    try {
      const start = payload.method === 'POST' && /^\/api\/wallets\/([0-9a-f]{32})\/start$/.exec(payload.path);
      // The caller has verified the device lease. Overlap the fixed relay dial
      // with node restoration and leave the authenticated Lightning handshake to Beignet.
      if (start && !background) transport?.preparePeer();
      const result = await engine.request(payload);
      if (startupScan && start) {
        await startupScan.confirm(() => {
          rejectIfClosing();
          return engine.request({ method: 'POST', path: `/wallets/${start[1]}/api/wallet/refresh`, body: {} });
        });
      }
      if (bound && result && typeof result === 'object' && 'mnemonic' in result) {
        throw Object.assign(new Error('Use Ring to recover this wallet.'), { code: 'WALLET_RING_BINDING' });
      }
      return result;
    } finally {
      activeRequests--;
    }
  }
  if (operation === 'load-activity' || operation === 'save-activity') {
    if (!/^[0-9a-f]{32}$/.test(payload.walletId)) throw new Error('Invalid wallet id.');
    const path = '/pubky/history/' + payload.walletId;
    if (operation === 'save-activity') volume.write(path, encoder.encode(JSON.stringify(payload.rows)));
    else {
      const data = volume.read(path);
      return data && JSON.parse(decoder.decode(data));
    }
    return;
  }
  throw new Error('Unknown wallet operation.');
}

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ id: data.id, result: await handle(data) });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: {
        code: error?.code,
        status: error?.status,
        message:
          data.operation === 'ring-wallet'
            ? 'Ring wallet setup could not finish. Reopen the wallet and check its status.'
            : error instanceof Error
              ? error.message
              : 'The local wallet could not complete the operation.',
      },
    });
  } finally {
    if (data.operation === 'ring-wallet' && data.payload?.key instanceof Uint8Array) data.payload.key.fill(0);
  }
};
