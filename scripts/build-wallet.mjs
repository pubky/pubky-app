import { appendFile, copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const output = new URL('public/wallet-engine/', root);
const resolveEngine = createRequire(import.meta.resolve('@beignet/portable-engine'));
await mkdir(output, { recursive: true });
await copyFile(resolveEngine.resolve('sql.js/dist/sql-wasm.wasm'), new URL('sql-wasm.wasm', output));
await build({
  entryPoints: [fileURLToPath(new URL('src/core/services/wallet/worker.mjs', root))],
  outfile: fileURLToPath(new URL('worker.js', output)),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  // sql.js has a Node-only branch for these modules. Browser workers use WebAssembly and fetch.
  external: ['fs', 'path', 'crypto'],
  minify: true,
  legalComments: 'linked',
});

// Preserve the license notices with the distributed engine, client and SQLite assets.
for (const pkg of ['@beignet/portable-engine', '@beignet/wallet-core', 'sql.js']) {
  const location =
    pkg === 'sql.js' ? resolveEngine.resolve('sql.js/LICENSE') : new URL('../LICENSE', import.meta.resolve(pkg));
  const notice = await readFile(location, 'utf8');
  await appendFile(new URL('worker.js.LEGAL.txt', output), '\n' + pkg + '\n\n' + notice);
}
