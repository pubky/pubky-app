import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { bindingPath, bindingRecord, deriveRingEntropy, devicePath, uuid } from './ring.mjs';
import { maxPackedBytes, unpackFiles } from './vault-overlay.mjs';

const text = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const salt = text.encode('pubky.app/bitcoin-wallet/clean-handoff/v1');
const nonceBytes = 12;
const tagBytes = 16;
export const maxEnvelopeBytes = maxPackedBytes + nonceBytes + tagBytes;
const limits = { maxFiles: 16384, maxNameBytes: 4096, views: true };
const profilePath = '/pubky/deployment.json';
const registryPath = '/wallet/registry.json';

const transferMessages = {
  RING_BINDING:
    'The Ring approval does not match this wallet and device. Approve with the identity that created the wallet.',
  REGISTRY: 'The saved wallet record does not match the Ring wallet. Lock and reopen the wallet to check it.',
  PROFILE:
    'The Bitcoin network or primary node differs from the wallet’s saved configuration. Reopen with its original relay settings.',
  RECOVERY_PENDING:
    'This wallet is waiting for its channel backup from the recovery peer. Check Recovery before moving it.',
  CHANNELS_UNSETTLED:
    'Lightning channel state is still being verified. Check Recovery and wait for the channels to settle before moving the wallet.',
  CHANNEL_STATE_UNREADABLE: 'The wallet could not read the live Lightning channel state to verify this move.',
  CHANNEL_PROVISIONAL: 'A Lightning channel has a temporary identifier. Keep the wallet open while the channel opens.',
  CHANNEL_MONITOR_UNAVAILABLE: 'The wallet could not find the on-chain monitor for a closed Lightning channel.',
  CHANNEL_CLOSE_UNCONFIRMED: 'The closing transaction for a Lightning channel is awaiting confirmation.',
  CHANNEL_CLOSE_UNRESOLVED: 'A Lightning channel still has an on-chain output to resolve.',
  CHANNEL_ACTIVE_HTLCS: 'A Lightning channel still has payment contracts to settle. Check Activity before moving.',
  CHANNEL_PENDING_UPDATES: 'A Lightning channel has local updates awaiting acknowledgment from its peer.',
  CHANNEL_NEEDS_COMMITMENT: 'A Lightning channel has updates waiting for a new commitment signature.',
  CHANNEL_FEE_COMMITMENT: 'A Lightning channel is waiting for its peer to sign a fee update.',
  CHANNEL_CLOSE_SIGNATURE: 'A Lightning channel is waiting for its peer to sign the closing transaction.',
  CHANNEL_DATA_LOSS: 'The wallet detected missing Lightning channel history. Check Recovery before moving.',
  CHANNEL_STATE_UNCERTAIN: 'The wallet could not verify its recovered Lightning channel state. Check Recovery.',
  CHANNEL_COMMITMENT_REVOKED:
    'The Lightning peer has proof that this wallet’s channel commitment was revoked. Check Recovery.',
  CHANNEL_RESTORE_RECENCY:
    'The wallet could not verify that its restored Lightning channel is up to date. Check Recovery.',
  CHANNEL_REESTABLISH_RECENCY:
    'The Lightning peer reported newer channel state that the wallet could not verify. Check Recovery.',
  CHANNEL_REESTABLISH_SECRET: 'The wallet is missing a secret needed to reconnect a Lightning channel. Check Recovery.',
  CHANNEL_RECONNECTING: 'A Lightning channel is waiting to reconnect to its peer.',
  CHANNEL_SPLICING: 'A Lightning channel is changing its funding transaction.',
  OPERATIONS_UNSETTLED: 'Review pending wallet activity before moving this wallet.',
  SNAPSHOT: 'The saved wallet transfer could not be verified. Lock and reopen the wallet to check its status.',
};

export function handoffErrorMessage(error) {
  if (
    ['WALLET_HANDOFF_INVALID', 'WALLET_HANDOFF_PENDING'].includes(error?.code) &&
    typeof error.reason === 'string' &&
    Object.hasOwn(transferMessages, error.reason)
  )
    return transferMessages[error.reason];
  if (error?.code === 'WALLET_HANDOFF_PENDING') return transferMessages.OPERATIONS_UNSETTLED;
  if (error?.code === 'WALLET_HANDOFF_INVALID') return transferMessages.SNAPSHOT;
  if (error?.code === 'WALLET_CLOSE_UNCERTAIN')
    return 'The wallet could not verify a clean shutdown. Reopen it and check Activity before trying again.';
  if (error?.code === 'WALLET_CONFIGURATION')
    return 'Reconnect to the wallet’s original Bitcoin network and primary node, then try the move again.';
  if (error?.code === 'WALLET_BUSY') return 'Wait for the current wallet operation to finish and try the move again.';
  if (error?.code === 'WALLET_CLOSED') return 'The wallet locked during the move. Unlock it to continue.';
  if (error?.code === 'WALLET_STORAGE' || error?.name === 'QuotaExceededError')
    return 'The browser could not read or save the wallet data. Keep the site data and check available storage.';
  return 'This browser could not verify the wallet data for this move.';
}

const invalid = (reason = 'SNAPSHOT') =>
  Object.assign(new Error(transferMessages[reason]), { code: 'WALLET_HANDOFF_INVALID', reason });
export const pendingHandoff = (reason) =>
  Object.assign(new Error(transferMessages[reason]), { code: 'WALLET_HANDOFF_PENDING', reason });

function json(bytes, reason) {
  if (!bytes || bytes.length > 1024 * 1024) throw invalid(reason);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw invalid(reason);
  }
}

function held(channel) {
  return (
    channel.awaitingDurability ||
    channel.fundingUnidentified ||
    channel.restoreRecencyUnproven ||
    channel.reestablishRecencyUnproven ||
    channel.reestablishSecretMissing ||
    channel.restoreRevokedRisk
  );
}

// Query the running node while the caller fences new worker operations. A stopped
// runtime cannot answer these daemon routes; a stopped registry alone is insufficient.
export async function assertHandoffReady(engine, id) {
  const get = (path) => engine.request({ method: 'GET', path });
  const api = '/wallets/' + id + '/api';
  // A node held for seed recovery can reject its other daemon routes.
  // Read recovery first so the refusal retains its actual cause.
  const recovery = await get(api + '/recovery/status');
  if (recovery?.importPending === true || recovery?.restore?.inProgress) throw pendingHandoff('RECOVERY_PENDING');
  const node = recovery?.node;
  if (
    recovery?.mode !== 'peer-storage' ||
    recovery.state !== 'running' ||
    recovery.importPending !== false ||
    !['idle', 'applied'].includes(recovery.autoApply?.phase) ||
    !node ||
    !['disabled', 'confirmed'].includes(node.gate) ||
    node.fenced !== false ||
    node.startupRepairPending ||
    node.backfillLost ||
    node.awaitingDurabilityCount !== 0 ||
    node.heldReestablish?.length !== 0 ||
    !Array.isArray(node.channels) ||
    node.channels.some((ch) => ch.status !== 'active' || held(ch))
  )
    throw pendingHandoff('CHANNELS_UNSETTLED');
  const [channels, payments, submissions, sends, offline] = await Promise.all([
    get(api + '/channels'),
    get(api + '/payments'),
    get('/api/wallets/' + id + '/activity'),
    get(api + '/channel-send/list'),
    get(api + '/receive/offline'),
  ]);
  if (
    !Array.isArray(channels) ||
    channels.some((ch) => {
      if (ch.state === 'CLOSED' && ch.closeStatus?.resolution === 'resolved') return false;
      return (
        ch.state !== 'NORMAL' ||
        ch.htlcCount !== 0 ||
        held(ch) ||
        ch.pendingSpliceTxid ||
        ch.payThroughSplice !== undefined ||
        ch.fundingUnaccounted ||
        ch.ffor?.unresolvedSlots > 0
      );
    })
  )
    throw pendingHandoff('CHANNELS_UNSETTLED');
  if (
    !Array.isArray(payments) ||
    payments.some(
      (p) => !['COMPLETED', 'FAILED'].includes(p.status) && !(p.direction === 'INCOMING' && p.status === 'PENDING'),
    ) ||
    !Array.isArray(submissions) ||
    submissions.some((s) => !['completed', 'failed'].includes(s.status)) ||
    !Array.isArray(sends) ||
    sends.some((s) => !['LOCKED', 'ABORTED', 'CONFLICTED'].includes(s.stage)) ||
    offline?.reservedChannelIds?.length !== 0 ||
    !Array.isArray(offline.requests) ||
    offline.requests.some((job) => !job.done || job.unresolvedSlots > 0)
  )
    throw pendingHandoff('OPERATIONS_UNSETTLED');
}

export async function authorizeHandoff(account, { key, network, transferId, sourceDeviceId }, deployment) {
  if (network !== deployment?.network) throw invalid('PROFILE');
  if (!uuid.test(transferId) || !uuid.test(sourceDeviceId)) throw invalid();
  const entropy = deriveRingEntropy(key, account, network);
  const info = text.encode([account, network, transferId, sourceDeviceId].join('\0'));
  try {
    const material = await crypto.subtle.importKey('raw', key, 'HKDF', false, ['deriveKey']);
    const cipher = await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    return {
      cipher,
      info,
      mnemonic: entropyToMnemonic(entropy, wordlist),
      commitment: bytesToHex(sha256(entropy)),
      network,
      sourceDeviceId,
      transferId,
      deployment,
    };
  } finally {
    entropy.fill(0);
    key.fill(0);
  }
}

function verifyBinding(record, auth, deviceId) {
  if (record?.network !== auth.network || record.commitment !== auth.commitment || record.deviceId !== deviceId)
    throw invalid('RING_BINDING');
}

function verifyRegistry(registry, auth) {
  const record = registry?.record;
  if (
    !record ||
    !/^[0-9a-f]{32}$/.test(record.id) ||
    record.network !== auth.network ||
    registry.mnemonic !== auth.mnemonic
  )
    throw invalid('REGISTRY');
  return record.id;
}

export function verifyHandoffSource(volume, auth) {
  verifyBinding(bindingRecord(volume), auth, auth.sourceDeviceId);
  const bytes = volume.read(registryPath);
  try {
    return verifyRegistry(json(bytes, 'REGISTRY'), auth);
  } finally {
    bytes?.fill(0);
  }
}

function readSnapshot(plain, auth) {
  let files;
  try {
    files = unpackFiles(plain, limits);
  } catch {
    throw invalid();
  }
  for (const path of files.keys()) {
    if (
      !path.startsWith('/') ||
      /[\\\u0000-\u001f]/.test(path) ||
      path
        .slice(1)
        .split('/')
        .some((part) => !part || part === '.' || part === '..')
    )
      throw invalid();
  }
  const stored = {
    read: (path) => files.get(path),
    list: (prefix) => [...files.keys()].filter((path) => path.startsWith(prefix)),
  };
  const binding = bindingRecord(stored);
  verifyBinding(binding, auth, auth.sourceDeviceId);
  const registry = json(files.get(registryPath), 'REGISTRY');
  const id = verifyRegistry(registry, auth);
  const profile = json(files.get(profilePath), 'PROFILE');
  if (
    profile?.network !== auth.network ||
    profile.primaryUri !== auth.deployment.primaryUri ||
    profile.electrum?.host !== auth.deployment.electrum.host ||
    profile.electrum?.port !== auth.deployment.electrum.port ||
    profile.electrum?.tls !== auth.deployment.electrum.tls
  )
    throw invalid('PROFILE');
  if (
    (registry.recoveryImport?.autoApply && registry.recoveryImport.complete !== true) ||
    (binding.mode === 'restore' && registry.recoveryImport?.complete !== true) ||
    files.has('/wallet/' + auth.network + '.capsule-restore.json')
  )
    throw invalid('RECOVERY_PENDING');
  const db = files.get('/wallet/' + auth.network + '.db');
  if (!db || db.length < 100 || !text.encode('SQLite format 3\0').every((byte, index) => db[index] === byte))
    throw invalid();
  return { files, binding, id, db };
}

function parameters(auth, nonce) {
  return { name: 'AES-GCM', iv: nonce, additionalData: auth.info, tagLength: tagBytes * 8 };
}

export async function sealHandoff(volume, auth, closedDatabaseDigest) {
  const record = bindingRecord(volume);
  verifyBinding(record, auth, auth.sourceDeviceId);
  const seen = new Set(record.retiredTransfers ?? []);
  if (seen.has(auth.transferId) || record.transferId === auth.transferId) throw invalid();
  if (record.transferId) seen.add(record.transferId);
  seen.add(auth.transferId);
  if (seen.size > 16384) throw invalid();
  const plain = volume.pack();
  try {
    const { db } = readSnapshot(plain, auth);
    // Compare every committed database byte with SQLite's last live export.
    if (closedDatabaseDigest?.length !== 32 || !sha256(db).every((byte, i) => byte === closedDatabaseDigest[i]))
      throw invalid();
    const nonce = crypto.getRandomValues(new Uint8Array(nonceBytes));
    const sealed = await crypto.subtle.encrypt(parameters(auth, nonce), auth.cipher, plain);
    const envelope = new Uint8Array(nonceBytes + sealed.byteLength);
    envelope.set(nonce);
    envelope.set(new Uint8Array(sealed), nonceBytes);
    // Persist local history before this envelope can be published. Keep the
    // current owner receipt so an unpublished/cancelled offer can still open.
    volume.write(bindingPath, text.encode(JSON.stringify({ ...record, retiredTransfers: [...seen] })));
    return envelope;
  } finally {
    plain.fill(0);
  }
}

export async function installHandoff(volume, auth, targetDeviceId, envelope, assertOpen) {
  if (
    !uuid.test(targetDeviceId) ||
    targetDeviceId === auth.sourceDeviceId ||
    json(volume.read(devicePath)) !== targetDeviceId ||
    !(envelope instanceof Uint8Array) ||
    envelope.length <= nonceBytes + tagBytes ||
    envelope.length > maxEnvelopeBytes
  )
    throw invalid();
  const previous = bindingRecord(volume);
  let localId;
  if (previous) {
    verifyBinding(previous, auth, targetDeviceId);
    const bytes = volume.read(registryPath);
    try {
      if (bytes) localId = verifyRegistry(json(bytes, 'REGISTRY'), auth);
    } finally {
      bytes?.fill(0);
    }
  } else if (volume.list().some((path) => path !== profilePath && path !== devicePath)) {
    throw invalid();
  }
  let plain;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        parameters(auth, envelope.subarray(0, nonceBytes)),
        auth.cipher,
        envelope.subarray(nonceBytes),
      ),
    );
  } catch {
    // Failed authentication can also mean the envelope changed in transit.
    throw invalid();
  }
  let installed = false;
  try {
    const { files, binding, id } = readSnapshot(plain, auth);
    const result = { id, network: auth.network, deviceId: targetDeviceId };
    assertOpen();
    const retiredTransfers = previous?.retiredTransfers ?? [];
    if (retiredTransfers.includes(auth.transferId)) throw invalid();
    if (previous?.transferId === auth.transferId) {
      // A lost claim response can lead here again after live activity resumed.
      if (localId !== id) throw invalid();
      return result;
    }
    if (retiredTransfers.length >= 16384) throw invalid();
    const installedBinding = {
      version: 1,
      mode: binding.mode,
      network: binding.network,
      commitment: binding.commitment,
      deviceId: targetDeviceId,
      transferId: auth.transferId,
      retiredTransfers: previous?.transferId
        ? [...new Set([...retiredTransfers, previous.transferId])]
        : retiredTransfers,
    };
    files.set(devicePath, text.encode(JSON.stringify(targetDeviceId)));
    files.set(bindingPath, text.encode(JSON.stringify(installedBinding)));
    // The volume takes ownership of the validated plaintext views and wipes them on close.
    volume.replaceFiles(files);
    installed = true;
    return result;
  } finally {
    if (!installed) plain.fill(0);
  }
}
