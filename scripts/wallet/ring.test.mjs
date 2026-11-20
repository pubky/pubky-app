import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  deriveRingEntropy,
  provisionRingWallet,
  ringBinding,
  ringDeviceId,
} from '../../src/core/services/wallet/ring.mjs';

const account = 'y'.repeat(52);
const key = () => Uint8Array.from({ length: 32 }, (_, i) => i);
const id = 'a'.repeat(32);

function vault() {
  const files = new Map();
  return {
    read: (path) => files.get(path)?.slice() ?? null,
    write: (path, data) => files.set(path, new Uint8Array(data)),
    list: (prefix) => [...files.keys()].filter((path) => path.startsWith(prefix)),
  };
}
function options(volume, overrides = {}) {
  const opts = {
    volume,
    account,
    network: 'mainnet',
    key: key(),
    mode: 'create',
    deployment: { network: 'mainnet', electrum: {}, primaryUri: '03' + 'b'.repeat(64) + '@peer:1' },
    verify: async () => {},
    ...overrides,
  };
  return opts;
}

test('v1 HKDF fixes the account, network and English BIP39 mapping', async () => {
  // Independently computed with Python's RFC 5869 HMAC and the BIP39 English checksum/index algorithm.
  const vectors = [
    [
      account,
      'mainnet',
      '2424e88189b97cfd1d50de9e00699d6261ff7620408c5b3265520cbb62681d27',
      'b1c4a5861ab7d77a94f35b2d1d76b610d75931989c35478f277a1c7fa9bf55f2',
    ],
    [
      account,
      'regtest',
      '9853d42a18ac382bd750e1efa99478bd2d7d373c76c6661cfcd779be765037f4',
      '8b0689c55fbdfc53b3732bbc414f3fce45df886624c8950f6a8f163bb4ee436a',
    ],
    [
      'b' + account.slice(1),
      'mainnet',
      'e8ec3a909d03dc51f31d80a209a1a0965b2d5ba1edb66f008c6645e903975d32',
      '3798da8061e2c506a6079c68858d4f0ebb803dc5e91179307b50ededda98383a',
    ],
  ];
  for (const [pubky, network, expected, phraseHash] of vectors) {
    assert.equal(Buffer.from(deriveRingEntropy(key(), pubky, network)).toString('hex'), expected);
    const volume = vault();
    assert.equal(ringBinding(volume), null);
    const deviceId = ringDeviceId(volume);
    const engine = {
      request: async ({ body }) => {
        assert.deepEqual(ringBinding(volume), { deviceId, network });
        assert.equal(body.mnemonic.split(' ').length, 24);
        assert.equal(createHash('sha256').update(body.mnemonic).digest('hex'), phraseHash);
        assert.equal(body.recoveryAutoApply, true);
        return { record: { id, network }, mnemonic: body.mnemonic };
      },
    };
    const opts = options(volume, { account: pubky, network, mode: 'restore', engine, deployment: { network } });
    assert.deepEqual(await provisionRingWallet(opts), { id, network });
    assert.deepEqual(opts.key, new Uint8Array(32));
  }
});

test('staged provisioning preserves mode, enforces key binding and refuses to replace an existing registry', async () => {
  const volume = vault();
  assert.equal(ringDeviceId(volume), ringDeviceId(volume));
  const fail = {
    request: async () => {
      throw new Error('interrupted');
    },
  };
  await assert.rejects(provisionRingWallet(options(volume, { engine: fail })), /interrupted/);
  await assert.rejects(provisionRingWallet(options(volume, { engine: fail, key: new Uint8Array(32) })), {
    code: 'WALLET_RING_BINDING',
  });
  const engine = {
    request: async ({ body }) => {
      assert.equal(body.recoveryAutoApply, false);
      volume.write('/wallet/registry.json', new Uint8Array([1]));
      return { record: { id, network: 'mainnet' } };
    },
  };
  await provisionRingWallet(options(volume, { mode: 'restore', engine }));
  await assert.rejects(provisionRingWallet(options(volume, { mode: 'restore', engine })), { code: 'WALLET_EXISTS' });
});

test('rejects invalid network and an offline deployment before recording a binding', async () => {
  const volume = vault();
  await assert.rejects(provisionRingWallet(options(volume, { network: 'testnet' })), { code: 'WALLET_CONFIGURATION' });
  await assert.rejects(
    provisionRingWallet(
      options(volume, {
        verify: async () => {
          throw new Error('offline');
        },
      }),
    ),
    /offline/,
  );
  assert.deepEqual(volume.list(''), []);
});
