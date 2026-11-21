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

const invalid = () =>
  Object.assign(new Error('The wallet transfer could not be verified.'), { code: 'WALLET_HANDOFF_INVALID' });
const unsettled = () =>
  Object.assign(new Error('Wait for wallet activity and recovery to settle before moving the wallet.'), {
    code: 'WALLET_HANDOFF_PENDING',
  });

function json(bytes) {
  if (!bytes || bytes.length > 1024 * 1024) throw invalid();
  return JSON.parse(decoder.decode(bytes));
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
  const [recovery, channels, payments, submissions, sends, offline] = await Promise.all([
    get(api + '/recovery/status'),
    get(api + '/channels'),
    get(api + '/payments'),
    get('/api/wallets/' + id + '/activity'),
    get(api + '/channel-send/list'),
    get(api + '/receive/offline'),
  ]);
  const node = recovery?.node;
  if (
    recovery?.mode !== 'peer-storage' ||
    recovery.state !== 'running' ||
    recovery.importPending !== false ||
    !['idle', 'applied'].includes(recovery.autoApply?.phase) ||
    recovery.restore?.inProgress ||
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
    throw unsettled();
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
    throw unsettled();
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
    throw unsettled();
}

export async function authorizeHandoff(account, { key, network, transferId, sourceDeviceId }, deployment) {
  if (!uuid.test(transferId) || !uuid.test(sourceDeviceId) || network !== deployment?.network) throw invalid();
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
    throw invalid();
}

function verifyRegistry(registry, auth) {
  const record = registry.record;
  if (
    !record ||
    !/^[0-9a-f]{32}$/.test(record.id) ||
    record.network !== auth.network ||
    registry.mnemonic !== auth.mnemonic
  )
    throw invalid();
  return record.id;
}

export function verifyHandoffSource(volume, auth) {
  verifyBinding(bindingRecord(volume), auth, auth.sourceDeviceId);
  const bytes = volume.read(registryPath);
  try {
    return verifyRegistry(json(bytes), auth);
  } finally {
    bytes?.fill(0);
  }
}

function readSnapshot(plain, auth) {
  const files = unpackFiles(plain, limits);
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
  const registry = json(files.get(registryPath));
  const id = verifyRegistry(registry, auth);
  const profile = json(files.get(profilePath));
  if (
    profile.network !== auth.network ||
    profile.primaryUri !== auth.deployment.primaryUri ||
    profile.electrum?.host !== auth.deployment.electrum.host ||
    profile.electrum?.port !== auth.deployment.electrum.port ||
    profile.electrum?.tls !== auth.deployment.electrum.tls ||
    (registry.recoveryImport?.autoApply && registry.recoveryImport.complete !== true) ||
    (binding.mode === 'restore' && registry.recoveryImport?.complete !== true) ||
    files.has('/wallet/' + auth.network + '.capsule-restore.json')
  )
    throw invalid();
  const db = files.get('/wallet/' + auth.network + '.db');
  if (!db || db.length < 100 || decoder.decode(db.subarray(0, 16)) !== 'SQLite format 3\0') throw invalid();
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
      if (bytes) localId = verifyRegistry(json(bytes), auth);
    } finally {
      bytes?.fill(0);
    }
  } else if (volume.list().some((path) => path !== profilePath && path !== devicePath)) {
    throw invalid();
  }
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      parameters(auth, envelope.subarray(0, nonceBytes)),
      auth.cipher,
      envelope.subarray(nonceBytes),
    ),
  );
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
