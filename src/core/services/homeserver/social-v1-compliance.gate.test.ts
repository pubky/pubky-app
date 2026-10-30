// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Social v1 compliance ratchet (`docs/migrations/social-v1.md`): while `feat/social-v1` ports the app
 * from `pubky-app-specs` 0.8 to `pubky-social-specs` 1.x, no file outside the allow-lists below may
 * use the 0.x package, its URI builders, its hard-coded homeserver paths or the Nexus bookmark
 * fields. `LEGACY_RATCHET` is every file that matched when the gate landed: each child PR removes
 * the files it ports (a listed file that no longer matches fails the gate), and the cleanup PR
 * empties it. `PERMANENT` names the 0.x spellings that stay after the port, with the reason.
 */

const ROOT = join(__dirname, '../../../..');
const SRC = join(ROOT, 'src');
/** Test helpers and fixtures fake both epochs on purpose and ship in no build. */
const TEST_DIRECTORIES = new Set([join(SRC, 'test-utils'), join(SRC, 'test')]);

const PATTERNS = {
  /** The 0.x public tree as a path or URL fragment. */
  legacyTree: /\/pub\/pubky\.app\b/g,
  /** The 0.x namespace as a path fragment (`pubky.app/posts/`), not the web app's domain. */
  legacyNamespace: /(?<![:/\w.-])pubky\.app\//g,
  /** A regex spelling of either: `pubky\.app`. */
  legacyRegex: /pubky\\\.app/g,
  /** 0.x blob objects, replaced by content-addressed `files/{hash}.{ext}`. */
  blobs: /\bblobs\//g,
  /** 0.x URI builders (`postUriBuilder`, `userUriBuilder`, ...), replaced by `buildUri`. */
  uriBuilder: /\w+UriBuilder\b/g,
  /** 0.x wasm classes and enums (`PubkyAppPost`, `PubkyAppPostKind`, ...). */
  specsClass: /\bPubkyApp[A-Z]\w*/g,
  /** The 0.x builder singleton (`PubkySpecsSingleton`, `PubkySpecsBuilder`). */
  specsBuilder: /\bPubkySpecs\w*/g,
  /** Any import of the 0.x package, its limits JSON included. */
  specsImport: /from\s+['"]pubky-app-specs(?:\/[^'"]*)?['"]/g,
  /** The Nexus bookmark field on a post view: bookmarks are locally owned after the port. */
  nexusBookmark: /\.bookmark\b(?!\s*\()/g,
} as const;

type PatternName = keyof typeof PATTERNS;

/** 0.x spellings that outlive the port, per file, with the reason each stays. */
const PERMANENT: Record<string, { patterns: readonly PatternName[]; reason: string }> = {
  'src/config/auth.ts': {
    patterns: ['legacyTree'],
    reason:
      '`/pub/pubky.app/:rw` stays in the grant (`MIGRATION_CAPS`): deleting a migrated object reaches its 0.x copy',
  },
  'src/config/app-files.ts': {
    patterns: ['legacyTree'],
    reason: '`LEGACY_SETTINGS_PATH`: the 0.x settings, read while the v1 file is absent',
  },
  'src/core/pipes/lastRead/lastRead.normalizer.ts': {
    patterns: ['legacyTree'],
    reason: '`buildLegacyUrl`: the 0.x notification cursor, read while the v1 file is absent',
  },
  'src/libs/post/articleInlineMedia.ts': {
    patterns: ['legacyTree', 'blobs'],
    reason: 'the author check still accepts the 0.x File and blob URIs existing articles reference',
  },
  'src/core/application/profile/profile.ts': {
    patterns: ['legacyTree'],
    reason: 'account delete and export walk the 0.x tree beside the v1 trees',
  },
};

/**
 * Every file that matched when the gate landed (2026-10-30, 55 files; 36 after the posts, media,
 * articles, collections and Locks port). Each child PR of `feat/social-v1` deletes the entries
 * it ports; the cleanup PR empties the list.
 */
const LEGACY_RATCHET: readonly string[] = [
  'src/core/application/auth/auth.ts',
  'src/core/application/notification/notification.ts',
  'src/core/application/profile/profile.ts',
  'src/core/application/profile/profile.types.ts',
  'src/core/controllers/auth/auth.ts',
  'src/core/controllers/bookmark/bookmark.ts',
  'src/core/pipes/bookmark/bookmark.normalizer.ts',
  'src/core/pipes/lastRead/lastRead.normalizer.ts',
  'src/core/pipes/notification/notification.normalizer.ts',
  'src/core/pipes/pipes.builder.ts',
  'src/core/pipes/pipes.test-utils.ts',
  'src/core/pipes/settings/settings.normalizer.ts',
  'src/core/pipes/user/user.normalizer.ts',
  'src/core/services/local/profile/profile.ts',
  'src/core/services/local/stream/posts/posts.ts',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === 'node_modules' || TEST_DIRECTORIES.has(path) ? [] : sourceFiles(path);
    }
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

/** Blanks comments, keeping every offset: a path in a string literal counts, a mention in a comment does not. */
function withoutComments(source: string): string {
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
      out += source.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function matchingPatterns(code: string): PatternName[] {
  return (Object.keys(PATTERNS) as PatternName[]).filter((name) => new RegExp(PATTERNS[name].source).test(code));
}

describe('social v1 compliance gate', () => {
  const matches = new Map<string, PatternName[]>();
  for (const path of sourceFiles(SRC)) {
    const file = relative(ROOT, path);
    const allowed = PERMANENT[file]?.patterns ?? [];
    const found = matchingPatterns(withoutComments(readFileSync(path, 'utf8'))).filter(
      (name) => !allowed.includes(name),
    );
    if (found.length > 0) matches.set(file, found);
  }
  const describeMatch = (file: string) => `${file}: ${matches.get(file)!.join(', ')}`;

  it('lets no file outside the allow-lists use the 0.x package, its paths or the Nexus bookmark fields', () => {
    const offenders = [...matches.keys()].filter((file) => !LEGACY_RATCHET.includes(file)).sort();

    expect(offenders.map(describeMatch)).toEqual([]);
  });

  it('keeps the ratchet shrinking: a listed file that no longer matches leaves the list', () => {
    const stale = LEGACY_RATCHET.filter((file) => !matches.has(file));

    expect(stale).toEqual([]);
  });

  it('lists every file once, sorted, and names only files that exist', () => {
    expect(LEGACY_RATCHET).toEqual([...new Set(LEGACY_RATCHET)].sort());
    expect(Object.keys(PERMANENT).filter((file) => !existsSync(join(ROOT, file)))).toEqual([]);
    expect(LEGACY_RATCHET.filter((file) => file in PERMANENT && !matches.has(file))).toEqual([]);
  });
});
