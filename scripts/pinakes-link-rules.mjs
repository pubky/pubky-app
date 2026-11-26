#!/usr/bin/env node
/**
 * Regenerates `src/libs/post/linkRules.data.json` from Pinakes' published link rules
 * (`data/spellings.json` in pubky/pinakes): the tracking parameters (`tracking`), the identifier
 * pages (`pages`) and, as test data, the vectors of the tracking rule. Run it when Pinakes publishes
 * a new `spelling_rules` version:
 *
 *   node scripts/pinakes-link-rules.mjs <commit of pubky/pinakes> <its spelling_rules>
 *
 * It reads the file at that commit, refuses it unless its BLAKE3 hash (the first 16 hex characters,
 * as Pinakes' `/v1/info` `spelling_rules`) is the version given, and writes the module with that
 * version. The app's tests then check the rules in `linkRules.ts` against the new entries.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const OUT = new URL('../src/libs/post/linkRules.data.json', import.meta.url);

// BLAKE3 (default hash, 32-byte output), enough for one file.
const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const PERM = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];
const [CHUNK_START, CHUNK_END, PARENT, ROOT] = [1, 2, 4, 8];
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

function compress(cv, block, counter, blockLength, flags) {
  let m = Array.from({ length: 16 }, (_, i) => block.readUInt32LE(4 * i));
  const s = [...cv, ...IV.slice(0, 4), counter >>> 0, Math.floor(counter / 2 ** 32) >>> 0, blockLength, flags];
  const g = (a, b, c, d, x, y) => {
    s[a] = (s[a] + s[b] + x) >>> 0;
    s[d] = rotr(s[d] ^ s[a], 16);
    s[c] = (s[c] + s[d]) >>> 0;
    s[b] = rotr(s[b] ^ s[c], 12);
    s[a] = (s[a] + s[b] + y) >>> 0;
    s[d] = rotr(s[d] ^ s[a], 8);
    s[c] = (s[c] + s[d]) >>> 0;
    s[b] = rotr(s[b] ^ s[c], 7);
  };
  for (let round = 0; round < 7; round++) {
    g(0, 4, 8, 12, m[0], m[1]);
    g(1, 5, 9, 13, m[2], m[3]);
    g(2, 6, 10, 14, m[4], m[5]);
    g(3, 7, 11, 15, m[6], m[7]);
    g(0, 5, 10, 15, m[8], m[9]);
    g(1, 6, 11, 12, m[10], m[11]);
    g(2, 7, 8, 13, m[12], m[13]);
    g(3, 4, 9, 14, m[14], m[15]);
    if (round < 6) m = PERM.map((p) => m[p]);
  }
  return [
    ...Array.from({ length: 8 }, (_, i) => (s[i] ^ s[i + 8]) >>> 0),
    ...Array.from({ length: 8 }, (_, i) => (s[i + 8] ^ cv[i]) >>> 0),
  ];
}

const words = (list) =>
  Buffer.concat(
    list.map((w) => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(w);
      return b;
    }),
  );
const padded = (b) => Buffer.concat([b, Buffer.alloc(64 - b.length)]);

/** One chunk up to its last block: the chaining value, that block, its length, flags, counter. */
function chunkOutput(data, counter) {
  let cv = IV;
  const blocks = [];
  for (let i = 0; i < Math.max(data.length, 1); i += 64) blocks.push(data.subarray(i, i + 64));
  for (let i = 0; ; i++) {
    const flags = i === 0 ? CHUNK_START : 0;
    if (i === blocks.length - 1) return [cv, padded(blocks[i]), blocks[i].length, flags | CHUNK_END, counter];
    cv = compress(cv, blocks[i], counter, 64, flags).slice(0, 8);
  }
}

function blake3(data) {
  const chunks = [];
  for (let i = 0; i < data.length; i += 1024) chunks.push(data.subarray(i, i + 1024));
  if (chunks.length === 0) chunks.push(Buffer.alloc(0));
  const stack = [];
  let out;
  for (let n = 0; n < chunks.length; n++) {
    out = chunkOutput(chunks[n], n);
    if (n === chunks.length - 1) break;
    let cv = compress(out[0], out[1], out[4], out[2], out[3]).slice(0, 8);
    for (let total = n + 1; (total & 1) === 0; total >>= 1) {
      cv = compress(IV, words([...stack.pop(), ...cv]), 0, 64, PARENT).slice(0, 8);
    }
    stack.push(cv);
  }
  let [cv0, block, blockLength, flags, counter] = out;
  while (stack.length > 0) {
    const cv = compress(cv0, block, counter, blockLength, flags).slice(0, 8);
    [cv0, block, blockLength, flags, counter] = [IV, words([...stack.pop(), ...cv]), 64, PARENT, 0];
  }
  return words(compress(cv0, block, counter, blockLength, flags | ROOT).slice(0, 8));
}

if (blake3(Buffer.alloc(0)).toString('hex') !== 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262') {
  throw new Error('BLAKE3 self-check failed');
}

const [commit, expected] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/.test(commit ?? '') || !/^[0-9a-f]{16}$/.test(expected ?? '')) {
  console.error('usage: node scripts/pinakes-link-rules.mjs <pubky/pinakes commit, 40 hex> <spelling_rules, 16 hex>');
  process.exit(2);
}
const response = await fetch(`https://raw.githubusercontent.com/pubky/pinakes/${commit}/data/spellings.json`);
if (!response.ok) throw new Error(`data/spellings.json at ${commit}: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const version = blake3(bytes).toString('hex').slice(0, 16);
if (version !== expected) throw new Error(`data/spellings.json at ${commit} is version ${version}, not ${expected}`);

const file = JSON.parse(bytes.toString('utf8'));
const data = {
  tracking: file.tracking,
  pages: file.pages,
  tracking_vectors: file.vectors.filter((v) => v.rule === 'tracking').map(({ link, root }) => ({ link, root })),
};
const generated = {
  about: `Generated by scripts/pinakes-link-rules.mjs from pubky/pinakes ${commit} data/spellings.json; do not edit. sha256 is the hash of JSON.stringify of tracking, pages and tracking_vectors.`,
  spelling_rules: version,
  source: commit,
  sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
  ...data,
};
writeFileSync(OUT, `${JSON.stringify(generated, null, 2)}\n`);
console.log(
  `wrote ${OUT.pathname}: spelling_rules ${version}, ${data.tracking.length} tracking parameters, ${data.pages.length} pages`,
);
