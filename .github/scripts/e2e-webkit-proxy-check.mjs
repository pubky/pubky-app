#!/usr/bin/env node
// Pre-flight for the WebKit e2e job (e2e-test.yml), run from the repository root.
//
// Cypress only works when every request of the browser passes through its proxy. In run
// 42930147161 on macOS, WebKit fetched the Cypress runner page through the proxy, but most of the
// page's scripts reached the app on localhost:3000 instead, as proxy-form requests
// ("GET http://localhost:3000/path"). Next.js answers those with a redirect to the same URL, so
// the runner never started and Cypress reported "The browser never connected".
//
// This reproduces that page load without Cypress or the app: a page with many parallel scripts,
// stylesheets, fetches and a WebSocket, a live server on the page's own port, and a proxy that
// serves everything itself. It reports where each request arrived, for the setup Cypress uses, for
// variations of it that would point at a simpler fix, and for the fix the job uses
// (e2e-loopback-demux.mjs). Only that last one decides the result.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { webkit } = createRequire(`${process.cwd()}/`)('playwright-webkit');

const DEMUX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'e2e-loopback-demux.mjs');
const STEP_TIMEOUT_MS = 30_000;
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MODULES = 16;
const STYLES = 3;
const FETCHES = 6;
// One document, one entry script, the modules, the stylesheets, the fetches and one WebSocket.
const EXPECTED = 3 + MODULES + STYLES + FETCHES;
const ROUTES = ['proxy', 'demux', 'server, proxy form', 'server'];

const hits = [];

const range = (count) => Array.from({ length: count }, (_value, index) => index + 1);

function content(base, name) {
  if (name === '') {
    const tags = [
      `<script type="module" crossorigin src="${base}/entry.js"></script>`,
      ...range(MODULES).map((n) => `<link rel="modulepreload" crossorigin href="${base}/m${n}.js">`),
      ...range(STYLES).map((n) => `<link rel="stylesheet" crossorigin href="${base}/s${n}.css">`),
    ];
    return ['text/html', `<!doctype html><title>probe</title>${tags.join('')}`];
  }
  if (name === 'entry.js') {
    const lines = [
      ...range(MODULES).map((n) => `import './m${n}.js';`),
      `const fetched = await Promise.all(${JSON.stringify(range(FETCHES))}.map((n) => fetch('${base}/x' + n).then((r) => r.ok, () => false)));`,
      `const socket = await new Promise((resolve) => {`,
      `  const ws = new WebSocket('ws://' + location.host + '${base}/socket');`,
      `  ws.onopen = () => resolve('open');`,
      `  ws.onerror = () => resolve('error');`,
      `  setTimeout(() => resolve('timeout'), 5000);`,
      `});`,
      `window.probeResult = { fetched: fetched.filter(Boolean).length, socket };`,
    ];
    return ['text/javascript', lines.join('\n')];
  }
  if (name.endsWith('.js')) {
    return ['text/javascript', 'export default 1;'];
  }
  if (name.endsWith('.css')) {
    return ['text/css', 'body { margin: 0; }'];
  }
  return ['text/plain', 'ok'];
}

// A proxy-form request carries the whole URL, a request to a server only the path.
function record(url, routeOf) {
  const proxyForm = /^[a-z]+:\/\//.test(url);
  const [, variant, name] = new URL(url, 'http://probe').pathname.match(/^\/v\/([a-z-]+)\/(.*)$/) ?? [];
  if (variant !== undefined) {
    hits.push({ variant, name, route: routeOf(proxyForm) });
  }
  return [`/v/${variant}`, name ?? ''];
}

function createServer(routeOf) {
  const server = http.createServer((request, response) => {
    const [type, body] = content(...record(request.url, routeOf));
    response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(body);
  });
  server.on('upgrade', (request, socket) => {
    record(request.url, routeOf);
    const accept = createHash('sha1')
      .update(request.headers['sec-websocket-key'] + WEBSOCKET_GUID)
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.on('error', () => {});
  });
  // A browser may tunnel a WebSocket through CONNECT instead of sending the upgrade to the proxy.
  server.on('connect', (_request, socket) => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    server.emit('connection', socket);
  });
  return server;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host }, () => resolve(server.address().port));
  });
}

async function freePort() {
  const server = net.createServer();
  const port = await listen(server, 0, '127.0.0.1');
  await new Promise((resolve) => server.close(resolve));
  return port;
}

// Names the step that hangs, which a bare await would not.
function step(label, promise) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} did not finish within ${STEP_TIMEOUT_MS / 1000} s`)),
      STEP_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const firstLine = (error) => String(error?.message ?? error).split('\n')[0];

// Launches and drives WebKit the way Cypress does (cypress-io/cypress, packages/server/lib/browsers/
// webkit.ts and webkit-automation.ts).
async function load(variant) {
  let browserServer;
  try {
    browserServer = await step(
      'launching WebKit',
      webkit.launchServer({ headless: true, proxy: { server: variant.proxy } }),
    );
    const browser = await step('connecting to WebKit', webkit.connect(browserServer.wsEndpoint()));
    const context = await step(
      'creating the browser context',
      browser.newContext({ ignoreHTTPSErrors: true, deviceScaleFactor: 1 }),
    );
    const page = await step('opening a page', context.newPage());
    if (variant.intercept !== false) {
      await step(
        'intercepting requests',
        context.route('**', (route) => route.continue()),
      );
    }
    await step('loading the page', page.goto(`http://${variant.page}/v/${variant.id}/`, { timeout: 20_000 }));
    const handle = await step(
      'waiting for the page to finish',
      page.waitForFunction(() => window.probeResult, null, { timeout: 15_000 }),
    );
    const { fetched, socket } = await step('reading the result', handle.jsonValue());
    return fetched === FETCHES && socket === 'open'
      ? 'yes'
      : `no (${fetched} of ${FETCHES} fetches, WebSocket ${socket})`;
  } catch (error) {
    return `no (${firstLine(error)})`;
  } finally {
    await browserServer?.kill().catch(() => {});
  }
}

// The page's own port has a live server on every interface, as `next start` has.
const serverPort = await listen(
  createServer((proxyForm) => (proxyForm ? 'server, proxy form' : 'server')),
  0,
  undefined,
);
// Cypress listens on 127.0.0.1 only and tells the browser its proxy is at http://localhost:<port>.
const proxyPort = await listen(
  createServer(() => 'proxy'),
  0,
  '127.0.0.1',
);
const dualProxyPort = await listen(
  createServer(() => 'proxy'),
  0,
  '127.0.0.1',
);
const hasIpv6 = await listen(
  createServer(() => 'proxy'),
  dualProxyPort,
  '::1',
).then(
  () => true,
  () => false,
);
const demuxProxyPort = await listen(
  createServer(() => 'demux'),
  0,
  '127.0.0.1',
);
const demuxPort = await freePort();
const deadPort = await freePort();

const demux = spawn(process.execPath, [DEMUX, String(demuxProxyPort), `${demuxPort}:${serverPort}`], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
await step(
  'starting e2e-loopback-demux',
  new Promise((resolve, reject) => {
    demux.stdout.once('data', resolve);
    demux.once('exit', (code) => reject(new Error(`e2e-loopback-demux exited with ${code}`)));
  }),
);

const variants = [
  {
    id: 'cypress',
    label: 'As Cypress sets it up',
    proxy: `http://localhost:${proxyPort}`,
    page: `localhost:${serverPort}`,
  },
  {
    id: 'no-intercept',
    label: 'Without request interception',
    proxy: `http://localhost:${proxyPort}`,
    page: `localhost:${serverPort}`,
    intercept: false,
  },
  {
    id: 'proxy-ip',
    label: 'Proxy given as 127.0.0.1',
    proxy: `http://127.0.0.1:${proxyPort}`,
    page: `localhost:${serverPort}`,
  },
  hasIpv6 && {
    id: 'proxy-dual',
    label: 'Proxy also listening on ::1',
    proxy: `http://localhost:${dualProxyPort}`,
    page: `localhost:${serverPort}`,
  },
  {
    id: 'page-ip',
    label: 'Page on 127.0.0.1',
    proxy: `http://localhost:${proxyPort}`,
    page: `127.0.0.1:${serverPort}`,
  },
  {
    id: 'dead',
    label: 'Nothing listening on the page port',
    proxy: `http://localhost:${proxyPort}`,
    page: `localhost:${deadPort}`,
  },
  {
    id: 'demux',
    label: 'Page port behind e2e-loopback-demux',
    proxy: `http://localhost:${proxyPort}`,
    page: `localhost:${demuxPort}`,
  },
].filter(Boolean);

console.log(`WebKit on ${os.platform()} ${os.release()} ${os.arch()}; ${EXPECTED} requests per page load`);
const rows = [];
for (const variant of variants) {
  const finished = await load(variant);
  const counts = Object.fromEntries(ROUTES.map((route) => [route, 0]));
  for (const hit of hits) {
    if (hit.variant === variant.id) {
      counts[hit.route] += 1;
    }
  }
  rows.push({ ...variant, finished, counts });
  console.log(
    `${variant.label}: ${ROUTES.map((route) => `${counts[route]} ${route}`).join(', ')}; finished: ${finished}`,
  );
}
demux.kill();

const table = [
  '| Setup | To the proxy | To the proxy through the demux | To the server, proxy form | To the server | Page finished |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    ({ label, counts, finished }) => `| ${label} | ${ROUTES.map((route) => counts[route]).join(' | ')} | ${finished} |`,
  ),
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### WebKit proxy check\n\n${table}\n`);
}

const strayed = ({ counts }) => counts['server, proxy form'] + counts.server;
const asCypress = rows.find(({ id }) => id === 'cypress');
const behindDemux = rows.find(({ id }) => id === 'demux');
if (strayed(asCypress) > 0) {
  console.log(
    `::notice::Reproduced without Cypress: ${strayed(asCypress)} request(s) of the page went to the server on the page's port instead of the proxy.`,
  );
} else if (asCypress.finished === 'yes') {
  console.log('::notice::Not reproduced without Cypress: every request of the page went to the proxy.');
} else {
  console.log(`::warning::Set up as Cypress does, the page did not finish: ${asCypress.finished}`);
}
if (strayed(behindDemux) > 0 || behindDemux.finished !== 'yes') {
  console.log(
    `::error::With e2e-loopback-demux on the page's port, ${strayed(behindDemux)} request(s) still missed the proxy (page finished: ${behindDemux.finished}).`,
  );
  process.exit(1);
}
console.log("With e2e-loopback-demux on the page's port, every request reached the proxy.");
process.exit(0);
