import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createSqlJsDatabaseFactory } from '@beignet/portable-engine/sqljs';
import { sha256 } from '@noble/hashes/sha256';
import {
  assertHandoffReady,
  authorizeHandoff,
  handoffErrorMessage,
  installHandoff,
  sealHandoff,
  verifyHandoffSource,
} from '../../src/core/services/wallet/handoff.mjs';
import { createHandoffClose } from '../../src/core/services/wallet/handoff-close.mjs';
import { provisionRingWallet, ringBinding, ringDeviceId } from '../../src/core/services/wallet/ring.mjs';
import { unlockVolume } from '../../src/core/services/wallet/storage.mjs';

const account = 'y'.repeat(52);
const key = () => new Uint8Array(32).fill(19);
const id = 'e'.repeat(32);
const network = 'regtest';
const profile = { network, primaryUri: 'test-primary', electrum: { host: 'electrum.relay', port: 50001, tls: false } };
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const dbPath = '/wallet/regtest.db';

function disk() {
  let sealed;
  let fail = false;
  return {
    read: () => sealed,
    commit(bytes) {
      if (fail) throw new Error('write failed');
      sealed = bytes;
    },
    fail: () => {
      fail = true;
    },
    close() {},
  };
}
async function approved(volume, walletId = id) {
  const record = { id: walletId, network };
  volume.write('/pubky/deployment.json', encode(profile));
  await provisionRingWallet({
    volume,
    account,
    key: key(),
    network,
    deployment: profile,
    mode: 'create',
    verify: async () => {},
    engine: {
      request: async ({ body }) => {
        volume.write(
          '/wallet/registry.json',
          encode({ record, mnemonic: body.mnemonic, recoveryImport: { autoApply: false, complete: false } }),
        );
        return { record };
      },
    },
  });
}
async function authorization(sourceDeviceId, transferId = crypto.randomUUID(), overrides = {}) {
  return authorizeHandoff(account, { key: key(), network, sourceDeviceId, transferId, ...overrides }, profile);
}
const assertOpen = () => {};

test('a clean handoff moves exact wallet files under the destination password, retaining its device identity and retry state', async () => {
  const sourcePassword = 'local source passphrase';
  const targetPassword = 'different local passphrase';
  const sourceDisk = disk();
  const targetDisk = disk();
  const source = await unlockVolume(sourceDisk, account, sourcePassword);
  const target = await unlockVolume(targetDisk, account, targetPassword);
  await approved(source);
  await approved(target, 'f'.repeat(32));
  target.write('/wallet/removed-stale-file', Uint8Array.of(9));
  const sourceId = ringDeviceId(source);
  const targetId = ringDeviceId(target);
  const auth = await authorization(sourceId);
  const realDb = await createSqlJsDatabaseFactory({
    load: () => null,
    save: (path, bytes) => source.write(path, bytes),
  });
  const sql = realDb(dbPath);
  sql.exec('CREATE TABLE channels (channel_id TEXT PRIMARY KEY, state_json TEXT)');
  sql.prepare('INSERT INTO channels VALUES (?,?)').run('channel', 'durable commitment');
  sql.close();
  const balances = '/pubky/last-balance-v1.json';
  const receipt = '/pubky/away-receipts-v1/' + id;
  source.write(balances, encode({ totalSats: 58129, walletId: id }));
  source.write(receipt, encode({ receipt: 'away' }));
  source.compact();
  const digest = sha256(source.read(dbPath));
  await assert.rejects(sealHandoff(source, auth, new Uint8Array(32)), { reason: 'SNAPSHOT' });
  await assert.rejects(
    sealHandoff(source, { ...auth, deployment: { ...profile, primaryUri: 'another-primary' } }, digest),
    {
      reason: 'PROFILE',
    },
  );
  assert.throws(() => verifyHandoffSource(source, { ...auth, commitment: '0'.repeat(64) }), { reason: 'RING_BINDING' });
  assert.throws(() => verifyHandoffSource(source, { ...auth, mnemonic: '' }), { reason: 'REGISTRY' });
  const envelope = await sealHandoff(source, auth, digest);
  assert.equal(new TextDecoder().decode(envelope).includes('durable commitment'), false);
  const opened = () => installHandoff(target, auth, targetId, envelope, assertOpen);
  for (const fields of [
    { key: new Uint8Array(32).fill(20) },
    { transferId: crypto.randomUUID() },
    { sourceDeviceId: crypto.randomUUID() },
  ]) {
    const other = await authorization(sourceId, auth.transferId, fields);
    await assert.rejects(installHandoff(target, other, targetId, envelope, assertOpen));
  }
  const corrupt = envelope.slice();
  corrupt[20] ^= 1;
  await assert.rejects(installHandoff(target, auth, targetId, corrupt, assertOpen));
  await assert.rejects(installHandoff(target, auth, sourceId, envelope, assertOpen));
  const empty = await unlockVolume(disk(), account, 'different new password');
  const freshDevice = ringDeviceId(empty);
  const wrongAccount = await authorizeHandoff(
    'b' + account.slice(1),
    { key: key(), sourceDeviceId: sourceId, network, transferId: auth.transferId },
    profile,
  );
  await assert.rejects(installHandoff(empty, wrongAccount, freshDevice, envelope, assertOpen));
  const wrongNetwork = await authorizeHandoff(
    account,
    { key: key(), sourceDeviceId: sourceId, network: 'mainnet', transferId: auth.transferId },
    { ...profile, network: 'mainnet' },
  );
  await assert.rejects(installHandoff(empty, wrongNetwork, freshDevice, envelope, assertOpen));
  await assert.rejects(
    installHandoff(empty, auth, freshDevice, envelope, () => {
      throw new Error('lost lease');
    }),
  );
  assert.equal(empty.read('/wallet/registry.json'), null);
  empty.write('/wallet/registry.json', encode({ record: { id, network }, mnemonic: 'independent wallet' }));
  await assert.rejects(installHandoff(empty, auth, freshDevice, envelope, assertOpen));
  assert.equal(ringBinding(empty), null);
  empty.close();
  assert.deepEqual(target.read('/wallet/removed-stale-file'), Uint8Array.of(9));
  assert.deepEqual(await opened(), { id, network, deviceId: targetId });
  assert.equal(target.read('/wallet/removed-stale-file'), null);
  assert.deepEqual(target.read(dbPath), source.read(dbPath));
  assert.deepEqual(target.read(balances), source.read(balances));
  assert.deepEqual(target.read(receipt), source.read(receipt));
  target.write(receipt, encode({ receipt: 'newer' }));
  assert.deepEqual(await opened(), { id, network, deviceId: targetId });
  assert.deepEqual(target.read(receipt), encode({ receipt: 'newer' }));
  target.close();
  await assert.rejects(unlockVolume(targetDisk, account, sourcePassword));
  const reopened = await unlockVolume(targetDisk, account, targetPassword);
  assert.deepEqual(ringBinding(reopened), { deviceId: targetId, network, transferId: auth.transferId });
  const following = await authorization(sourceId);
  const nextEnvelope = await sealHandoff(source, following, digest);
  const returning = await authorization(targetId);
  await sealHandoff(reopened, returning, digest);
  // Local activity may resume if publishing an offer failed. A previously
  // consumed offer cannot be replayed after this device in turn offered it.
  await assert.rejects(installHandoff(reopened, auth, targetId, envelope, assertOpen));
  await installHandoff(reopened, following, targetId, nextEnvelope, assertOpen);
  await assert.rejects(installHandoff(reopened, auth, targetId, envelope, assertOpen));
  reopened.write(receipt, encode({ receipt: 'newest' }));
  const last = await authorization(sourceId);
  const finalEnvelope = await sealHandoff(source, last, digest);
  targetDisk.fail();
  await assert.rejects(installHandoff(reopened, last, targetId, finalEnvelope, assertOpen));
  reopened.close();
  const intact = await unlockVolume(targetDisk, account, targetPassword);
  assert.deepEqual(intact.read(receipt), encode({ receipt: 'newest' }));
  assert.equal(ringBinding(intact).transferId, following.transferId);
  intact.close();
  source.close();
});

test('a clean close requires graceful node and wallet stops and the exact flushed SQL image', async () => {
  for (const outcome of [
    'clean',
    'idle empty',
    'live database changed',
    'write failed',
    'fallback',
    'abandoned',
    'persistence',
    'new htlc',
    'no database close',
  ]) {
    const observer = createHandoffClose();
    const volume = new Map();
    const factory = await createSqlJsDatabaseFactory({
      load: (path) => volume.get(path),
      save(path, bytes) {
        if (!observer.capture(path, bytes)) volume.set(path, bytes.slice());
      },
    });
    const db = observer.opened(dbPath, factory(dbPath));
    db.exec('CREATE TABLE channels (channel_id TEXT PRIMARY KEY)');
    const state = { htlcs: new Map(), pendingLocalUpdates: [] };
    const channels = [];
    if (!['idle empty', 'live database changed'].includes(outcome)) {
      db.prepare('INSERT INTO channels VALUES (?)').run('deadbeef');
      channels.push({ getFullState: () => state, getChannelId: () => Buffer.from('deadbeef', 'hex') });
    }
    const before = volume.get(dbPath);
    if (outcome === 'live database changed') {
      // SQL.js can change the live header through pragma() without a save callback.
      db.pragma('user_version = 17');
      assert.deepEqual(db.pragma('user_version'), [{ user_version: 17 }]);
      assert.equal(volume.get(dbPath), before);
    }
    const node = Object.assign(new EventEmitter(), {
      getChannelManager: () => ({ listChannels: () => channels }),
      async gracefulShutdown() {
        if (outcome === 'new htlc') state.htlcs.set(1, 'pending');
        if (outcome === 'persistence') node.emit('node:error', { code: 'PERSISTENCE_ERROR' });
        if (outcome === 'fallback') throw new Error('destroy fallback');
      },
    });
    const wallet = {
      stop: async () => ({
        isOk: () => true,
        value: outcome === 'abandoned' ? 'Wallet stopped, abandoning a refresh.' : 'Wallet stopped.',
      }),
    };
    const instance = observer.extension.attach({ wallet, generation: 1, network });
    instance.bind(node);
    instance.start();
    const graceful = node.gracefulShutdown;
    const stop = wallet.stop;
    const close = observer.close(
      {
        async close() {
          instance.stop('shutdown');
          await node.gracefulShutdown().catch(() => {});
          await wallet.stop();
          if (outcome !== 'no database close') db.close();
        },
      },
      network,
      (path, bytes) => {
        if (outcome === 'write failed') throw new Error('Commit interrupted');
        volume.set(path, bytes.slice());
      },
    );
    if (['clean', 'idle empty', 'live database changed'].includes(outcome)) {
      assert.deepEqual(await close, sha256(volume.get(dbPath)));
      if (outcome === 'idle empty') assert.deepEqual(volume.get(dbPath), before);
      if (outcome === 'live database changed') {
        assert.notDeepEqual(volume.get(dbPath), before);
        const reopened = factory(dbPath);
        assert.deepEqual(reopened.pragma('user_version'), [{ user_version: 17 }]);
        reopened.close();
      }
    } else {
      await assert.rejects(close, { code: 'WALLET_CLOSE_UNCERTAIN' });
      assert.equal(volume.get(dbPath), before);
    }
    assert.equal(node.gracefulShutdown, graceful);
    assert.equal(wallet.stop, stop);
    db.close();
  }
});

test('requires a running, idle recovery and payment surface', async () => {
  const status = {
    mode: 'peer-storage',
    state: 'running',
    importPending: false,
    autoApply: { phase: 'idle' },
    node: { gate: 'disabled', fenced: false, awaitingDurabilityCount: 0, heldReestablish: [], channels: [] },
  };
  const payments = [{ status: 'PENDING', direction: 'INCOMING' }];
  const engine = {
    request: async ({ path }) => {
      if (path.endsWith('/recovery/status')) return status;
      if (path.endsWith('/receive/offline')) return { reservedChannelIds: [], requests: [] };
      assert.equal(status.importPending, false, 'a recovering node may reject its other daemon routes');
      if (path.endsWith('/payments')) return payments;
      return [];
    },
  };
  await assertHandoffReady(engine, id);
  status.node.channels.push({ channelId: 'a', status: 'active', restoreRecencyUnproven: true });
  await assert.rejects(assertHandoffReady(engine, id), {
    code: 'WALLET_HANDOFF_PENDING',
    reason: 'CHANNELS_UNSETTLED',
  });
  status.node.channels.length = 0;
  status.importPending = true;
  await assert.rejects(assertHandoffReady(engine, id), { code: 'WALLET_HANDOFF_PENDING', reason: 'RECOVERY_PENDING' });
  status.importPending = false;
  payments.push({ status: 'PENDING', direction: 'OUTGOING' });
  await assert.rejects(assertHandoffReady(engine, id), {
    code: 'WALLET_HANDOFF_PENDING',
    reason: 'OPERATIONS_UNSETTLED',
  });
});

test('only known handoff reasons can reach the device', () => {
  assert.match(handoffErrorMessage({ code: 'WALLET_HANDOFF_PENDING', reason: 'RECOVERY_PENDING' }), /recovery peer/i);
  assert.doesNotMatch(
    handoffErrorMessage({ code: 'WALLET_HANDOFF_INVALID', reason: 'private text', message: 'sensitive' }),
    /private text|sensitive/,
  );
  assert.equal(typeof handoffErrorMessage({ code: 'WALLET_HANDOFF_INVALID', reason: '__proto__' }), 'string');
});
