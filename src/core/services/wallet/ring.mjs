import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const text = new TextEncoder();
const decoder = new TextDecoder();
export const devicePath = '/pubky/ring-device-v1.json';
export const bindingPath = '/pubky/ring-binding-v1.json';
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const identity = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{51}[yo]$/;
const networks = new Set(['mainnet', 'testnet', 'regtest']);
const modes = new Set(['create', 'restore']);
const salt = text.encode('pubky.app/bitcoin-wallet/ring-seed/v1');
const failure = (message, code) => Object.assign(new Error(message), { code });

function read(volume, path) {
  const raw = volume.read(path);
  return raw ? JSON.parse(decoder.decode(raw)) : undefined;
}

export function ringDeviceId(volume) {
  let id = read(volume, devicePath);
  if (id === undefined) {
    if (volume.list(bindingPath).includes(bindingPath))
      throw failure('The wallet device record is missing.', 'WALLET_STORAGE');
    id = crypto.randomUUID();
    volume.write(devicePath, text.encode(JSON.stringify(id)));
  }
  if (!uuid.test(id)) throw failure('The wallet device record is damaged.', 'WALLET_STORAGE');
  return id;
}

export function bindingRecord(volume) {
  const record = read(volume, bindingPath);
  if (record === undefined) return null;
  if (
    !record ||
    record.version !== 1 ||
    !networks.has(record.network) ||
    !modes.has(record.mode) ||
    (record.transferId !== undefined && !uuid.test(record.transferId)) ||
    (record.retiredTransfers !== undefined &&
      (!Array.isArray(record.retiredTransfers) ||
        record.retiredTransfers.length > 16384 ||
        record.retiredTransfers.some((id) => !uuid.test(id)))) ||
    !/^[0-9a-f]{64}$/.test(record.commitment) ||
    ringDeviceId(volume) !== record.deviceId
  ) {
    throw failure('The Ring wallet binding is damaged.', 'WALLET_STORAGE');
  }
  return record;
}

export function ringBinding(volume) {
  const record = bindingRecord(volume);
  return record && {
    deviceId: record.deviceId,
    network: record.network,
    ...(record.mode === 'restore' && { mode: record.mode }),
    ...(record.transferId && { transferId: record.transferId }),
  };
}

/** V1 uses HKDF-SHA256, this fixed UTF-8 salt and a NUL-separated network and bare Pubky. */
export function deriveRingEntropy(key, account, network) {
  if (!(key instanceof Uint8Array) || key.length !== 32 || !identity.test(account) || !networks.has(network)) {
    throw failure('Invalid Ring wallet key, identity or network.', 'WALLET_RING_KEY');
  }
  return hkdf(sha256, key, salt, text.encode(network + '\0' + account), 32);
}

export async function provisionRingWallet({ volume, engine, account, deployment, key, network, mode, verify }) {
  if (!deployment || deployment.network !== network || !modes.has(mode)) {
    throw failure('Unlock the wallet on the selected network before continuing.', 'WALLET_CONFIGURATION');
  }
  if (volume.list('/wallet/registry.json').includes('/wallet/registry.json')) {
    throw failure('This device vault already contains a wallet.', 'WALLET_EXISTS');
  }
  const entropy = deriveRingEntropy(key, account, network);
  key.fill(0);
  try {
    const digest = sha256(entropy);
    const commitment = bytesToHex(digest);
    digest.fill(0);
    let record = bindingRecord(volume);
    if (record && (record.commitment !== commitment || record.network !== network)) {
      throw failure('This vault is reserved for another Ring wallet.', 'WALLET_RING_BINDING');
    }
    await verify();
    if (!record) {
      record = { version: 1, network, mode, deviceId: ringDeviceId(volume), commitment };
      // Commit the intended mode before the engine makes the first durable registry write.
      volume.write(bindingPath, text.encode(JSON.stringify(record)));
    }
    const created = await engine.request({
      method: 'POST',
      path: '/api/wallets',
      body: {
        name: 'Pubky wallet',
        network,
        mnemonic: entropyToMnemonic(entropy, wordlist),
        recoveryMode: 'peer-storage',
        recoveryAutoApply: record.mode === 'restore',
        electrum: deployment.electrum,
        lfbw: { enabled: true, primaryUri: deployment.primaryUri, trusted: true, initialChannelSats: 0 },
      },
    });
    if (!/^[a-f0-9]{32}$/.test(created?.record?.id) || created.record.network !== network) {
      throw failure('The new wallet could not be verified. Reopen it before continuing.', 'WALLET_STORAGE');
    }
    return { id: created.record.id, network };
  } finally {
    entropy.fill(0);
  }
}
