#!/usr/bin/env node
// Serves the Pubky App offline bundle on http://127.0.0.1:<port>. Usage: node serve.mjs [--port N] [--no-browser]
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const APP = join(ROOT, 'app');
const ROUTES = JSON.parse(readFileSync(join(ROOT, 'routes.json'), 'utf8'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  // React Server Component payloads; the client router accepts them as text/plain.
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const escape = (route) => route.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
// `*` is one path segment; it stops at a dot so `/post/a/b.txt` keeps its `.txt`.
const DYNAMIC = ROUTES.dynamic.map((route) => [
  new RegExp(`^${escape(route).replaceAll('*', '([^/.]+)')}(?=$|[/.])`),
  route.replaceAll('*', ROUTES.placeholder),
]);
const REDIRECTS = ROUTES.redirects.map(([source, target]) => [
  new RegExp(`^${escape(source).replaceAll('*', '([^/]+)')}$`),
  target,
]);

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function findFile(path) {
  const base = normalize(join(APP, path));
  if (base !== APP && !base.startsWith(APP + sep)) return null;
  return [base, `${base}.html`, join(base, 'index.html')].find(isFile) ?? null;
}

function resolve(path) {
  if (ROUTES.notFound.some((prefix) => path.startsWith(prefix))) return [404, null];
  for (const [regex, target] of REDIRECTS) {
    const match = regex.exec(path);
    if (match) return [308, match.slice(1).reduce((result, value) => result.replace('*', value), target)];
  }
  const found = findFile(path);
  if (found) return [200, found];
  // Every id of a dynamic route is served the one page the export holds for it, and so are its
  // payload files (`/post/a/b.txt`, `/post/a/b/__next...txt`); the app reads the ids from the URL.
  for (const [regex, replacement] of DYNAMIC) {
    if (regex.test(path)) {
      const rewritten = findFile(path.replace(regex, replacement));
      if (rewritten) return [200, rewritten];
    }
  }
  return [404, null];
}

function handle(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  let path;
  try {
    path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const [status, target] = resolve(path);
  if (status === 308) {
    response.writeHead(308, { Location: target, 'Content-Length': 0 }).end();
    return;
  }
  const file = status === 404 ? findFile('/404') : target;
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  const data = readFileSync(file);
  const immutable = status === 200 && path.startsWith('/_next/static/');
  response.writeHead(status, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  response.end(request.method === 'HEAD' ? undefined : data);
}

function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref();
}

const args = process.argv.slice(2);
const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : ROUTES.port;
const url = `http://127.0.0.1:${port}/`;
const server = createServer(handle);
server.on('error', () => {
  // Another port is another origin, which would hide the session and the local index.
  console.error(`Port ${port} is busy. Close the program using it (or another copy of Pubky App) and try again.`);
  process.exit(1);
});
server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
  console.log(`Pubky App is running at ${url}  (press Ctrl+C to stop)`);
  if (!args.includes('--no-browser')) openBrowser(url);
});
