import { gcm } from '@noble/ciphers/aes';
import { sha256 } from '@noble/hashes/sha256';

// Each acknowledgement follows two synchronous flushes. Write the inactive
// slot, flush its ciphertext, then append its authenticated digest to the log.
// Preserve any damaged committed state for recovery instead of rolling back.
const DIGEST_BYTES = 32;
const SALT_BYTES = 32;
const NONCE_BYTES = 12;
const MAX_BYTES = 256 * 1024 * 1024;
const utf8 = new TextEncoder();
const text = new TextDecoder('utf-8', { fatal: true });
const failure = (message, code = 'WALLET_STORAGE') => Object.assign(new Error(message), { code });

function read(file, size, at = 0) {
  if (size > MAX_BYTES) throw failure('This wallet exceeds the browser storage limit.');
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size;) {
    const n = file.read(bytes.subarray(i), { at: at + i });
    if (n <= 0) throw failure('Wallet storage could not be read.');
    i += n;
  }
  return bytes;
}

function flushAtLength(file, size) {
  // Some earlier sync access handles exposed asynchronous truncate and flush.
  // Only acknowledge a write on an implementation with synchronous durability.
  if (file.truncate(size)?.then || file.flush()?.then) {
    throw failure('This browser cannot flush wallet storage synchronously.');
  }
}

function write(file, bytes, at) {
  for (let i = 0; i < bytes.length;) {
    const n = file.write(bytes.subarray(i), { at: at + i });
    if (n <= 0) throw failure('Wallet storage is full.');
    i += n;
  }
  flushAtLength(file, at + bytes.length);
}

export async function openFiles(account) {
  if (typeof account !== 'string' || !/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/.test(account)) {
    throw failure('Sign in to a Pubky account first.');
  }
  if (!globalThis.isSecureContext || !navigator.storage?.getDirectory) {
    throw failure('This wallet needs a secure browser with local file storage.');
  }
  const files = [];
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('pubky-wallet-v1-' + account, { create: true });
    // The journal handle is the lifetime cross-tab lease, even during unlock.
    for (const name of ['journal', 'first', 'second', 'active']) {
      const file = await directory.getFileHandle(name, { create: true });
      if (!file.createSyncAccessHandle) throw failure('This browser lacks synchronous private file storage.');
      files.push(await file.createSyncAccessHandle());
    }
    const [journal, first, second, active] = files;
    const slots = [first, second];
    const size = journal.getSize();
    if (!Number.isSafeInteger(size)) throw failure('This browser cannot read wallet storage synchronously.');
    let pos = size - (size % DIGEST_BYTES);
    const slotAt = (end) => slots[(end / DIGEST_BYTES) % 2];
    let sealed = null;
    if (pos) {
      const slot = slotAt(pos);
      sealed = read(slot, slot.getSize());
      const digest = read(journal, DIGEST_BYTES, pos - DIGEST_BYTES);
      if (!sha256(sealed).every((v, i) => v === digest[i]) || sealed.length < SALT_BYTES + NONCE_BYTES + 16) {
        throw failure('The committed wallet data is damaged.');
      }
    } else if (slots.some((file) => file.getSize())) {
      throw failure('Wallet initialization was interrupted. The stored data has been preserved.');
    }
    if (size !== pos) {
      flushAtLength(journal, pos);
    }
    return {
      read: () => sealed,
      interrupted: () => active.getSize() !== 0,
      markActive: () => write(active, Uint8Array.of(1), 0),
      markClosed: () => flushAtLength(active, 0),
      commit(bytes) {
        if (bytes.length > MAX_BYTES) throw failure('This wallet exceeds the browser storage limit.');
        const end = pos + DIGEST_BYTES;
        write(slotAt(end), bytes, 0);
        write(journal, sha256(bytes), pos);
        pos = end;
        sealed = bytes;
      },
      close() {
        for (const file of files.reverse()) file.close();
      },
    };
  } catch (error) {
    for (const file of files.reverse()) file.close();
    if (error?.name === 'NoModificationAllowedError')
      throw failure('This wallet is open in another tab.', 'WALLET_IN_USE');
    throw error;
  }
}

// Pack the engine filesystem as binary, so SQLite images never become strings.
function pack(files) {
  const entries = [...files].map(([name, bytes]) => [utf8.encode(name), bytes]);
  const size = entries.reduce((n, [name, bytes]) => n + 8 + name.length + bytes.length, 0);
  if (size > MAX_BYTES - 60) throw failure('This wallet exceeds the browser storage limit.');
  const blob = new Uint8Array(size);
  const view = new DataView(blob.buffer);
  let offset = 0;
  for (const [name, bytes] of entries) {
    view.setUint32(offset, name.length);
    view.setUint32(offset + 4, bytes.length);
    blob.set(name, offset + 8);
    blob.set(bytes, offset + 8 + name.length);
    offset += 8 + name.length + bytes.length;
  }
  return blob;
}

function unpack(blob) {
  const files = new Map();
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  for (let offset = 0; offset < blob.length;) {
    const nameBytes = view.getUint32(offset);
    const size = view.getUint32(offset + 4);
    const start = offset + 8 + nameBytes;
    if (!nameBytes || start + size > blob.length) throw failure('Invalid wallet filesystem.');
    const name = text.decode(blob.subarray(offset + 8, start));
    if (files.has(name)) throw failure('Invalid wallet filesystem.');
    files.set(name, blob.slice(start, start + size));
    offset = start + size;
  }
  return files;
}

export async function unlockVolume(store, account, password) {
  const sealed = store.read();
  if (typeof password !== 'string' || !password.length || (!sealed && password.length < 12)) {
    throw failure('Use a wallet password of at least 12 characters.', 'WALLET_PASSWORD');
  }
  const salt = sealed?.slice(0, SALT_BYTES) ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const secret = utf8.encode(password);
  const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
  secret.fill(0);
  const key = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, 256),
  );
  const context = utf8.encode('Pubky wallet v1/' + account);
  let files = new Map();
  if (sealed) {
    let plain;
    try {
      plain = gcm(key, sealed.subarray(SALT_BYTES, SALT_BYTES + NONCE_BYTES), context).decrypt(
        sealed.subarray(SALT_BYTES + NONCE_BYTES),
      );
      files = unpack(plain);
    } catch {
      key.fill(0);
      throw failure('Could not unlock this wallet. Check the password and try again.', 'WALLET_PASSWORD');
    } finally {
      plain?.fill(0);
    }
  }
  let available = true;
  const check = () => {
    if (!available) throw failure('Reopen the wallet to access its storage.');
  };
  const save = () => {
    let plain;
    try {
      plain = pack(files);
      const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
      const cipher = gcm(key, nonce, context).encrypt(plain);
      const bytes = new Uint8Array(salt.length + nonce.length + cipher.length);
      bytes.set(salt);
      bytes.set(nonce, salt.length);
      bytes.set(cipher, salt.length + nonce.length);
      store.commit(bytes);
    } catch (error) {
      // An ambiguous commit must fence all reads and writes until reopening.
      available = false;
      throw error;
    } finally {
      plain?.fill(0);
    }
  };
  return {
    read(path) {
      check();
      return files.get(path)?.slice() ?? null;
    },
    write(path, bytes) {
      check();
      files.set(path, new Uint8Array(bytes));
      save();
    },
    remove(path) {
      check();
      if (files.delete(path)) save();
    },
    rename(from, to) {
      check();
      if (!files.has(from)) throw failure('Wallet source file is missing.');
      if (from === to) return;
      files.set(to, files.get(from));
      files.delete(from);
      save();
    },
    list(prefix = '') {
      check();
      return [...files.keys()].filter((path) => path.startsWith(prefix));
    },
    close() {
      available = false;
      key.fill(0);
      for (const bytes of files.values()) bytes.fill(0);
      files.clear();
      store.close();
    },
  };
}
