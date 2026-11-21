import { applyPageDelta, encodePageDelta, pageDeltaLength } from './page-delta.mjs';

// Keep the same maximum as the original encrypted slot (32 salt + 12 nonce + 16 tag).
export const maxPackedBytes = 256 * 1024 * 1024 - 60;
const magic = Uint8Array.of(0, 0, 0, 0, 80, 75, 79, 1); // A v1 entry cannot have a zero-length name.
const headerLength = magic.length + 32;
const empty = new Uint8Array();
const utf8 = new TextEncoder();
const text = new TextDecoder('utf-8', { fatal: true });

function invalid() {
  return Object.assign(new Error('Invalid wallet filesystem.'), { code: 'WALLET_STORAGE' });
}

function checkSize(size) {
  if (size > maxPackedBytes) {
    throw Object.assign(new Error('This wallet exceeds the browser storage limit.'), { code: 'WALLET_STORAGE' });
  }
}

function serialize(entries, size, digest) {
  const blob = new Uint8Array(size);
  const view = new DataView(blob.buffer);
  let offset = 0;
  if (digest) {
    blob.set(magic);
    blob.set(digest, magic.length);
    offset = headerLength;
  }
  for (const [name, bytes] of entries) {
    view.setUint32(offset, name.length);
    view.setUint32(offset + 4, bytes.length);
    blob.set(name, offset + 8);
    blob.set(bytes, offset + 8 + name.length);
    offset += 8 + name.length + bytes.length;
  }
  return blob;
}

export function packFiles(files) {
  const entries = [];
  let size = 0;
  for (const [path, bytes] of files) {
    const name = utf8.encode(path);
    if (!name.length) throw invalid();
    size += 8 + name.length + bytes.length;
    checkSize(size);
    entries.push([name, bytes]);
  }
  return serialize(entries, size);
}

function visitEntries(blob, offset, visit, maxNameBytes = maxPackedBytes) {
  checkSize(blob.length);
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  while (offset < blob.length) {
    if (blob.length - offset < 8) throw invalid();
    const nameLength = view.getUint32(offset);
    const size = view.getUint32(offset + 4);
    const start = offset + 8 + nameLength;
    if (!nameLength || nameLength > maxNameBytes || start + size > blob.length) throw invalid();
    const path = text.decode(blob.subarray(offset + 8, start));
    visit(path, blob.subarray(start, start + size), 8 + nameLength);
    offset = start + size;
  }
}

export function unpackFiles(blob, { maxFiles = Infinity, maxNameBytes, views = false } = {}) {
  const files = new Map();
  visitEntries(blob, 0, (path, bytes) => {
    if (files.size >= maxFiles || files.has(path)) throw invalid();
    files.set(path, views ? bytes : bytes.slice());
  }, maxNameBytes);
  return files;
}

export function checkpointDigest(plain) {
  if (!magic.every((byte, i) => plain[i] === byte)) return null;
  if (plain.length < headerLength) throw invalid();
  return plain.slice(magic.length, headerLength);
}

/** The base and every file value are immutable while this checkpoint is in use. */
export function createOverlay(base, digest) {
  if (digest.length !== 32) throw invalid();
  const patches = new WeakMap();
  return {
    pack(files, limit) {
      const entries = [];
      let logicalSize = 0;
      let size = headerLength;
      for (const [path, bytes] of files) {
        const name = utf8.encode(path);
        if (!name.length) throw invalid();
        logicalSize += 8 + name.length + bytes.length;
        checkSize(logicalSize);
        const original = base.get(path);
        let patch = empty;
        if (original !== bytes) {
          let cached = patches.get(bytes);
          if (!cached || cached.original !== original) {
            cached = { original, patch: encodePageDelta(original ?? empty, bytes) };
            patches.set(bytes, cached);
          }
          patch = cached.patch;
        }
        size += 8 + name.length + patch.length;
        // The caller checks the full logical size when it packs a replacement v1 head.
        if (size > limit) return null;
        entries.push([name, patch]);
      }
      checkSize(size);
      return serialize(entries, size, digest);
    },
    restore(plain) {
      const stored = checkpointDigest(plain);
      if (!stored || !digest.every((byte, i) => byte === stored[i])) throw invalid();
      const entries = new Map();
      let logicalSize = 0;
      // Validate every patch and the total expanded size before allocating reconstructed files.
      visitEntries(plain, headerLength, (path, patch, overhead) => {
        if (entries.has(path) || (!patch.length && !base.has(path))) throw invalid();
        logicalSize += overhead + (patch.length ? pageDeltaLength(patch) : base.get(path).length);
        checkSize(logicalSize);
        entries.set(path, patch);
      });
      const files = new Map();
      for (const [path, patch] of entries) {
        const original = base.get(path);
        const bytes = patch.length ? applyPageDelta(original ?? empty, patch) : original;
        files.set(path, bytes);
        if (patch.length) patches.set(bytes, { original, patch: patch.slice() });
      }
      return files;
    },
    wipe(retained) {
      for (const bytes of base.values()) {
        if (!retained?.has(bytes)) bytes.fill(0);
      }
      base.clear();
    },
  };
}
