import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unlockVolume } from '../../src/core/services/wallet/storage.mjs';

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
  assert.throws(() => volume.read('/channel'), { code: 'WALLET_STORAGE' });
  assert.throws(() => volume.remove('/channel'), { code: 'WALLET_STORAGE' });
  volume.close();
  const recovered = await unlockVolume(disk, account, password);
  assert.deepEqual(recovered.read('/channel'), Uint8Array.of(1));
  recovered.close();
});
