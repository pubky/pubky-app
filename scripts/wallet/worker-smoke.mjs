// Run against disposable regtest services. This test never funds a wallet or broadcasts a payment.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createRelay } from './relay.mjs';
import { connectionGrant, socketTarget } from './transport.mjs';

const publicAssets = new URL('../../public/wallet-engine/', import.meta.url);
const primaryUri = process.env.WALLET_SMOKE_PRIMARY;
if (!primaryUri || !/^(02|03)[a-f0-9]{64}@127\.0\.0\.1:\d+$/.test(primaryUri)) {
  throw new Error('Set WALLET_SMOKE_PRIMARY to the regtest node public key and loopback peer port.');
}
const electrumPort = Number(process.env.WALLET_SMOKE_ELECTRUM_PORT || 60001);
const origin = (server) => 'http://127.0.0.1:' + server.address().port;
const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once('error', reject).listen(0, '127.0.0.1', resolve);
  });
const settings = { key: randomBytes(32), network: 'regtest', primaryUri };
let available = true;
const server = createServer(async (req, res) => {
  if (req.url === '/') res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Wallet verification</title>');
  else if (req.url === '/api/wallet/connection') {
    res.writeHead(available ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(available ? connectionGrant(settings) : {}));
  } else {
    const file = req.url.split('/').at(-1);
    if (!['worker.js', 'sql-wasm.wasm'].includes(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
    res.end(await readFile(new URL(file, publicAssets)));
  }
});
const relay = createRelay(
  settings,
  { host: '127.0.0.1', port: electrumPort, tls: false },
  socketTarget('tcp://' + primaryUri.split('@')[1]),
);
let browser;
try {
  await listen(server);
  await listen(relay);
  settings.appOrigin = origin(server);
  settings.relayOrigin = origin(relay).replace('http:', 'ws:');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  const context = await browser.newContext();
  const page = await context.newPage();
  const other = await context.newPage();
  async function setup(tab, account) {
    await tab.goto(settings.appOrigin);
    await tab.evaluate((account) => {
      const worker = new Worker('/wallet-engine/worker.js', { type: 'module' });
      window.interruptWallet = () => worker.terminate();
      const pending = new Map();
      let counter = 0;
      worker.onmessage = ({ data }) => {
        const task = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) task.reject(Object.assign(new Error(data.error.message), { code: data.error.code }));
        else task.resolve(data.result);
      };
      worker.onerror = () => {
        for (const task of pending.values()) task.reject(new Error('Worker failed'));
      };
      window.walletCall = (operation, payload) =>
        new Promise((resolve, reject) => {
          const id = ++counter;
          pending.set(id, { resolve, reject });
          worker.postMessage({ id, account, operation, payload });
        });
    }, account);
  }
  const owner = 'y'.repeat(52);
  const password = randomBytes(16).toString('hex');
  await setup(page, owner);
  assert.deepEqual(await page.evaluate(() => window.walletCall('inspect')), { exists: false });
  const defaults = await page.evaluate((password) => window.walletCall('open', password), password);
  assert.equal(defaults.network, 'regtest');
  const version = await page.evaluate(
    async () => (await window.walletCall('request', { method: 'GET', path: '/api/config' })).engineVersion,
  );
  assert.equal(version, '0.43.6-portable');

  await setup(other, owner);
  assert.equal(await other.evaluate(() => window.walletCall('inspect').catch((error) => error.code)), 'WALLET_IN_USE');
  await setup(other, 'b'.repeat(52));
  assert.deepEqual(await other.evaluate(() => window.walletCall('inspect')), { exists: false });
  const cancelled = await other.evaluate(async (password) => {
    const opening = window.walletCall('open', password).catch((error) => error.code);
    await window.walletCall('close');
    return opening;
  }, password);
  assert.equal(cancelled, 'WALLET_CLOSED');
  await setup(other, 'b'.repeat(52));
  assert.deepEqual(await other.evaluate(() => window.walletCall('inspect')), { exists: false });
  await other.close();

  // Keep the generated phrase inside the browser. Only boolean checks and the public id cross back.
  const created = await page.evaluate(async (defaults) => {
    const result = await window.walletCall('request', {
      method: 'POST',
      path: '/api/wallets',
      body: {
        name: 'Browser regtest',
        network: defaults.network,
        lfbw: { enabled: true, primaryUri: defaults.primaryUri },
      },
    });
    return {
      id: result.record.id,
      setup: result.record.lfbw.setup,
      reason: result.record.lfbw.setupError,
      phrase: result.mnemonic.split(' ').length >= 12,
    };
  }, defaults);
  assert.equal(created.phrase, true);
  assert.equal(created.setup, 'ready', created.reason);
  const address = await page.evaluate(
    (id) =>
      window.walletCall('request', {
        method: 'POST',
        path: '/wallets/' + id + '/api/address/new',
      }),
    created.id,
  );
  assert.match(address.address, /^bcrt1/);
  await page.evaluate(() => window.walletCall('close'));

  available = false;
  await setup(page, owner);
  assert.deepEqual(await page.evaluate(() => window.walletCall('inspect')), { exists: true });
  assert.equal(
    await page.evaluate(() => window.walletCall('open', 'incorrect password').catch((error) => error.code)),
    'WALLET_PASSWORD',
  );
  await page.evaluate((password) => window.walletCall('open', password), password);
  const ids = await page.evaluate(async () =>
    (await window.walletCall('request', { method: 'GET', path: '/api/wallets' })).map((wallet) => wallet.id),
  );
  assert.deepEqual(ids, [created.id]);
  assert.equal(await page.evaluate((id) => window.walletCall('request', {
    method: 'POST', path: '/api/wallets/' + id + '/start',
  }).catch((error) => error.code), created.id), 'WALLET_CONFIGURATION');
  const phraseRecovered = await page.evaluate(async (id) => {
    const { mnemonic } = await window.walletCall('request', {
      method: 'GET',
      path: '/wallets/' + id + '/api/mnemonic',
    });
    return mnemonic.split(' ').length >= 12;
  }, created.id);
  assert.equal(phraseRecovered, true);
  await page.evaluate(() => window.walletCall('close'));
  // Abrupt tab/worker shutdown must be distinguished from a clean close.
  await setup(page, owner);
  await page.evaluate((password) => window.walletCall('open', password), password);
  await page.evaluate(() => window.interruptWallet());
  await setup(page, owner);
  assert.deepEqual(await page.evaluate(() => window.walletCall('inspect')), { exists: true, interrupted: true });
  available = true;
  settings.network = 'testnet';
  await setup(page, owner);
  const original = await page.evaluate((password) => window.walletCall('open', password), password);
  assert.equal(original.network, 'regtest');
  const recoveryOnly = await page.evaluate(async (id) => {
    const backup = await window.walletCall('request', { method: 'GET', path: '/wallets/' + id + '/api/mnemonic' });
    const code = await window
      .walletCall('request', { method: 'POST', path: '/api/wallets/' + id + '/start' })
      .catch((error) => error.code);
    return backup.mnemonic.split(' ').length >= 12 && code === 'WALLET_CONFIGURATION';
  }, created.id);
  assert.equal(recoveryOnly, true);
  await page.evaluate(() => window.walletCall('close'));
  console.info(
    'Passed browser regtest wallet creation, address generation, cross-tab lease, account isolation, password check, offline reopen and recovery after relay reconfiguration.',
  );
} finally {
  await browser?.close();
  relay.close();
  server.close();
}
