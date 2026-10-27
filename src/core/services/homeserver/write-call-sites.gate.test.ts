// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const SRC = join(ROOT, 'src');
const HOMESERVER_SERVICE = 'src/core/services/homeserver/homeserver.ts';

const SDK_STORAGE_WRITE = /\bstorage\.(?:putJson|putBytes|putText|delete)\w*\s*\(/g;
const RETRY_CALL = /\bretryHomeserverWrite\s*\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

/** Blanks comments and string contents, keeping every offset, so only code is matched and only code parens count. */
function codeOnly(source: string): string {
  let out = '';
  let i = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && (next === '/' || next === '*')) {
      const terminator = next === '/' ? '\n' : '*/';
      const end = source.indexOf(terminator, i + 2);
      const stop = end === -1 ? source.length : next === '/' ? end : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === '\\' ? 2 : 1;
      out += ch + blank(source.slice(i + 1, j)) + (j < source.length ? ch : '');
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function closingParen(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth += 1;
    if (code[i] === ')' && --depth === 0) return i;
  }
  return code.length;
}

/** `[open, close]` of each call's argument list. */
function callSpans(code: string, call: RegExp): Array<[number, number]> {
  return [...code.matchAll(call)].map((match) => {
    const open = match.index + match[0].length - 1;
    return [open, closingParen(code, open)];
  });
}

function lineOf(code: string, index: number): number {
  return code.slice(0, index).split('\n').length;
}

describe('homeserver write call sites', () => {
  const files = sourceFiles(SRC).map((path) => ({
    path: relative(ROOT, path),
    code: codeOnly(readFileSync(path, 'utf8')),
  }));
  const service = files.find(({ path }) => path === HOMESERVER_SERVICE)!;

  it('writes to homeserver storage only through HomeserverService', () => {
    const offenders = files
      .filter(({ path }) => path !== HOMESERVER_SERVICE)
      .flatMap(({ path, code }) =>
        [
          ...code.matchAll(SDK_STORAGE_WRITE),
          ...code.matchAll(/\.client\.fetch\s*\(/g),
          ...code.matchAll(/\bPubky\.(?:withClient|testnet)\s*\(|\bnew Pubky\s*\(/g),
        ].map((match) => `${path}:${lineOf(code, match.index)}`),
      );

    expect(offenders).toEqual([]);
  });

  it('runs every HomeserverService storage write inside retryHomeserverWrite', () => {
    const retrySpans = callSpans(service.code, RETRY_CALL);
    const inRetry = (index: number) => retrySpans.some(([open, close]) => open < index && index < close);
    const writes = [
      ...[...service.code.matchAll(SDK_STORAGE_WRITE)].map((match) => match.index),
      // A raw fetch that sends a body is a write (a PUT to a non-owned HTTP URL).
      ...callSpans(service.code, /\bthis\.fetch\s*\(/g)
        .filter(([open, close]) => /\bbody\b/.test(service.code.slice(open, close)))
        .map(([open]) => open),
    ];

    // Owned putJson, delete and putBytes, and the two raw fetches with a body. Guards the scan itself.
    expect(writes.length).toBeGreaterThanOrEqual(5);
    expect(
      writes.filter((index) => !inRetry(index)).map((index) => `${HOMESERVER_SERVICE}:${lineOf(service.code, index)}`),
    ).toEqual([]);
  });

  it('fences every write in a file that re-reads before retrying', () => {
    // A write here is built from a read unless listed: its retry must run the read again
    // (retryHomeserverWriteAfterReread), so it passes the fence, which also makes it one attempt.
    const unfenced: Record<string, string> = {
      'ProfileApplication.commitCreate': 'the first profile.json, built from the form, not a read',
      'ProfileApplication.deleteFile': 'account deletion: a DELETE has no body to go stale',
      'LocksApplication.replicateUnlockedContent': 'the replica bytes are fixed by the unlocked content',
    };
    const offenders = files
      .filter(({ path, code }) => path !== HOMESERVER_SERVICE && /\bretryHomeserverWriteAfterReread\s*\(/.test(code))
      .flatMap(({ path, code }) => {
        const owner = /\bexport\s+class\s+(\w+)/.exec(code)?.[1];
        return callSpans(code, /\bHomeserverService\.(?:request|putBlob|delete|deleteIdempotent)\s*\(/g)
          .filter(([open, close]) => {
            const args = code.slice(open, close);
            if (/HttpMethod\.GET\b/.test(args) || /\bfence\b/.test(args)) return false;
            const method = [...code.slice(0, open).matchAll(/\bstatic\s+(?:async\s+)?(\w+)\s*[<(]/g)].pop()?.[1];
            return !(`${owner}.${method}` in unfenced);
          })
          .map(([open]) => `${path}:${lineOf(code, open)}`);
      });

    expect(offenders).toEqual([]);
  });

  it('sends no other SDK write from HomeserverService outside the retry policy', () => {
    // The only raw SDK DELETE is the legacy cookie revocation, `DELETE /session`: not storage,
    // so the homeserver's publish conflict cannot come from it.
    const rawWrites = callSpans(service.code, /\.client\.fetch\s*\(/g)
      .filter(([open, close]) =>
        /HttpMethod\.(?:PUT|DELETE|POST|PATCH)\b|\bbody\b/.test(service.code.slice(open, close)),
      )
      .map(([open]) => {
        const method = [...service.code.slice(0, open).matchAll(/\bstatic\s+(?:async\s+)?(\w+)\s*[<(]/g)].pop()?.[1];
        return method;
      });

    expect(rawWrites).toEqual(['logoutLegacyCookie']);
  });
});
