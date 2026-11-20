#!/usr/bin/env node
// Keeps WebKit on macOS behind Cypress's proxy for the WebKit e2e job (e2e-test.yml).
//
//   node e2e-loopback-demux.mjs <proxy-port> <listen-port>:<server-port>...
//
// Cypress only works when every request of the browser passes through its proxy. In run
// 42930147161 WebKit on macOS fetched the Cypress runner page through the proxy, but most of the
// page's scripts arrived at the app on localhost:3000 instead, written as for a proxy:
// "GET http://localhost:3000/path" where a server expects "GET /path". Next.js answers that with a
// redirect to the same URL, so the runner never started and Cypress reported "The browser never
// connected". Why WebKit picks the server's port for those connections is not known.
//
// So each localhost port the browser knows is taken by this process, and the real server moves to
// another port. A connection that opens with a proxy-form request was meant for the proxy and is
// passed to it; anything else (Cypress fetching from the server, curl, the Node SDK) is passed to
// the server. Both are plain TCP pipes once the first request line has been read: a client decides
// what it is talking to when it opens a connection, so a connection keeps one form.
import net from 'node:net';

const LOOPBACK = ['127.0.0.1', '::1'];
const PROXY_FORM = /^(?:[A-Z]+ (?:https?|wss?):\/\/|CONNECT )/;
const MAX_REQUEST_LINE = 16 * 1024;
const MAX_LOGGED = 40;

const [proxyPort, ...pairs] = process.argv.slice(2);
const routes = pairs.map((pair) => pair.split(':').map(Number));
const valid = (port) => Number.isInteger(port) && port > 0 && port < 65536;
if (
  !valid(Number(proxyPort)) ||
  routes.length === 0 ||
  !routes.every((route) => route.length === 2 && route.every(valid))
) {
  console.error('Usage: e2e-loopback-demux.mjs <proxy-port> <listen-port>:<server-port>...');
  process.exit(2);
}

const counts = new Map(routes.map(([listenPort]) => [listenPort, { proxy: 0, server: 0 }]));
let logged = 0;

function pipeTo(client, port, head) {
  const upstream = net.connect({ host: '127.0.0.1', port });
  const end = () => {
    client.destroy();
    upstream.destroy();
  };
  client.on('error', end);
  upstream.on('error', end);
  client.on('close', end);
  upstream.on('close', end);
  upstream.write(head);
  client.pipe(upstream);
  upstream.pipe(client);
}

function accept(client, listenPort, serverPort) {
  let head = Buffer.alloc(0);
  const onError = () => client.destroy();
  const onData = (chunk) => {
    head = Buffer.concat([head, chunk]);
    const lineEnd = head.indexOf('\n');
    if (lineEnd === -1 && head.length < MAX_REQUEST_LINE) {
      return;
    }
    client.off('data', onData);
    client.off('error', onError);
    client.pause();
    const line = head
      .subarray(0, lineEnd === -1 ? head.length : lineEnd)
      .toString('latin1')
      .trimEnd();
    const toProxy = PROXY_FORM.test(line);
    counts.get(listenPort)[toProxy ? 'proxy' : 'server'] += 1;
    if (toProxy && logged < MAX_LOGGED) {
      logged += 1;
      console.log(
        `:${listenPort} -> proxy: ${line.slice(0, 160)}${logged === MAX_LOGGED ? ' (not logging further ones)' : ''}`,
      );
    }
    pipeTo(client, toProxy ? Number(proxyPort) : serverPort, head);
    client.resume();
  };
  client.on('error', onError);
  client.on('data', onData);
}

function listen(listenPort, serverPort, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => accept(client, listenPort, serverPort));
    server.once('error', reject);
    server.listen({ port: listenPort, host }, resolve);
  });
}

function summary() {
  for (const [listenPort, { proxy, server }] of counts) {
    console.log(`:${listenPort}: ${proxy} connection(s) passed to the proxy, ${server} to the server.`);
  }
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    summary();
    process.exit(0);
  });
}

for (const [listenPort, serverPort] of routes) {
  for (const host of LOOPBACK) {
    try {
      await listen(listenPort, serverPort, host);
    } catch (error) {
      // A runner without IPv6 has no ::1 to listen on, and then no client can reach it either.
      if (host === '::1' && ['EADDRNOTAVAIL', 'EAFNOSUPPORT'].includes(error.code)) {
        continue;
      }
      console.error(`Cannot listen on ${host}:${listenPort}: ${error.message}`);
      process.exit(1);
    }
  }
  console.log(`localhost:${listenPort} -> server on :${serverPort}, proxy on :${proxyPort}`);
}
