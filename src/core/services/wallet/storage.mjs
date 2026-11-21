import { gcm } from '@noble/ciphers/aes';
import { sha256 } from '@noble/hashes/sha256';
import { localUnlockDescriptor, parseLocalUnlock, unwrapLocalUnlock, wrapLocalUnlock } from './local-unlock.mjs';
import { checkpointDigest, createOverlay, maxPackedBytes, packFiles, unpackFiles } from './vault-overlay.mjs';

// Each acknowledgement follows two synchronous flushes. Write the inactive
// slot, flush its ciphertext, then append its authenticated digest to the log.
// Preserve any damaged committed state for recovery instead of rolling back.
const DIGEST_BYTES = 32;
const SALT_BYTES = 32;
const NONCE_BYTES = 12;
const MAX_BYTES = maxPackedBytes + SALT_BYTES + NONCE_BYTES + 16;
const CHECKPOINT_MIN_BYTES = 2 * 1024 * 1024;
const utf8 = new TextEncoder();
const failure = (message, code = 'WALLET_STORAGE') => Object.assign(new Error(message), { code });

function read(file, size, at = 0) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BYTES) throw failure('Invalid wallet storage size.');
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

async function walletDirectory(account, create) {
  if (typeof account !== 'string' || !/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/.test(account)) {
    throw failure('Sign in to a Pubky account first.');
  }
  if (!globalThis.isSecureContext || !navigator.storage?.getDirectory) {
    throw failure('This wallet needs a secure browser with local file storage.');
  }
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('pubky-wallet-v1-' + account, { create });
}

function syncHandle(file) {
  if (!file.createSyncAccessHandle) throw failure('This browser lacks synchronous private file storage.');
  return file.createSyncAccessHandle();
}

function storageError(error) {
  return error?.name === 'NoModificationAllowedError'
    ? failure('This wallet is open in another tab.', 'WALLET_IN_USE')
    : error;
}

async function optionalHandle(get) {
  try {
    return await get();
  } catch (error) {
    if (error?.name === 'NotFoundError') return null;
    throw error;
  }
}

async function readLocalUnlock(dir, allowDamaged = false) {
  const handle = await optionalHandle(() => dir.getFileHandle('ring-unlock-v1'));
  if (!handle) return null;
  const file = await handle.getFile();
  if (!file.size) return null;
  if (file.size > 1024) {
    if (allowDamaged) return null;
    throw failure('The local Ring unlock record is damaged.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { return parseLocalUnlock(bytes); }
  catch (error) { if (allowDamaged) return null; throw error; }
}

// Inspect only metadata under the journal lease. Unlock always verifies the full committed slot.
export async function inspectFiles(account) {
  const dir = await optionalHandle(() => walletDirectory(account, false));
  if (!dir) return { exists: false };
  const handle = (name) => optionalHandle(() => dir.getFileHandle(name));
  const fileSize = async (name) => {
    const file = await handle(name);
    return file ? (await file.getFile()).size : 0;
  };
  let journal;
  try {
    const file = await handle('journal');
    journal = file && await syncHandle(file);
    const size = journal ? journal.getSize() : 0;
    if (!Number.isSafeInteger(size)) throw failure('This browser cannot read wallet storage synchronously.');
    const exists = size >= DIGEST_BYTES;
    if (!exists && (await Promise.all(['first', 'second', 'checkpoint'].map(fileSize))).some(Boolean)) {
      throw failure('Wallet initialization was interrupted. The stored data has been preserved.');
    }
    const marker = await fileSize('active');
    // Older builds marked every open wallet with one byte. Two bytes identify
    // a confirmed send whose result has not been acknowledged by the client.
    // A damaged optional wrapper never prevents using an existing password.
    const unlock = await readLocalUnlock(dir, true);
    return {
      exists, ...(marker ? { interrupted: true } : {}), ...(marker > 1 ? { paymentNeedsReview: true } : {}),
      ...(unlock ? { ringUnlock: localUnlockDescriptor(unlock) } : {}),
    };
  } catch (error) {
    throw storageError(error);
  } finally {
    journal?.close();
  }
}

export async function openFiles(account) {
  const files = [];
  try {
    const directory = await walletDirectory(account, true);
    // The journal handle is the lifetime cross-tab lease, even during unlock.
    for (const name of ['journal', 'first', 'second', 'active']) {
      const file = await directory.getFileHandle(name, { create: true });
      files.push(await syncHandle(file));
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
      const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', sealed));
      if (!actual.every((v, i) => v === digest[i]) || sealed.length < SALT_BYTES + NONCE_BYTES + 16) {
        throw failure('The committed wallet data is damaged.');
      }
    } else {
      const oldCheckpoint = await optionalHandle(() => directory.getFileHandle('checkpoint'));
      if (slots.some((file) => file.getSize()) || (oldCheckpoint && (await oldCheckpoint.getFile()).size)) {
        throw failure('Wallet initialization was interrupted. The stored data has been preserved.');
      }
    }
    if (size !== pos) {
      flushAtLength(journal, pos);
    }
    return {
      read: () => sealed,
      readLocalUnlock: (allowDamaged) => readLocalUnlock(directory, allowDamaged),
      async writeLocalUnlock(bytes) {
        // Only a password-authenticated enrollment or a new empty vault reaches
        // this writer. A partial failed enrollment can be retried under the journal lease.
        if (await readLocalUnlock(directory, true)) throw failure('This wallet already has a local Ring unlock record.');
        const file = await directory.getFileHandle('ring-unlock-v1', { create: true });
        if (file.createWritable) {
          const stream = await file.createWritable();
          try {
            await stream.write(bytes);
            await stream.close();
          } catch (error) {
            await stream.abort().catch(() => {});
            throw error;
          }
        } else {
          const handle = await syncHandle(file);
          try { write(handle, bytes, 0); } finally { handle.close(); }
        }
        const saved = await file.getFile();
        if (saved.size !== bytes.length || !new Uint8Array(await saved.arrayBuffer()).every((b, i) => b === bytes[i]))
          throw failure('Ring unlock could not be saved on this device.');
      },
      async openCheckpoint(create) {
        const file = await directory.getFileHandle('checkpoint', { create });
        const handle = await syncHandle(file);
        files.push(handle);
        return {
          read: () => read(handle, handle.getSize()),
          write: (bytes) => write(handle, bytes, 0),
          clear: () => flushAtLength(handle, 0),
        };
      },
      paymentNeedsReview: () => active.getSize() !== 0,
      markPayment() {
        const previous = active.getSize();
        write(active, Uint8Array.of(1, 1), 0);
        return previous;
      },
      restorePaymentMarker(previous) {
        if (previous < 2) flushAtLength(active, previous);
      },
      clearPayment(legacyOnly) {
        if (!legacyOnly || active.getSize() === 1) flushAtLength(active, 0);
      },
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
    throw storageError(error);
  }
}

export async function unlockVolume(store, account, password) {
  const sealed = store.read();
  if (!sealed && await store.readLocalUnlock?.(true)) {
    throw failure('Use Ring to unlock this browser’s wallet.', 'WALLET_LOCAL_UNLOCK');
  }
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
  return openVolume(store, account, key, salt, true);
}

export async function unlockVolumeWithRing(store, account, scope, ringKey, create) {
  const sealed = store.read();
  const record = await store.readLocalUnlock(create && !sealed);
  if (create) {
    if (record || sealed) throw failure('This device already has a wallet. Unlock it before enabling Ring.');
    const key = crypto.getRandomValues(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    try {
      const envelope = wrapLocalUnlock(account, scope, ringKey, key, salt, false);
      await store.writeLocalUnlock(envelope);
      return await openVolume(store, account, key, salt);
    } catch (error) { key.fill(0); throw error; }
  }
  if (!record) throw failure('This wallet has not enabled Ring unlock.');
  const { key, salt } = unwrapLocalUnlock(account, scope, ringKey, record, sealed?.subarray(0, SALT_BYTES));
  return openVolume(store, account, key, salt);
}

async function openVolume(store, account, key, salt, passwordUnlocked = false) {
  const sealed = store.read();
  const context = utf8.encode('Pubky wallet v1/' + account);
  let files = new Map();
  let checkpoint;
  let overlay;
  let overlayLimit = 0;
  let pendingCheckpoint;
  let headUsesOverlay = false;
  function setBase(baseFiles, digest, size) {
    overlay?.wipe(new Set(baseFiles.values()));
    overlay = createOverlay(baseFiles, digest);
    overlayLimit = Math.max(1024 * 1024, Math.floor(size / 3));
  }
  if (sealed) {
    const decryptKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
    const decrypt = async (bytes) => new Uint8Array(await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: bytes.subarray(SALT_BYTES, SALT_BYTES + NONCE_BYTES),
      additionalData: context,
      tagLength: 128,
    }, decryptKey, bytes.subarray(SALT_BYTES + NONCE_BYTES)));
    let plain;
    try {
      plain = await decrypt(sealed);
    } catch {
      key.fill(0);
      throw failure('Could not unlock this wallet. Check the password and try again.', 'WALLET_PASSWORD');
    }
    let basePlain;
    try {
      const digest = checkpointDigest(plain);
      if (digest) {
        checkpoint = await store.openCheckpoint(false);
        const saved = checkpoint.read();
        if (!salt.every((byte, i) => byte === saved[i])) throw failure('Invalid wallet checkpoint.');
        const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', saved));
        if (!digest.every((byte, i) => byte === actual[i])) throw failure('Invalid wallet checkpoint.');
        basePlain = await decrypt(saved);
        setBase(unpackFiles(basePlain), digest, saved.length);
        files = overlay.restore(plain);
        headUsesOverlay = true;
      } else {
        files = unpackFiles(plain);
        if (sealed.length >= CHECKPOINT_MIN_BYTES && store.openCheckpoint) {
          // The authenticated full head is authoritative if this optional sidecar is unavailable.
          try {
            checkpoint = await store.openCheckpoint(true);
          } catch {
            checkpoint = undefined;
          }
          if (checkpoint) {
            const originalDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', sealed));
            setBase(new Map(files), originalDigest, sealed.length);
            pendingCheckpoint = sealed;
          }
        }
      }
    } catch {
      key.fill(0);
      overlay?.wipe();
      throw failure('The committed wallet data is damaged.');
    } finally {
      plain?.fill(0);
      basePlain?.fill(0);
    }
  }
  let available = true;
  const check = () => {
    if (!available) throw failure('Reopen the wallet to access its storage.');
  };
  function commit(plain) {
    try {
      const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
      const cipher = gcm(key, nonce, context).encrypt(plain);
      const bytes = new Uint8Array(salt.length + nonce.length + cipher.length);
      bytes.set(salt);
      bytes.set(nonce, salt.length);
      bytes.set(cipher, salt.length + nonce.length);
      store.commit(bytes);
      return bytes;
    } finally {
      plain.fill(0);
    }
  }
  function save() {
    try {
      const manifest = overlay?.pack(files, overlayLimit);
      if (manifest) {
        if (pendingCheckpoint) {
          // This can only be replaced when the last journal entry holds a full v1 wallet.
          try {
            checkpoint.write(pendingCheckpoint);
          } catch {
            // Only the optional sidecar was touched. Continue using full commits for this session.
            overlay.wipe(new Set(files.values()));
            overlay = undefined;
          }
          pendingCheckpoint = undefined;
        }
        if (overlay) {
          commit(manifest);
          headUsesOverlay = true;
          return;
        }
        manifest.fill(0);
      }
      // Rebase through a durable legacy head first. A crash here never leaves the
      // journal pointing at an overlay whose checkpoint we have overwritten.
      const full = commit(packFiles(files));
      headUsesOverlay = false;
      if (overlay && full.length >= CHECKPOINT_MIN_BYTES) {
        setBase(new Map(files), sha256(full), full.length);
        pendingCheckpoint = full;
      } else {
        overlay?.wipe(new Set(files.values()));
        overlay = undefined;
        pendingCheckpoint = undefined;
        // No future manifest can reference this checkpoint in this session.
        try {
          checkpoint?.clear();
        } catch {}
        checkpoint = undefined;
      }
    } catch (error) {
      available = false;
      throw error;
    }
  }
  return {
    async enrollLocalUnlock(scope, ringKey) {
      check();
      // Password wallets keep their original KDF and committed slots. The
      // separate wrapper grants access to this same key after Ring approval.
      if (!passwordUnlocked || !store.read()) throw failure('Unlock with your wallet password before enabling Ring.');
      const envelope = wrapLocalUnlock(account, scope, ringKey, key, salt, true);
      await store.writeLocalUnlock(envelope);
      return localUnlockDescriptor(parseLocalUnlock(envelope));
    },
    read(path) {
      check();
      return files.get(path)?.slice() ?? null;
    },
    write(path, bytes) {
      check();
      const existing = files.get(path);
      if (existing && existing.length === bytes.length) {
        let i = 0;
        while (i < existing.length && existing[i] === bytes[i]) i++;
        if (i === existing.length) return;
      }
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
    pack() {
      check();
      return packFiles(files);
    },
    // One full head replaces every file. The active slot/checkpoint stays
    // authoritative until the new slot and its journal digest have flushed.
    replaceFiles(replacement) {
      check();
      try {
        commit(packFiles(replacement));
      } catch (error) {
        available = false;
        throw error;
      }
      for (const bytes of files.values()) bytes.fill(0);
      files = replacement;
      headUsesOverlay = false;
      overlay?.wipe();
      overlay = undefined;
      pendingCheckpoint = undefined;
      try {
        checkpoint?.clear();
      } catch {}
    },
    compact() {
      check();
      if (headUsesOverlay) {
        try {
          commit(packFiles(files));
        } catch (error) {
          available = false;
          throw error;
        }
        headUsesOverlay = false;
      }
      // The latest full slot is self-contained. A leftover encrypted checkpoint is harmless.
      try {
        checkpoint?.clear();
      } catch {}
      overlay?.wipe(new Set(files.values()));
      overlay = undefined;
      pendingCheckpoint = undefined;
    },
    close() {
      available = false;
      key.fill(0);
      for (const bytes of files.values()) bytes.fill(0);
      files.clear();
      overlay?.wipe();
      overlay = undefined;
      pendingCheckpoint = undefined;
      store.close();
    },
  };
}
