import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const text = new TextEncoder();
const decoder = new TextDecoder();
const device = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const networks = ['mainnet', 'testnet', 'regtest'];
const invalid = () =>
  Object.assign(new Error('Could not unlock this browser’s wallet with Ring.'), { code: 'WALLET_LOCAL_UNLOCK' });

function validate(scope, key) {
  if (
    !scope ||
    !networks.includes(scope.network) ||
    !device.test(scope.deviceId) ||
    !(key instanceof Uint8Array) ||
    key.length !== 32
  )
    throw invalid();
}

function context(account, { network, deviceId, passwordAvailable, salt }) {
  return text.encode(
    JSON.stringify([
      'pubky-wallet/local-unlock/v1',
      globalThis.location?.origin,
      account,
      network,
      deviceId,
      passwordAvailable,
      salt,
    ]),
  );
}

// This small file lives beside the OPFS journal, outside the transferable wallet volume.
export function parseLocalUnlock(bytes) {
  try {
    if (!bytes || bytes.length > 1024) throw invalid();
    const r = JSON.parse(decoder.decode(bytes));
    if (
      r.version !== 1 ||
      !networks.includes(r.network) ||
      !device.test(r.deviceId) ||
      typeof r.passwordAvailable !== 'boolean' ||
      !/^[0-9a-f]{64}$/.test(r.salt) ||
      !/^[0-9a-f]{24}$/.test(r.nonce) ||
      !/^[0-9a-f]{96}$/.test(r.wrapped)
    )
      throw invalid();
    return r;
  } catch {
    throw invalid();
  }
}

export function localUnlockDescriptor({ network, deviceId, passwordAvailable }) {
  return { network, deviceId, passwordAvailable };
}

export function wrapLocalUnlock(account, scope, ringKey, volumeKey, salt, passwordAvailable) {
  validate(scope, ringKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const record = {
    version: 1,
    network: scope.network,
    deviceId: scope.deviceId,
    passwordAvailable,
    salt: bytesToHex(salt),
  };
  const wrapped = gcm(ringKey, nonce, context(account, record)).encrypt(volumeKey);
  return text.encode(JSON.stringify({ ...record, nonce: bytesToHex(nonce), wrapped: bytesToHex(wrapped) }));
}

export function unwrapLocalUnlock(account, scope, ringKey, record, headSalt) {
  validate(scope, ringKey);
  if (
    scope.network !== record.network ||
    scope.deviceId !== record.deviceId ||
    (headSalt && bytesToHex(headSalt) !== record.salt) ||
    (!headSalt && record.passwordAvailable)
  )
    throw invalid();
  try {
    return {
      key: gcm(ringKey, hexToBytes(record.nonce), context(account, record)).decrypt(hexToBytes(record.wrapped)),
      salt: hexToBytes(record.salt),
    };
  } catch {
    throw invalid();
  }
}
