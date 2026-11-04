/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts.
 *
 * Browser-safe adaptation: Ed25519 sign/verify uses Web Crypto instead of
 * `node:crypto`. PKCS8/SPKI prefixes match the original package so signatures
 * verify against the same asker pubky.
 *
 * Allowed adaptation: `signEd25519` zeroizes the PKCS8 DER buffer, the
 * `asCryptoBytes` PKCS8 copy, and the seed copy in `finally`. Semantics of
 * the signature are unchanged.
 */

import { asCryptoBytes, bytesToHex, hexToBytes } from './canonical';
import { pubkyPublicBytes } from './pubky';

const SPKI_PREFIX = Uint8Array.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export async function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      asCryptoBytes(concatBytes(SPKI_PREFIX, publicKey)),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, asCryptoBytes(signature), asCryptoBytes(message));
  } catch {
    return false;
  }
}

export async function verifyPubkySignature(
  asker: string,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  try {
    return await verifyEd25519(pubkyPublicBytes(asker), message, signature);
  } catch {
    return false;
  }
}

export { bytesToHex, hexToBytes };
