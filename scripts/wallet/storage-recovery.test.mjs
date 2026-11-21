import assert from 'node:assert/strict';
import { createHash, randomFillSync } from 'node:crypto';
import { test } from 'node:test';
import { openFiles, unlockVolume } from '../../src/core/services/wallet/storage.mjs';

const account = 'y'.repeat(52);
const password = 'durable storage integration fixture';
const database = '/wallet/node.sqlite';
const original = randomFillSync(new Uint8Array(3 * 1024 * 1024));

// Each handle owns a volatile copy. Only flush makes its bytes survive a crash.
function filesystem(t) {
  const files = new Map();
  const locks = new Set();
  let fault;
  const directory = {
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name)) {
        if (!create) throw new DOMException('Missing', 'NotFoundError');
        files.set(name, new Uint8Array());
      }
      return {
        async getFile() {
          return { size: files.get(name).length };
        },
        async createSyncAccessHandle() {
          if (locks.has(name)) throw new DOMException('Busy', 'NoModificationAllowedError');
          locks.add(name);
          let buffer = files.get(name).slice();
          return {
            getSize: () => buffer.length,
            read(target, { at }) {
              const part = buffer.subarray(at, at + target.length);
              target.set(part);
              return part.length;
            },
            write(source, { at }) {
              if (at + source.length > buffer.length) {
                const previous = buffer;
                buffer = new Uint8Array(at + source.length);
                buffer.set(previous);
              }
              buffer.set(source, at);
              return source.length;
            },
            truncate(size) {
              buffer = buffer.slice(0, size);
            },
            flush() {
              if (fault?.name !== name) {
                files.set(name, buffer.slice());
                return;
              }
              const { outcome } = fault;
              fault = undefined;
              if (outcome === 'after') files.set(name, buffer.slice());
              if (outcome === 'partial') files.set(name, buffer.slice(0, files.get(name).length + 1));
              throw new Error('Simulated interrupted flush');
            },
            close() {
              locks.delete(name);
            },
          };
        },
      };
    },
  };
  for (const [key, value] of Object.entries({
    navigator: { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => directory }) } },
    isSecureContext: true,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  return {
    files,
    fault: (name, outcome) => {
      fault = { name, outcome };
    },
  };
}

// The legacy no-checkpoint store creates exactly the input that an existing wallet upgrades from.
async function seedLegacy(files) {
  let sealed;
  const volume = await unlockVolume(
    {
      read: () => null,
      commit: (bytes) => {
        sealed = bytes;
      },
      close() {},
    },
    account,
    password,
  );
  volume.write(database, original);
  volume.write('/channel', Uint8Array.of(1));
  volume.close();
  files.set('second', sealed);
  files.set('journal', Uint8Array.from(createHash('sha256').update(sealed).digest()));
}

async function open() {
  const store = await openFiles(account);
  try {
    return { store, volume: await unlockVolume(store, account, password) };
  } catch (error) {
    store.close();
    throw error;
  }
}

test('a large legacy wallet retains committed channel changes across crash, compaction and reopen', async (t) => {
  const { files } = filesystem(t);
  await seedLegacy(files);
  const { store, volume } = await open();
  store.markPayment();
  const changed = original.slice();
  changed[65537] ^= 0xff;
  volume.write(database, changed);
  volume.rename('/channel', '/settled');
  volume.write('/pending', Uint8Array.of(2));
  volume.remove('/settled');
  assert.ok(files.get('checkpoint').length >= original.length);
  assert.ok(files.get('second').length < original.length / 4);
  volume.close(); // No graceful compaction, as when the worker terminates.
  const next = await open();
  assert.deepEqual(next.volume.list().sort(), [database, '/pending'].sort());
  assert.deepEqual(next.volume.read(database), changed);
  assert.deepEqual(next.volume.read('/pending'), Uint8Array.of(2));
  next.volume.compact();
  next.volume.close();
  assert.equal(files.get('active').length, 2);
  files.delete('checkpoint');
  const legacy = await open();
  assert.deepEqual(legacy.volume.read(database), changed);
  assert.deepEqual(legacy.volume.read('/pending'), Uint8Array.of(2));
  legacy.volume.close();
});

for (const [file, outcome, expected] of [
  ['second', 'after', 2],
  ['journal', 'before', 2],
  ['journal', 'partial', 2],
  ['journal', 'after', 3],
]) {
  test(`interrupted ${file} flush (${outcome}) recovers exactly the journaled state`, async (t) => {
    const fs = filesystem(t);
    await seedLegacy(fs.files);
    const { volume } = await open();
    volume.write('/channel', Uint8Array.of(2));
    // Seed was the second slot; the first overlay is now in the first slot.
    fs.fault(file, outcome);
    assert.throws(() => volume.write('/channel', Uint8Array.of(3)), /interrupted flush/);
    assert.throws(() => volume.read('/channel'));
    volume.close();
    const next = await open();
    assert.deepEqual(next.volume.read('/channel'), Uint8Array.of(expected));
    assert.deepEqual(next.volume.read(database), original);
    next.volume.close();
  });
}

test('a committed overlay refuses a missing, damaged or replaced checkpoint', async (t) => {
  const { files } = filesystem(t);
  await seedLegacy(files);
  const { volume } = await open();
  volume.write('/channel', Uint8Array.of(2));
  volume.close();
  const checkpoint = files.get('checkpoint');
  assert.ok(checkpoint?.length);
  files.delete('checkpoint');
  await assert.rejects(open());
  const corrupt = checkpoint.slice();
  corrupt[corrupt.length - 1] ^= 1;
  files.set('checkpoint', corrupt);
  await assert.rejects(open());
  const unrelated = new Map();
  await seedLegacy(unrelated);
  files.set('checkpoint', unrelated.get('second'));
  await assert.rejects(open());
  files.set('checkpoint', checkpoint);
  const next = await open();
  assert.deepEqual(next.volume.read('/channel'), Uint8Array.of(2));
  next.volume.close();
});

test('a dense rewrite establishes a new checkpoint without losing the channel state', async (t) => {
  const { files } = filesystem(t);
  await seedLegacy(files);
  const { volume } = await open();
  volume.write('/channel', Uint8Array.of(2));
  const replacement = randomFillSync(new Uint8Array(original.length));
  volume.write(database, replacement);
  const oldCheckpoint = files.get('checkpoint');
  volume.write('/receipt', Uint8Array.of(3));
  assert.notDeepEqual(files.get('checkpoint'), oldCheckpoint);
  volume.close();
  const next = await open();
  assert.deepEqual(next.volume.read(database), replacement);
  assert.deepEqual(next.volume.read('/channel'), Uint8Array.of(2));
  assert.deepEqual(next.volume.read('/receipt'), Uint8Array.of(3));
  next.volume.close();
});

test('an interrupted compaction preserves the last committed channel state', async (t) => {
  const fs = filesystem(t);
  await seedLegacy(fs.files);
  const { volume } = await open();
  volume.write('/channel', Uint8Array.of(2));
  fs.fault('journal', 'before');
  assert.throws(() => volume.compact(), /interrupted flush/);
  assert.throws(() => volume.write('/channel', Uint8Array.of(3)));
  volume.close();
  const next = await open();
  assert.deepEqual(next.volume.read('/channel'), Uint8Array.of(2));
  assert.deepEqual(next.volume.read(database), original);
  next.volume.close();
});
