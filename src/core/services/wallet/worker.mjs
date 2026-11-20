import { createPortableRuntime, createRelaySocketFactory } from '@beignet/portable-engine';
import { createSqlJsDatabaseFactory } from '@beignet/portable-engine/sqljs';
import { openFiles, unlockVolume } from './storage.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const profilePath = '/pubky/deployment.json';
const configurationError = () =>
  Object.assign(new Error('The wallet relay is unavailable or is not configured for this wallet.'), {
    code: 'WALLET_CONFIGURATION',
  });
let engine;
let volume;
let activeStore;
let shutdownFailed = false;
let owner;
let transition;
let closing = false;
let renewTimer;
let background = false;
let grantAbort;
let connectionIssue;

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

function profile(grant) {
  return { network: grant.network, primaryUri: grant.primaryUri, electrum: grant.electrum };
}

function renew(grant) {
  const delay = Math.max(1000, Math.min(240000, (grant.expiresAt - Date.now()) * 0.7));
  renewTimer = setTimeout(async () => {
    try {
      const next = await connection();
      if (closing || grantAbort?.signal.aborted) return;
      // Never move an existing wallet's authenticated peer to a different route.
      if (
        next.network !== grant.network ||
        next.primaryUri !== grant.primaryUri ||
        next.peerUrl !== grant.peerUrl ||
        next.electrumUrl !== grant.electrumUrl
      )
        throw configurationError();
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

function ensureOpeningAllowed() {
  if (closing) throw Object.assign(new Error('The wallet is locked.'), { code: 'WALLET_CLOSED' });
}

async function open(account, password) {
  const store = await openFiles(account);
  try {
    volume = await unlockVolume(store, account, password);
    ensureOpeningAllowed();
    grantAbort = new AbortController();
    const old = volume.read(profilePath);
    const saved = old && JSON.parse(decoder.decode(old));
    const existing = !!volume.read('/wallet/registry.json');
    connectionIssue = undefined;
    let grant;
    try {
      grant = await connection();
    } catch {
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
    const socketFactory = grant ? createRelaySocketFactory(grant) : offline;
    const databaseFactory = await createSqlJsDatabaseFactory({
      load: (path) => volume.read(path),
      save: (path, data) => volume.write(path, data),
      locateFile: (name) => new URL(name, self.location.href).href,
    });
    ensureOpeningAllowed();
    store.markActive();
    engine = await createPortableRuntime({ databaseFactory, volume, electrum: defaults.electrum, socketFactory });
    activeStore = store;
    ensureOpeningAllowed();
    engine.setAppBackgrounded(background);
    if (!saved || (moved && !existing)) volume.write(profilePath, encoder.encode(JSON.stringify(defaults)));
    if (grant) renew(grant);
    owner = account;
    return defaults;
  } catch (error) {
    if (volume) await close();
    else store.close();
    throw error;
  }
}

async function close() {
  clearTimeout(renewTimer);
  grantAbort?.abort();
  // The engine releases its realm claim even when stop fails. A second
  // engine.close() could then succeed without a shutdown. Leave the active
  // marker and OPFS lease intact until this worker has been terminated.
  try {
    if (shutdownFailed) throw new Error();
    await engine?.close();
    activeStore?.markClosed();
  } catch {
    shutdownFailed = true;
    throw Object.assign(new Error('Wallet shutdown was interrupted. Reopen and check Activity.'), {
      code: 'WALLET_CLOSE_UNCERTAIN',
    });
  }
  activeStore = undefined;
  engine = undefined;
  volume?.close();
  volume = undefined;
  owner = undefined;
}

async function handle({ operation, account, payload }) {
  if (operation === 'close') {
    closing = true;
    grantAbort?.abort();
    try {
      await transition;
    } catch {
      /* Failed opening already released the vault. */
    }
    await close();
    return;
  }
  ensureOpeningAllowed();
  if (operation === 'visibility') {
    background = !!payload;
    engine?.setAppBackgrounded(background);
    return;
  }
  if (operation === 'inspect' || operation === 'open') {
    if (engine || transition) throw new Error('The wallet is already opening.');
    transition =
      operation === 'open'
        ? open(account, payload)
        : (async () => {
            const store = await openFiles(account);
            try {
              return { exists: store.read() !== null, ...(store.interrupted() ? { interrupted: true } : {}) };
            } finally {
              store.close();
            }
          })();
    try {
      return await transition;
    } finally {
      transition = undefined;
    }
  }
  if (!engine || account !== owner) throw new Error('Unlock this wallet first.');
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
    return engine.request(payload);
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
        message: error instanceof Error ? error.message : 'The local wallet could not complete the operation.',
      },
    });
  }
};
