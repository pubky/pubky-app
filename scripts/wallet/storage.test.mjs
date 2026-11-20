import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectFiles, openFiles, unlockVolume } from '../../src/core/services/wallet/storage.mjs';

function store() {
  let state;
  return {
    read: () => state,
    commit: (bytes) => {
      state = bytes.slice();
    },
    close() {},
  };
}

const account = 'y'.repeat(52);
const password = 'disposable test passphrase';

test('wallet writes and renames are encrypted, bound to the account, and recoverable after close', async () => {
  const disk = store();
  const volume = await unlockVolume(disk, account, password);
  const clear = new TextEncoder().encode('disposable registry state');
  volume.write('/wallet/registry.json', clear);
  volume.rename('/wallet/registry.json', '/wallet/renamed.json');
  assert.equal(Buffer.from(disk.read()).includes(clear), false);
  volume.close();
  assert.throws(() => volume.read('/wallet/renamed.json'));
  await assert.rejects(unlockVolume(disk, 'b'.repeat(52), password), { code: 'WALLET_PASSWORD' });
  const saved = await unlockVolume(disk, account, password);
  assert.deepEqual(saved.list('/wallet/'), ['/wallet/renamed.json']);
  assert.deepEqual(saved.read('/wallet/renamed.json'), clear);
  saved.close();
});

test('an ambiguous commit fences a live volume against subsequent channel reads and writes', async () => {
  const disk = store();
  const volume = await unlockVolume(disk, account, password);
  volume.write('/channel', Uint8Array.of(1));
  disk.commit = () => {
    throw new Error('Write failed');
  };
  assert.throws(() => volume.write('/channel', Uint8Array.of(2)), /Write failed/);
  assert.throws(() => volume.write('/channel', Uint8Array.of(2)), { code: 'WALLET_STORAGE' });
  assert.throws(() => volume.read('/channel'), { code: 'WALLET_STORAGE' });
  assert.throws(() => volume.remove('/channel'), { code: 'WALLET_STORAGE' });
  volume.close();
  const recovered = await unlockVolume(disk, account, password);
  assert.deepEqual(recovered.read('/channel'), Uint8Array.of(1));
  recovered.close();
});

test('identical files reuse the last durable commit, including after reopening', async () => {
  const disk = store();
  let volume = await unlockVolume(disk, account, password);
  const value = Uint8Array.of(3, 1, 4);
  volume.write('/file', value);
  const first = disk.read();
  value[0] = 0;
  volume.write('/file', Uint8Array.of(3, 1, 4));
  assert.equal(disk.read(), first);
  volume.close();
  volume = await unlockVolume(disk, account, password);
  volume.write('/file', Uint8Array.of(3, 1, 4));
  assert.equal(disk.read(), first);
  volume.write('/file', Uint8Array.of(3, 1, 5));
  assert.notEqual(disk.read(), first);
  const second = disk.read();
  volume.write('/empty', new Uint8Array());
  assert.notEqual(disk.read(), second);
  volume.close();
});

test('inspection uses only metadata and leaves full validation and repair to unlock', async (t) => {
  let present = false;
  let locked = false;
  const sizes = { journal: 33, first: 80, second: 80, active: 1 };
  const requests = [];
  const reads = [];
  const storage = {
    getDirectory: async () => ({
      getDirectoryHandle: async (_name, options) => {
        requests.push(options.create);
        if (!present) throw new DOMException('absent', 'NotFoundError');
        return {
          getFileHandle: async (name, options) => {
            requests.push(options?.create ?? false);
            return {
              getFile: async () => ({ size: sizes[name] }),
              createSyncAccessHandle: async () => {
                if (locked && name === 'journal') throw new DOMException('busy', 'NoModificationAllowedError');
                if (name === 'journal') locked = true;
                return {
                  getSize: () => sizes[name],
                  close: () => { if (name === 'journal') locked = false; },
                  read: (target) => { reads.push(name); target.fill(0); return target.length; },
                };
              },
            };
          },
        };
      },
    }),
  };
  const before = Object.getOwnPropertyDescriptors(globalThis);
  t.after(() => {
    for (const key of ['isSecureContext', 'navigator']) {
      if (before[key]) Object.defineProperty(globalThis, key, before[key]);
      else delete globalThis[key];
    }
  });
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage } });

  assert.deepEqual(await inspectFiles(account), { exists: false });
  present = true;
  locked = true;
  await assert.rejects(inspectFiles(account), { code: 'WALLET_IN_USE' });
  locked = false;
  assert.deepEqual(await inspectFiles(account), { exists: true, interrupted: true });
  assert.deepEqual(reads, []);
  assert.equal(requests.includes(true), false);
  assert.equal(locked, false);
  assert.equal(sizes.journal, 33);
  await assert.rejects(openFiles(account), /committed wallet data is damaged/);
  assert.deepEqual(reads, ['second', 'journal']);
  sizes.journal = 1;
  await assert.rejects(inspectFiles(account), /initialization was interrupted/);
  assert.equal(locked, false);
});
