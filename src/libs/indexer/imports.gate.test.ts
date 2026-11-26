// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The indexer stays a standalone library so it can move out of the app, run in a worker and be tested
 * without the app's setup: no app aliases, no relative path out of this folder, no SDK. The app reaches
 * the network and storage through the injected transport instead.
 */

const ROOT = join(__dirname, '../../..');
const INDEXER = __dirname;
/** The older social tree: optional, so nothing else in the library may depend on it. */
const LEGACY = join(INDEXER, 'social', 'legacy');

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g;
const SDK = /^@synonymdev\/pubky(?:\/|$)/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry) ? [path] : [];
  });
}

/** Blanks comments, keeping strings, so a specifier mentioned in a comment does not count. */
function withoutComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && (next === '/' || next === '*')) {
      const terminator = next === '/' ? '\n' : '*/';
      const end = source.indexOf(terminator, i + 2);
      const stop = end === -1 ? source.length : next === '/' ? end : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  return [...withoutComments(source).matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);
}

/** Why `specifier`, imported from `file`, breaks the library's isolation, or `null` when it does not. */
function forbiddenImport(file: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return 'app alias';
  if (SDK.test(specifier)) return 'SDK';
  if (specifier.startsWith('.')) {
    const target = relative(INDEXER, resolve(dirname(file), specifier));
    if (target.startsWith('..') || isAbsolute(target)) return 'leaves the indexer folder';
  }
  return null;
}

const ALLOWED = ['./run', './nested/thing', '../indexer/run', 'vitest', 'node:fs', '@synonymdev/pubkyx'];

describe('indexer import isolation', () => {
  const files = sourceFiles(INDEXER);

  it('scans the library', () => {
    const names = files.map((file) => relative(INDEXER, file));

    expect(names).toEqual(expect.arrayContaining(['merge.ts', 'run.ts', 'imports.gate.test.ts']));
  });

  it('imports nothing from the app, from outside the folder or from the SDK', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        const reason = forbiddenImport(file, specifier);
        if (reason !== null) offenders.push(`${relative(ROOT, file)}: ${specifier} (${reason})`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('lets no file outside the older tree folder import it', () => {
    const inside = (path: string) => path === LEGACY || path.startsWith(`${LEGACY}${sep}`);
    const offenders: string[] = [];
    for (const file of files) {
      if (inside(file)) continue;
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (specifier.startsWith('.') && inside(resolve(dirname(file), specifier))) {
          offenders.push(`${relative(ROOT, file)}: ${specifier}`);
        }
      }
    }

    expect(files.some(inside)).toBe(true);
    expect(offenders).toEqual([]);
  });

  it('finds static, type, side-effect, re-export and dynamic imports, and skips comments', () => {
    const source = [
      "import { a } from './a';",
      "import type { B } from './b';",
      "import './c';",
      "export * from './d';",
      "const e = await import('./e');",
      "// import { f } from './f';",
    ].join('\n');

    expect(importSpecifiers(source)).toEqual(['./a', './b', './c', './d', './e']);
  });

  it.each([
    ['@/libs/error/error.factories', 'app alias'],
    ['@synonymdev/pubky', 'SDK'],
    ['@synonymdev/pubky/dist/index', 'SDK'],
    ['../error/error', 'leaves the indexer folder'],
    ['./../../config/app', 'leaves the indexer folder'],
  ])('rejects %j', (specifier, reason) => {
    expect(forbiddenImport(join(INDEXER, 'merge.ts'), specifier)).toBe(reason);
  });

  it.each(ALLOWED)('allows %j', (specifier) => {
    expect(forbiddenImport(join(INDEXER, 'merge.ts'), specifier)).toBeNull();
  });
});
