import assert from 'node:assert/strict';
import test from 'node:test';
import { relayToken } from './bridge.mjs';
import { issueTicket, ticketCache, validTicket } from './tickets.mjs';
import { connectionSettings, lifetimeMs } from './transport.mjs';

const env = {
  VERCEL: '1',
  VERCEL_URL: 'wallet-build.example',
  WALLET_NETWORK: 'regtest',
  WALLET_PRIMARY_URI: '02' + 'ab'.repeat(32) + '@primary.example:9735',
  WALLET_ELECTRUM: 'tls://electrum.example:50002',
  WALLET_APP_ORIGIN: 'https://wallet.example',
  WALLET_RELAY_ORIGIN: 'wss://wallet.example',
};

function cacheHandle(entries) {
  return {
    get: async (key) => entries.get(key)?.value,
    set: async (key, value, options) => entries.set(key, { value, options }),
  };
}

test('the runtime cache adapter preserves the full digest across function handles', async (t) => {
  const entries = new Map();
  const symbol = Symbol.for('@vercel/request-context');
  const original = Object.getOwnPropertyDescriptor(globalThis, symbol);
  Object.defineProperty(globalThis, symbol, {
    configurable: true,
    value: { get: () => ({ cache: cacheHandle(entries) }) },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, symbol, original);
    else delete globalThis[symbol];
  });
  const settings = connectionSettings(env);
  const grant = await issueTicket(settings, ticketCache());
  assert.equal(await validTicket(settings, grant.token, ticketCache()), true);
  assert.match([...entries.keys()][0], /^wallet-relay-v1\$[a-f0-9]{64}$/);
});

test('independent hosted functions redeem an origin-scoped opaque ticket from shared storage', async () => {
  const entries = new Map();
  const issuer = cacheHandle(entries);
  const verifier = cacheHandle(entries);
  const settings = connectionSettings(env);
  const time = 100_000;
  const grant = await issueTicket(settings, issuer, time);
  const [[digest, stored]] = entries;
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(entries.has(grant.token), false);
  assert.deepEqual(stored, { value: time + lifetimeMs, options: { ttl: 900, name: '' } });
  const protocols = 'beignet.v1, auth.' + grant.token;
  assert.equal(relayToken(settings, 'https://other.example', protocols), null);
  assert.equal(relayToken(settings, settings.appOrigin, 'auth.' + grant.token + ', beignet.v1'), null);
  const token = relayToken(settings, settings.appOrigin, protocols);
  assert.equal(await validTicket(settings, token, verifier, time), true);
  assert.equal(await validTicket(settings, token, verifier, time + lifetimeMs), false);
  assert.equal(await validTicket(settings, token, cacheHandle(new Map()), time), false);
  assert.equal(await validTicket(settings, token + 'x', verifier, time), false);
  for (const override of [
    { VERCEL_URL: 'other-build.example' },
    { WALLET_NETWORK: 'mainnet' },
    { WALLET_PRIMARY_URI: env.WALLET_PRIMARY_URI.replace('9735', '1999') },
    { WALLET_APP_ORIGIN: 'https://app.example' },
    { WALLET_RELAY_ORIGIN: 'wss://relay.example' },
    { WALLET_ELECTRUM: 'tls://other-electrum.example:50002' },
    { WALLET_PEER_TUNNEL: 'tcp://proxy.example:9988' },
  ]) {
    assert.equal(await validTicket(connectionSettings({ ...env, ...override }), token, verifier, time), false);
  }
  for (const malformed of [undefined, null, '100001', NaN, Infinity, time + 0.5, time + lifetimeMs + 1]) {
    entries.set(digest, { value: malformed });
    assert.equal(await validTicket(settings, token, verifier, time), false);
  }
});

test('hosted ticket operations fail closed on unavailable caches and missing deployment settings', async () => {
  const settings = connectionSettings(env);
  const fail = async () => {
    throw new Error('cache unavailable');
  };
  await assert.rejects(issueTicket(settings, { set: fail }), /unavailable/);
  await assert.rejects(issueTicket(settings, { set: async () => {}, get: async () => null }), /unavailable/);
  await assert.rejects(validTicket(settings, 'a'.repeat(43), { get: fail }), /unavailable/);
  for (const key of [
    'VERCEL_URL',
    'WALLET_ELECTRUM',
    'WALLET_PRIMARY_URI',
    'WALLET_APP_ORIGIN',
    'WALLET_RELAY_ORIGIN',
  ]) {
    assert.throws(() => connectionSettings({ ...env, [key]: undefined }));
  }
  assert.throws(() => connectionSettings({ ...env, VERCEL: undefined }));
});
