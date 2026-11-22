import { createPortableRuntime } from '@beignet/portable-engine';
import { createSqlJsDatabaseFactory } from '@beignet/portable-engine/sqljs';
import { createAwayReceipts } from './away-receipts.mjs';
import { lastBalance, rememberBalance } from './balance.mjs';
import { primaryChannelReadiness } from './channel-readiness.mjs';
import {
  assertHandoffReady,
  authorizeHandoff,
  handoffErrorMessage,
  installHandoff,
  sealHandoff,
  verifyHandoffSource,
} from './handoff.mjs';
import { createHandoffClose } from './handoff-close.mjs';
import { isMissingPrimary, matchesPrimaryPolicy, recoverPrimary } from './recover-primary.mjs';
import { provisionRingWallet, ringBinding, ringDeviceId } from './ring.mjs';
import { createStartupScan } from './startup-scan.mjs';
import { createStartupSockets } from './startup-sockets.mjs';
import { inspectFiles, openFiles, unlockVolume, unlockVolumeWithRing } from './storage.mjs';

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
let refreshingGrant;
let background = false;
let grantAbort;
let openingGrant;
let startupScan;
let channelReadiness;
let activeProgress;
let primaryConnected = false;
let primaryDialIssue = null;
let originalPrimaryPolicy;
let primaryRepair;
let transport;
let compiledDatabase;
let connectionIssue;
let activeGrant;
let importOnlyGrant;
let ringOperation;
let activeRequests = 0;
let requestsDrained;
let handoffStopped = false;
let preparedSource;
let engineFilesSealed = false;
let lateWrite = false;
let pendingLocalUnlock;
const handoffClose = createHandoffClose();
// An unreviewed earlier payment survives a later successful send.
let sending = false;
let previousPaymentMarker = 0;
const busy = () => Object.assign(new Error('Another wallet operation is running.'), { code: 'WALLET_BUSY' });

// Only the local dialer's fixed errors qualify. A peer's warning, error text,
// and disconnect reason can contain arbitrary data and never feed this function.
function dialIssue(message, primaryUri) {
  const [key, address] = primaryUri.split('@');
  // BeignetNode wraps transport failures with this primary's address. Its own
  // connection deadline produces an unwrapped diagnostic instead.
  const prefix = `Failed to connect to ${key.slice(0, 16)}…@${address}: `;
  const reason = message.startsWith(prefix) ? message.slice(prefix.length) : message;
  const deadline = /^connectPeer timed out after \d+ms \(is (.+) the peer's P2P address\?\)$/.exec(message);
  if (reason === 'Handshake timeout' || reason === 'Connection timeout' || deadline?.[1] === address)
    return 'handshake-timeout';
  if (
    reason === 'Connection closed during handshake' ||
    reason === 'Socket closed before read completed' ||
    reason === 'Connection closed while draining buffered frames'
  )
    return 'handshake-closed';
  if (
    reason === 'Unable to connect to transport relay' ||
    reason === `Primary node connection is unavailable at ${address}. Check the address, port, and network.`
  )
    return 'relay-unavailable';
  if (
    reason === 'Act 2 ephemeral key is not a valid curve point' ||
    reason === 'Peer networks share no chain with ours' ||
    /^Unsupported handshake version: \d{1,3}$/.test(reason) ||
    /^Expected init message \(type 16\), got type \d{1,5}$/.test(reason)
  )
    return 'protocol-mismatch';
  return null;
}

function watchSlowStart(id) {
  let phase = 'opening';
  let lastPhase;
  let lastConnected;
  let timer = setTimeout(publish, 1200);
  function publish() {
    timer = undefined;
    if (closing || (phase === lastPhase && primaryConnected === lastConnected)) return;
    lastPhase = phase;
    lastConnected = primaryConnected;
    self.postMessage({ id, event: 'start-progress', phase, primaryConnected });
  }
  return {
    update(nextPhase = phase) {
      phase = nextPhase;
      if (timer === undefined) timer = setTimeout(publish, 300);
    },
    stop() {
      clearTimeout(timer);
    },
  };
}

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

// After close, a late engine callback can never write into the source snapshot
// or a newly installed destination. The worker retains its own OPFS lease.
function engineVolume(writing = false) {
  if (engineFilesSealed) {
    if (writing) lateWrite = true;
    throw busy();
  }
  return volume;
}
const engineFiles = {
  read: (path) => engineVolume().read(path),
  list: (prefix) => engineVolume().list(prefix),
  write: (path, bytes) => engineVolume(true).write(path, bytes),
  remove: (path) => engineVolume(true).remove(path),
  rename: (from, to) => engineVolume(true).rename(from, to),
};

// Loading the static SQL module neither opens a database nor reads a wallet file.
function prepareDatabase() {
  if (!compiledDatabase) {
    compiledDatabase = createSqlJsDatabaseFactory({
      load: (path) => engineFiles.read(path),
      save: (path, data) => {
        if (!handoffClose.capture(path, data)) engineFiles.write(path, data);
      },
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

function renew(grant, delay = Math.max(1000, Math.min(240000, (grant.expiresAt - Date.now()) * 0.7))) {
  clearTimeout(renewTimer);
  renewTimer = setTimeout(() => void refreshGrant(grant).catch(() => {}), delay);
}

function refreshGrant(grant) {
  if (refreshingGrant) return refreshingGrant;
  refreshingGrant = (async () => {
    let retryDelay = 10000;
    try {
      const next = await connection();
      rejectIfClosing();
      // Never move an existing wallet's authenticated peer to a different route.
      if (handoffStopped || activeGrant !== grant || !sameDeployment(next, grant)) throw configurationError();
      grant.token = next.token;
      grant.expiresAt = next.expiresAt;
      retryDelay = undefined;
    } finally {
      refreshingGrant = undefined;
      if (!closing && !handoffStopped && activeGrant === grant) renew(grant, retryDelay);
    }
  })();
  return refreshingGrant;
}

function rejectIfClosing() {
  if (closing) throw Object.assign(new Error('The wallet is locked.'), { code: 'WALLET_CLOSED' });
}

async function checkOriginalPrimary(runtime, walletId, grant, assertCurrent) {
  let record;
  try {
    record = await runtime.request({ method: 'GET', path: '/api/wallets/' + walletId });
  } catch {
    return false;
  }
  assertCurrent();
  if (!record || record.id !== walletId || record.network !== grant.network) return false;
  const conflictPath = '/pubky/primary-policy-conflict/' + walletId;
  if (!matchesPrimaryPolicy(record, grant.network, grant.primaryUri)) {
    if (!volume.read(conflictPath)) volume.write(conflictPath, Uint8Array.of(1));
    return false;
  }
  if (!volume.read(conflictPath)) return true;
  // A later explicit selection of the deployment primary supersedes an old conflict.
  if (record.lfbw.primaryUri !== grant.primaryUri) return false;
  volume.remove(conflictPath);
  return true;
}

async function startOrReconnectRestoredWallet(request, walletId, binding) {
  const runtime = engine;
  const grant = activeGrant;
  const assertCurrent = () => {
    rejectIfClosing();
    if (runtime !== engine || grant !== activeGrant || handoffStopped || connectionIssue) throw busy();
  };
  // Startup can erase evidence of a previously configured alternative.
  originalPrimaryPolicy ??= checkOriginalPrimary(runtime, walletId, grant, assertCurrent);
  const allowed = await originalPrimaryPolicy;
  assertCurrent();
  const record = await runtime.request(request);
  if (!allowed || record?.id !== walletId || !isMissingPrimary(record)) return record;
  assertCurrent();
  if (!primaryRepair) {
    primaryRepair = recoverPrimary(runtime, record, grant.network, grant.primaryUri, assertCurrent, binding)
      .finally(() => { primaryRepair = undefined; });
  }
  return primaryRepair;
}

function verifyLocalUnlockIntent(account, scope, mode) {
  const plan = pendingLocalUnlock;
  if (!plan || plan.account !== account || plan.mode !== mode ||
      plan.deviceId !== scope?.deviceId || plan.network !== scope?.network) {
    throw Object.assign(new Error('Start Ring unlock setup again on this device.'), { code: 'WALLET_LOCAL_UNLOCK' });
  }
  pendingLocalUnlock = undefined;
}

async function prepareLocalUnlock(account) {
  if (engine) {
    if (account !== owner || !activeGrant || connectionIssue || await activeStore.readLocalUnlock(true)) throw busy();
  } else {
    const state = await inspectFiles(account);
    if (state.exists || state.ringUnlock) throw new Error('Unlock your current wallet before enabling Ring.');
  }
  const grant = engine ? activeGrant : await prepareGrant();
  rejectIfClosing();
  const scope = { network: grant.network, deviceId: crypto.randomUUID() };
  pendingLocalUnlock = { ...scope, mode: engine ? 'enroll' : 'create', account };
  return scope;
}

async function open(account, password, onUnlocked, localUnlock) {
  prepareDatabase();
  const store = await openFiles(account);
  try {
    if (localUnlock) {
      const { key, network, create } = localUnlock;
      if (create) {
        verifyLocalUnlockIntent(account, localUnlock, 'create');
        if ((await prepareGrant()).network !== network) throw configurationError();
      }
      rejectIfClosing();
      try {
        volume = await unlockVolumeWithRing(store, account, localUnlock, key, create === true);
      } finally { key.fill(0); }
    } else {
      volume = await unlockVolume(store, account, password);
    }
    awayReceipts = createAwayReceipts(volume, background);
    rejectIfClosing();
    if (!localUnlock && onUnlocked) onUnlocked(lastBalance(volume));
    const old = volume.read(profilePath);
    const saved = old && JSON.parse(decoder.decode(old));
    if (localUnlock && saved && saved.network !== localUnlock.network) throw configurationError();
    if (localUnlock && saved && onUnlocked) onUnlocked(lastBalance(volume));
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
    // A stopped former owner can receive the current owner's authenticated
    // snapshot on this network. Its local node still opens with no transport.
    importOnlyGrant = moved && existing && grant.network === saved.network ? grant : undefined;
    if (moved && existing) {
      grant = undefined;
      connectionIssue =
        'This wallet uses a different Bitcoin network or primary node. You can view your recovery phrase. Reopen with the original relay settings to make payments.';
    }
    const defaults = grant ? profile(grant) : saved;
    if (localUnlock && defaults.network !== localUnlock.network) throw configurationError();
    if (localUnlock && !saved && onUnlocked) onUnlocked(lastBalance(volume));
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
    const active = () => grant && activeGrant === grant && !closing && !handoffStopped && owner === account;
    const extensions = [...(startupScan?.nodeOptions.extensions ?? []), handoffClose.extension];
    if (primaryKey) {
      channelReadiness = primaryChannelReadiness(primaryKey, () => {
        if (active()) self.postMessage({ event: 'primary-change', account });
      });
      extensions.push(channelReadiness);
    }
    engine = await createPortableRuntime({
      nodeOptions: extensions.length ? { extensions } : undefined,
      databaseFactory: (path) => handoffClose.opened(path, databaseFactory(path)),
      volume: engineFiles,
      electrum: defaults.electrum,
      socketFactory: relay?.socketFactory ?? offline,
      onDiagnostic({ phase, message }) {
        if (active() && (phase === 'primary-connect' || phase === 'primary-redial')) {
          primaryDialIssue = dialIssue(message, grant.primaryUri);
        }
        if (
          (phase === 'peer:connect' || phase === 'peer:disconnect') &&
          active() &&
          message.split(' ', 1)[0].toLowerCase() === primaryKey
        ) {
          primaryConnected = phase === 'peer:connect';
          if (primaryConnected) primaryDialIssue = null;
          activeProgress?.update();
          // A hint to reread verified wallet state. No diagnostic payload leaves the worker.
          self.postMessage({ event: 'primary-change', account });
        }
        if (phase === 'engine-perf' && message.startsWith('initial-sync ')) {
          startupScan?.restoreCadence();
          if (active()) activeProgress?.update('finishing');
        }
        // Replenish an unused transport if restoring the node took long enough for it to expire.
        const createdNode = phase === 'engine-perf' && message.startsWith('create ');
        if (createdNode && active()) {
          primaryConnected = false;
          primaryDialIssue = null;
          activeProgress?.update('scanning');
        }
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

async function stopEngine(handoffNetwork) {
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
    if (engine) {
      let digest;
      if (handoffNetwork) digest = await handoffClose.close(engine, handoffNetwork, engineFiles.write);
      else await engine.close();
      if (handoffStopped) engineFilesSealed = true;
      volume.compact();
      engine = undefined;
      return digest;
    }
  } catch {
    shutdownFailed = true;
    if (handoffStopped) engineFilesSealed = true;
    throw Object.assign(new Error('Wallet shutdown was interrupted. Reopen and check Activity.'), {
      code: 'WALLET_CLOSE_UNCERTAIN',
    });
  }
}

async function close() {
  preparedSource?.digest.fill(0);
  preparedSource = undefined;
  await stopEngine();
  activeStore = undefined;
  startupScan = undefined;
  channelReadiness = undefined;
  primaryConnected = false;
  primaryDialIssue = null;
  originalPrimaryPolicy = undefined;
  primaryRepair = undefined;
  volume?.close();
  volume = undefined;
  awayReceipts = undefined;
  owner = undefined;
  activeGrant = undefined;
  importOnlyGrant = undefined;
}

async function prepareSource(account, { network, walletId }) {
  if (sending || activeStore.paymentNeedsReview()) {
    throw Object.assign(new Error('Review the payment in Activity before moving this wallet.'), { code: 'WALLET_HANDOFF_PENDING' });
  }
  const binding = ringBinding(volume);
  if (
    !binding ||
    owner !== account ||
    !activeGrant ||
    connectionIssue ||
    network !== activeGrant.network ||
    binding.network !== network ||
    typeof walletId !== 'string' ||
    !/^[0-9a-f]{32}$/.test(walletId)
  ) throw configurationError();
  if (activeRequests) await new Promise((resolve) => { requestsDrained = resolve; });
  rejectIfClosing();
  await assertHandoffReady(engine, walletId);
  rejectIfClosing();
  handoffClose.assertChannelsReady(network);
  handoffStopped = true;
  const digest = await stopEngine(network);
  rejectIfClosing();
  preparedSource = { digest, network, walletId, deviceId: binding.deviceId };
  return binding;
}

async function exportPrepared(account, payload) {
  const source = preparedSource;
  if (!source || account !== owner || source.network !== payload?.network || source.deviceId !== payload?.sourceDeviceId)
    throw busy();
  const auth = await authorizeHandoff(account, payload, profile(activeGrant));
  if (verifyHandoffSource(volume, auth) !== source.walletId) throw configurationError();
  rejectIfClosing();
  const envelope = await sealHandoff(volume, auth, source.digest);
  rejectIfClosing();
  if (lateWrite) throw Object.assign(new Error(), { code: 'WALLET_CLOSE_UNCERTAIN' });
  source.digest.fill(0);
  preparedSource = undefined;
  return envelope;
}

async function handoff(operation, account, payload) {
  if (sending || activeStore.paymentNeedsReview()) {
    throw Object.assign(new Error('Review the payment in Activity before moving this wallet.'), { code: 'WALLET_HANDOFF_PENDING' });
  }
  let grant = connectionIssue ? undefined : activeGrant;
  if (operation === 'handoff-import' && importOnlyGrant && payload?.network === importOnlyGrant.network) {
    // Recheck after Ring approval. This grant authorizes only the incoming
    // envelope's deployment check and is never installed on the local node.
    grant = await connection().catch(() => { throw configurationError(); });
    rejectIfClosing();
    if (!sameDeployment(grant, importOnlyGrant)) throw configurationError();
  }
  if (!grant || grant.network !== payload?.network) throw configurationError();
  if (activeRequests) await new Promise((resolve) => { requestsDrained = resolve; });
  rejectIfClosing();
  const auth = await authorizeHandoff(account, payload, profile(grant));
  if (operation === 'handoff-export') {
    const id = verifyHandoffSource(volume, auth);
    await assertHandoffReady(engine, id);
    rejectIfClosing();
    handoffClose.assertChannelsReady(auth.network);
  } else {
    // Import can replace only an idle runtime. Merely inspecting a stale
    // vault does not start its Lightning node or give it writer authority.
    const records = await engine.request({ method: 'GET', path: '/api/wallets' });
    if (!Array.isArray(records) || records.some((record) => record.status !== 'stopped')) throw busy();
  }
  rejectIfClosing();
  handoffStopped = true;
  const digest = await stopEngine(operation === 'handoff-export' ? auth.network : undefined);
  rejectIfClosing();
  if (operation === 'handoff-import') {
    return installHandoff(volume, auth, payload.targetDeviceId, payload.envelope, rejectIfClosing);
  }
  const envelope = await sealHandoff(volume, auth, digest);
  rejectIfClosing();
  if (lateWrite) throw Object.assign(new Error('Wallet shutdown was interrupted.'), { code: 'WALLET_CLOSE_UNCERTAIN' });
  return envelope;
}

async function handle({ id, operation, account, payload, notifyUnlocked, notifyStartProgress }) {
  if (operation === 'close') {
    closing = true;
    requestsDrained?.();
    discardIdleSockets();
    grantAbort?.abort();
    // Opening and provisioning each finish their own cleanup before the lease is released.
    await Promise.allSettled([transition, ringOperation]);
    await close();
    return;
  }
  rejectIfClosing();
  if (handoffStopped) {
    if (operation === 'handoff-export' && preparedSource && !ringOperation) {
      ringOperation = exportPrepared(account, payload);
      try {
        return await ringOperation;
      } finally {
        ringOperation = undefined;
      }
    }
    if (operation === 'ring-binding' && account === owner && !ringOperation) return ringBinding(volume);
    throw busy();
  }
  if (operation === 'visibility') {
    background = !!payload;
    awayReceipts?.setHidden(background);
    if (background) discardIdleSockets();
    else if (activeGrant && activeGrant.expiresAt - Date.now() < 15000) {
      // A suspended browser may wake after its ticket expires. Renew before
      // Beignet resumes its redial timers, then respect any newer visibility event.
      await refreshGrant(activeGrant).catch(() => {});
    }
    if (!closing && !handoffStopped) engine?.setAppBackgrounded(background);
    return;
  }
  if (operation === 'prepare-local-unlock') {
    if (transition || ringOperation) throw busy();
    transition = prepareLocalUnlock(account);
    try { return await transition; } finally { transition = undefined; }
  }
  if (operation === 'inspect' || operation === 'open' || operation === 'open-with-ring') {
    if (engine || transition) throw new Error('The wallet is already opening.');
    transition =
      operation !== 'inspect'
        ? open(account, operation === 'open' ? payload : undefined, notifyUnlocked === true
          ? (balance) => self.postMessage({ id, event: 'unlocked', account, balance })
          : undefined, operation === 'open-with-ring' ? payload : undefined)
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
  if (operation === 'prepare-handoff') {
    ringOperation = prepareSource(account, payload);
    try {
      return await ringOperation;
    } finally {
      ringOperation = undefined;
    }
  }
  if (operation === 'enroll-local-unlock') {
    if (!activeGrant || connectionIssue || activeGrant.network !== payload?.network) throw configurationError();
    verifyLocalUnlockIntent(account, payload, 'enroll');
    ringOperation = volume.enrollLocalUnlock(payload, payload.key);
    try { return await ringOperation; } finally { ringOperation = undefined; }
  }
  if (operation === 'handoff-export' || operation === 'handoff-import') {
    ringOperation = handoff(operation, account, payload);
    try {
      return await ringOperation;
    } finally {
      ringOperation = undefined;
    }
  }
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
      verify: () => refreshGrant(activeGrant),
    });
    try {
      return await ringOperation;
    } finally {
      ringOperation = undefined;
    }
  }
  const inspectPrimary = operation === 'primary-connection-issue';
  if (inspectPrimary) {
    if (typeof payload?.walletId !== 'string' || !/^[0-9a-f]{32}$/.test(payload.walletId)) throw configurationError();
    payload = { method: 'GET', path: `/wallets/${payload.walletId}/api/recovery/status` };
  }
  if (operation === 'request' || inspectPrimary) {
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
    const bound = ringBinding(volume);
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
    let progress;
    try {
      const start = payload.method === 'POST' && /^\/api\/wallets\/([0-9a-f]{32})\/start$/.exec(payload.path);
      const retry = payload.method === 'POST' && /^\/api\/wallets\/([0-9a-f]{32})\/lfbw\/(?:setup|retry)$/.exec(payload.path);
      // A transport ticket may have been evicted even before expiry. Explicit
      // reconnects always get a fresh ticket before opening another socket.
      if (retry) {
        await refreshGrant(activeGrant);
        rejectIfClosing();
      }
      if (start && notifyStartProgress === true && !activeProgress) {
        progress = watchSlowStart(id);
        activeProgress = progress;
      }
      // The caller has verified the device lease. Overlap the fixed relay dial
      // with node restoration and leave the authenticated Lightning handshake to Beignet.
      if (start && !background) transport?.preparePeer();
      const setup = start || retry;
      const result = setup && activeGrant && bound?.network === activeGrant.network && (bound.transferId || bound.mode === 'restore')
        ? await startOrReconnectRestoredWallet(payload, setup[1], bound)
        : await engine.request(payload);
      if (payload.method === 'GET' && /^\/wallets\/[0-9a-f]{32}\/api\/channels$/.test(payload.path) &&
          !closing && !handoffStopped && !background && activeGrant) {
        channelReadiness?.observeFunding(result);
      }
      if (inspectPrimary) {
        if (result.state === 'fenced' || result.node?.fenced === true || result.node?.gate === 'fenced')
          return 'ownership-changed';
        if (result.node?.startupRepairPending === true || result.node?.gate === 'quarantined') return 'ownership-pending';
        return primaryDialIssue;
      }
      if (startupScan && start) {
        // Confirmation can outlast the engine's initial-sync mark while the Bitcoin scan settles.
        progress?.update('scanning');
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
      if (progress) {
        progress.stop();
        activeProgress = undefined;
      }
      activeRequests--;
      if (!activeRequests && requestsDrained) {
        requestsDrained();
        requestsDrained = undefined;
      }
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
    const result = await handle(data);
    if (data.operation === 'handoff-export') self.postMessage({ id: data.id, result }, [result.buffer]);
    else self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: {
        code: error?.code,
        status: error?.status,
        message:
          ['prepare-handoff', 'handoff-export', 'handoff-import'].includes(data.operation)
            ? handoffErrorMessage(error)
            : data.operation === 'ring-wallet'
            ? 'Ring wallet setup could not finish. Reopen the wallet and check its status.'
            : error instanceof Error
              ? error.message
              : 'The local wallet could not complete the operation.',
      },
    });
  } finally {
    if (['open-with-ring', 'enroll-local-unlock', 'ring-wallet', 'handoff-export', 'handoff-import'].includes(data.operation) && data.payload?.key instanceof Uint8Array) data.payload.key.fill(0);
  }
};
