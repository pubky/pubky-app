import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { DatabaseErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import { rememberPendingDelegationDeletes } from './pending-delegation-deletes';
import { bytesToHex } from './schemas/canonical';

const SPKI_PREFIX_LENGTH = 12;
const Z32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';
export const DEVICE_DELEGATION_MAX_SECONDS = 7 * 24 * 60 * 60;
export const DEVICE_DELEGATION_REFRESH_SECONDS = 2 * 24 * 60 * 60;
const LEGACY_CURRENT_DEVICE_SIGNER_KEY = 'pubchi.deviceSigner';
const DEVICE_MINT_LOCK = 'pubchi-device-mint';
const deviceMintLocks = new Map<string, Promise<StoredDeviceKey>>();

export type StoredDeviceKey = {
  id: string;
  owner: string;
  signer: string;
  key: CryptoKey;
  created_at: number;
  expires_at: number;
};

async function signerForKey(key: CryptoKey): Promise<string> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', key));
  return z32Encode(spki.slice(SPKI_PREFIX_LENGTH));
}

function z32Encode(bytes: Uint8Array): string {
  let buffer = 0;
  let bits = 0;
  let output = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += Z32_ALPHABET[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) output += Z32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

export async function generateDeviceKey(): Promise<{ key: CryptoKey; signer: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  return { key: pair.privateKey, signer: await signerForKey(pair.publicKey) };
}

export async function getDeviceKeys(owner: string): Promise<StoredDeviceKey[]> {
  return await getPubchiDatabase().deviceKeys.where('owner').equals(owner).toArray();
}

export async function getCurrentDeviceKey(
  owner: string,
  now = Math.floor(Date.now() / 1000),
  assertCurrent?: () => void,
) {
  assertCurrent?.();
  const keys = await getDeviceKeys(owner);
  assertCurrent?.();
  if (typeof localStorage === 'undefined') return undefined;
  const ownerKey = `pubchi.deviceSigner:${owner}`;
  let signer = localStorage.getItem(ownerKey);
  const legacySigner = localStorage.getItem(LEGACY_CURRENT_DEVICE_SIGNER_KEY);
  if (!signer && legacySigner && keys.some((key) => key.signer === legacySigner)) {
    try {
      localStorage.setItem(ownerKey, legacySigner);
      localStorage.removeItem(LEGACY_CURRENT_DEVICE_SIGNER_KEY);
    } catch (error) {
      Logger.warn('Pubchi device signer migration persist failed', { owner, error });
    }
    signer = legacySigner;
  }
  return keys.find((key) => key.expires_at > now && key.signer === signer);
}

export async function loadOrGenerateDeviceKey(
  owner: string,
  now = Math.floor(Date.now() / 1000),
  assertCurrent?: () => void,
): Promise<StoredDeviceKey> {
  assertCurrent?.();
  const inFlight = deviceMintLocks.get(owner);
  if (inFlight) {
    const device = await inFlight;
    assertCurrent?.();
    return device;
  }
  const mint = mintDeviceKey(owner, now, assertCurrent);
  deviceMintLocks.set(owner, mint);
  try {
    const device = await mint;
    assertCurrent?.();
    return device;
  } finally {
    if (deviceMintLocks.get(owner) === mint) deviceMintLocks.delete(owner);
  }
}

async function mintDeviceKey(owner: string, now: number, assertCurrent?: () => void): Promise<StoredDeviceKey> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks) {
    return locks.request(DEVICE_MINT_LOCK, () => mintDeviceKeyWithoutLock(owner, now, assertCurrent));
  }
  return mintDeviceKeyWithoutLock(owner, now, assertCurrent);
}

async function mintDeviceKeyWithoutLock(
  owner: string,
  now: number,
  assertCurrent?: () => void,
): Promise<StoredDeviceKey> {
  const current = await getCurrentDeviceKey(owner, now, assertCurrent);
  assertCurrent?.();
  if (current && current.expires_at - now > DEVICE_DELEGATION_REFRESH_SECONDS) return current;
  if (current) {
    if (!rememberPendingDelegationDeletes([{ owner, signer: current.signer }])) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Could not persist expiring Pubchi device deletion', {
        service: ErrorService.Pubchi,
        operation: 'loadOrGenerateDeviceKey',
      });
    }
    await getPubchiDatabase().deviceKeys.delete(current.id);
    assertCurrent?.();
  }

  const live = (await getDeviceKeys(owner)).filter((key) => key.expires_at > now);
  assertCurrent?.();
  if (live.length >= 3) {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DEVICE_LIMIT', {
      service: ErrorService.Pubchi,
      operation: 'loadOrGenerateDeviceKey',
    });
  }

  const generated = await generateDeviceKey();
  assertCurrent?.();
  const record: StoredDeviceKey = {
    id: `${owner}:${generated.signer}`,
    owner,
    signer: generated.signer,
    key: generated.key,
    created_at: now,
    expires_at: now + DEVICE_DELEGATION_MAX_SECONDS,
  };
  const db = getPubchiDatabase();
  // A queued IDB transaction may start after logout has already cleared this owner.
  // Recheck inside it, and roll the write back if the session changed during put.
  await db.transaction('rw', db.deviceKeys, async () => {
    assertCurrent?.();
    await db.deviceKeys.put(record);
    assertCurrent?.();
  });
  assertCurrent?.();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`pubchi.deviceSigner:${owner}`, record.signer);
    localStorage.removeItem(LEGACY_CURRENT_DEVICE_SIGNER_KEY);
  }
  return record;
}

export async function signWithDeviceKey(key: CryptoKey, message: Uint8Array): Promise<string> {
  if (key.type !== 'private' || key.algorithm.name !== 'Ed25519') {
    throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'PUBCHI_DEVICE_KEY_REQUIRED', {
      service: ErrorService.Pubchi,
      operation: 'signWithDeviceKey',
    });
  }
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, key, new Uint8Array(message));
  return bytesToHex(new Uint8Array(signature));
}

export async function deleteDeviceKey(owner: string, signer: string): Promise<void> {
  await getPubchiDatabase().deviceKeys.delete(`${owner}:${signer}`);
}

export async function updateDeviceKeyExpiry(owner: string, signer: string, expiresAt: number): Promise<void> {
  await getPubchiDatabase().deviceKeys.update(`${owner}:${signer}`, { expires_at: expiresAt });
}

/**
 * Drop local device keys that do not belong to the signed-in owner.
 * Does not touch homeserver objects: a previous identity's published
 * delegation can only be DELETEd with that identity's live session.
 */
export async function listDeviceKeysNotOwnedBy(owner: string): Promise<StoredDeviceKey[]> {
  return (await getPubchiDatabase().deviceKeys.toArray()).filter((row) => row.owner !== owner);
}

export async function wipeDeviceKeysNotOwnedBy(owner: string): Promise<number> {
  const foreign = await listDeviceKeysNotOwnedBy(owner);
  await Promise.all(foreign.map((row) => getPubchiDatabase().deviceKeys.delete(row.id)));
  return foreign.length;
}
