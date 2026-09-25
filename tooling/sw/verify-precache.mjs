// Verifies the generated service worker against the build and a running production server (CI: build.yml).
// - Completeness: every `_next/static` file outside STATIC_GLOB_IGNORES and every allow-listed public file
//   is precached. @serwist/build only warns when it drops a file (over maximumFileSizeToCacheInBytes, or an
//   unreadable file), so without this a worker could ship without part of the shell.
// - Served as built: every precache entry is a real build or public file that the server returns as-is.
//   A missing file would either fail the all-or-nothing install or, because unknown paths fall through to
//   an HTML page with status 200, be precached as that page.
// Usage: node tooling/sw/verify-precache.mjs http://localhost:3000
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { PUBLIC_PRECACHE_FILES, STATIC_GLOB_IGNORES } from './precache.mjs';

// src/sw.ts serves failed navigations from this precache entry.
const OFFLINE_FALLBACK_URL = '/offline.html';
const STATIC_DIR = '.next/static';
const STATIC_PREFIX = '/_next/static/';
const CONCURRENCY = 16;

const origin = process.argv[2];
if (!origin) throw new Error('Usage: node tooling/sw/verify-precache.mjs <origin>');

// @serwist/build injects the manifest as an object literal that esbuild minifies to `{revision:…,url:"…"}`.
const source = readFileSync('public/sw.js', 'utf8');
const urls = [...new Set(Array.from(source.matchAll(/\burl:"([^"]+)"/g), ([, url]) => url))];
if (urls.length === 0) throw new Error('No precache entries found in public/sw.js');
if (!urls.includes(OFFLINE_FALLBACK_URL)) throw new Error(`${OFFLINE_FALLBACK_URL} is not precached`);

const failures = [];
const precached = new Set(urls);
const expected = [
  ...readdirSync(STATIC_DIR, { recursive: true })
    .filter((file) => statSync(join(STATIC_DIR, file)).isFile())
    .filter((file) => !STATIC_GLOB_IGNORES.some((pattern) => matchesGlob(file, pattern)))
    .map((file) => `${STATIC_PREFIX}${file.split('\\').join('/')}`),
  ...PUBLIC_PRECACHE_FILES.map((file) => `/${file}`),
];
for (const url of expected) {
  if (!precached.has(url)) failures.push(`not precached: ${url}`);
}

const localFile = (url) => {
  const path = decodeURIComponent(url);
  return path.startsWith(STATIC_PREFIX) ? join(STATIC_DIR, path.slice(STATIC_PREFIX.length)) : join('public', path);
};

let nextIndex = 0;
async function checkRemaining() {
  while (nextIndex < urls.length) {
    const url = urls[nextIndex++];
    const file = localFile(url);
    if (!existsSync(file)) {
      failures.push(`missing build file ${file} for ${url}`);
      continue;
    }
    try {
      const response = await fetch(new URL(url, origin), {
        method: 'HEAD',
        headers: { 'accept-encoding': 'identity' },
      });
      const length = Number(response.headers.get('content-length'));
      if (!response.ok) failures.push(`${response.status} ${url}`);
      else if (length !== statSync(file).size) failures.push(`served ${length} bytes instead of ${file} for ${url}`);
    } catch (error) {
      failures.push(`${error instanceof Error ? error.message : String(error)} ${url}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, checkRemaining));

if (failures.length > 0) {
  console.error(`Service worker precache check failed (${urls.length} entries):\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`All ${urls.length} precache entries match the build and are served as built.`);
