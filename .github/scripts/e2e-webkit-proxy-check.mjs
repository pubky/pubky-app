#!/usr/bin/env node
// Pre-flight for the WebKit e2e job (e2e-test.yml), run from the repository root.
//
// Cypress attaches to a browser by serving its runner at <baseUrl>/__/ from its own proxy, and the
// e2e baseUrl is http://localhost:3000. A browser that sends localhost requests straight to the app
// instead of to its proxy therefore never attaches: Cypress prints "Timed out waiting for the
// browser to connect" for three minutes and runs no test, without saying why. CFNetwork, the macOS
// network stack, has skipped proxies for loopback hosts before (microsoft/playwright#20328).
//
// This launches WebKit the way Cypress does (cypress-io/cypress, packages/server/lib/browsers/
// webkit.ts and webkit-automation.ts), behind a local proxy that answers every request itself, and
// reports for a few hostnames whether a page load and a WebSocket reached the proxy or went direct.
// Only localhost decides the result; the other hostnames show what a fix could use instead.
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';

const { webkit } = createRequire(`${process.cwd()}/`)('playwright-webkit');

const STEP_TIMEOUT_MS = 30_000;
const HOSTS = ['localhost', '127.0.0.1', 'app.localhost', 'e2e-app.test'];
const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const upgrades = [];

function serve(name, host) {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<title>${name}</title>`);
  });
  server.on('upgrade', (request, socket) => {
    upgrades.push(name);
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
  return new Promise((resolve) => server.listen(0, host, () => resolve(server.address().port)));
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

async function check(page, host, directPort) {
  const result = { host, page: '', webSocket: '', secureContext: '' };
  try {
    await step(`loading http://${host}`, page.goto(`http://${host}:${directPort}/`, { timeout: 15_000 }));
    result.page = await step(`reading the title of http://${host}`, page.title());
    result.secureContext = String(
      await step(
        `reading isSecureContext of http://${host}`,
        page.evaluate(() => window.isSecureContext),
      ),
    );
  } catch (error) {
    result.page = `failed (${firstLine(error)})`;
    return result;
  }
  try {
    upgrades.length = 0;
    const state = await step(
      `opening ws://${host}`,
      page.evaluate(
        (url) =>
          new Promise((resolve) => {
            const socket = new WebSocket(url);
            socket.onopen = () => resolve('open');
            socket.onerror = () => resolve('error');
            setTimeout(() => resolve('timeout'), 5000);
          }),
        `ws://${host}:${directPort}/socket`,
      ),
    );
    result.webSocket = state === 'open' ? upgrades.join(', ') : `failed (${state})`;
  } catch (error) {
    result.webSocket = `failed (${firstLine(error)})`;
  }
  return result;
}

// Cypress listens on 127.0.0.1 and tells the browser its proxy is at http://localhost:<port>.
const proxyPort = await serve('proxy', '127.0.0.1');
const directPort = await serve('direct', undefined);
const results = [];
let failure = '';
let browserServer;

try {
  browserServer = await step(
    'launching WebKit',
    webkit.launchServer({ headless: true, proxy: { server: `http://localhost:${proxyPort}` } }),
  );
  const browser = await step('connecting to WebKit', webkit.connect(browserServer.wsEndpoint()));
  console.log(`WebKit ${browser.version()} on ${os.platform()} ${os.release()} ${os.arch()}`);
  const context = await step(
    'creating the browser context',
    browser.newContext({
      ignoreHTTPSErrors: true,
      deviceScaleFactor: 1,
      recordVideo: { dir: os.tmpdir(), size: { width: 1280, height: 720 } },
    }),
  );
  const page = await step('opening a page', context.newPage());
  for (const host of HOSTS) {
    results.push(await check(page, host, directPort));
  }
  await step('closing WebKit', browser.close());
} catch (error) {
  failure = firstLine(error);
} finally {
  await browserServer?.kill().catch(() => {});
}

const rows = results.map(
  ({ host, page, webSocket, secureContext }) => `| ${host} | ${page} | ${webSocket} | ${secureContext} |`,
);
const table = [
  '| Host | Page load reached | WebSocket reached | Secure context |',
  '| --- | --- | --- | --- |',
  ...rows,
].join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### WebKit proxy check\n\n${table}\n\n${failure}\n`);
}

const localhost = results.find(({ host }) => host === 'localhost');
if (failure) {
  console.log(`::error::The WebKit proxy check stopped: ${failure}`);
  process.exit(1);
}
if (localhost?.page !== 'proxy') {
  console.log(
    `::error::WebKit sent http://localhost ${localhost?.page === 'direct' ? 'straight to the server' : `nowhere: ${localhost?.page}`}, not through its proxy, so Cypress cannot attach to it.`,
  );
  process.exit(1);
}
if (localhost.webSocket !== 'proxy') {
  console.log(`::warning::A WebSocket to localhost did not go through WebKit's proxy: ${localhost.webSocket}.`);
}
console.log('WebKit sends http://localhost through its proxy.');
process.exit(0);
