import { IndexerError } from './indexer.errors';
import type { IndexSealer } from './runtime.types';

const NONCE_BYTES = 12;

/**
 * Seals each index file with AES-256-GCM under a key of its own, derived from `key` and the file's path with
 * HKDF-SHA-256, so a file opens only at the path it was written to: a homeserver cannot swap two files. A sealed file
 * is a random 96-bit nonce and the ciphertext with its tag. `key` is the user's secret for the index folder, such as
 * the content key the SDK derives for it; every device of the user needs the same one.
 */
export function createIndexSealer(key: Uint8Array): IndexSealer {
  const base = crypto.subtle.importKey('raw', new Uint8Array(key), 'HKDF', false, ['deriveKey']);
  const keys = new Map<string, Promise<CryptoKey>>();
  const keyOf = (path: string) => {
    let derived = keys.get(path);
    if (derived === undefined) {
      derived = base.then((material) =>
        crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(`index:${path}`) },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      );
      keys.set(path, derived);
    }
    return derived;
  };
  return {
    async seal(bytes, path) {
      const iv = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
      const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(path), new Uint8Array(bytes));
      const out = new Uint8Array(NONCE_BYTES + sealed.byteLength);
      out.set(iv);
      out.set(new Uint8Array(sealed), NONCE_BYTES);
      return out;
    },
    async open(bytes, path) {
      if (bytes.length < NONCE_BYTES) throw new IndexerError(`sealed index file ${path} is truncated`);
      try {
        const opened = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: bytes.slice(0, NONCE_BYTES) },
          await keyOf(path),
          bytes.slice(NONCE_BYTES),
        );
        return new Uint8Array(opened);
      } catch (error) {
        throw new IndexerError(`index file ${path} does not open under this key`, { cause: error });
      }
    },
  };
}
