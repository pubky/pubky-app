import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import WebSocket from 'ws';
import { createRelay } from './relay.mjs';
import { connectionGrant, connectionSettings, validGrant } from './transport.mjs';

const settings = connectionSettings({
  WALLET_APP_ORIGIN: 'http://127.0.0.1:3000',
  WALLET_RELAY_ORIGIN: 'ws://127.0.0.1:8790',
  WALLET_NETWORK: 'regtest',
  WALLET_PRIMARY_URI: '02' + 'ab'.repeat(32) + '@127.0.0.1:9735',
  WALLET_RELAY_SECRET: randomBytes(32).toString('hex'),
});

test('grants expire and bind to the configured deployment', () => {
  const { token, expiresAt } = connectionGrant(settings);
  assert.ok(validGrant(settings, token));
  assert.ok(!validGrant(settings, token, expiresAt));
  assert.ok(!validGrant({ ...settings, network: 'mainnet' }, token));
  assert.ok(!validGrant(settings, 'invalid'));
});

test('a granted browser can exchange bytes with the configured target', async (t) => {
  const echo = net.createServer((socket) => socket.pipe(socket));
  echo.listen(0, '127.0.0.1');
  await once(echo, 'listening');
  t.after(() => echo.close());
  const server = createRelay(settings, { host: '127.0.0.1', port: echo.address().port, tls: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const connect = (path, origin, token) =>
    new WebSocket('ws://127.0.0.1:' + server.address().port + path, ['beignet.v1', 'auth.' + token], { origin });
  const { token } = connectionGrant(settings);
  for (const [path, origin, grant] of [
    ['/peer?target=example.org', settings.appOrigin, token],
    ['/electrum', 'https://other.example', token],
    ['/electrum', settings.appOrigin, 'invalid'],
  ]) {
    await assert.rejects(once(connect(path, origin, grant), 'open'), /403/);
  }
  const ws = connect('/electrum', settings.appOrigin, token);
  await once(ws, 'open');
  assert.equal(ws.protocol, 'beignet.v1');
  const bytes = randomBytes(64);
  ws.send(bytes);
  const [message] = await once(ws, 'message');
  assert.deepEqual(message, bytes);
  ws.close();
  await once(ws, 'close');
});
