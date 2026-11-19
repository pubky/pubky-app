// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Social v1 compliance gate (`docs/migrations/social-v1.md`): the app is ported from `pubky-app-specs`
 * 0.8 to `pubky-social-specs` 1.x, so no file outside the allow-lists below may use the 0.x package,
 * its URI builders, its hard-coded homeserver paths, the Nexus bookmark fields or the frozen Nexus `/v0`
 * API. `LEGACY_RATCHET` held every file that matched when the gate landed and shrank with each port until
 * the cleanup PR emptied it. `PERMANENT` names the 0.x spellings that stay after the port, with the reason.
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
  /** Any static or dynamic import of the 0.x package, its limits JSON included. */
  specsImport: /(?:from\s+|import\s*\(\s*)['"]pubky-app-specs(?:\/[^'"]*)?['"]/g,
  /** The Nexus bookmark field on a post view: bookmarks are locally owned after the port. */
  nexusBookmark: /\.bookmark\b(?!\s*\()/g,
  /**
   * The frozen Nexus API version, as a path segment (`v0/stream`) or a version literal (`'v0'`): every call
   * is built under `NEXUS_API_VERSION` (`/v1`), and the one `/v0` call names its version where it is made.
   */
  nexusV0: /(?<![\w.])v0(?![\w.])/g,
} as const;

type PatternName = keyof typeof PATTERNS;

/** 0.x spellings that outlive the port, per file, with the reason each stays. */
const PERMANENT: Record<string, { patterns: readonly PatternName[]; reason: string }> = {
  'src/config/auth.ts': {
    patterns: ['legacyTree', 'nexusV0'],
    reason:
      '`/pub/pubky.app/:rw` stays in the grant (`MIGRATION_CAPS`): deleting a migrated object reaches its 0.x copy; ' +
      "`/pub/chat/v0/:rw` and `/priv/chat/v0/:rw` are the chat app's homeserver scopes, not a Nexus API version",
  },
  'src/config/nexus.ts': {
    patterns: ['nexusV0'],
    reason: '`NexusApiVersion` names the frozen `v0` beside `NEXUS_API_VERSION`, so the one legacy call can ask for it',
  },
  'src/core/services/nexus/file/file.api.ts': {
    patterns: ['nexusV0'],
    reason:
      '`POST v0/files/by_ids` stays: the file details of 0.x attachments, which `/v1` does not serve; sunset when `/v0` ' +
      'gets a removal date or every author has migrated (ADR-0027)',
  },
  'src/config/app-files.ts': {
    patterns: ['legacyTree'],
    reason:
      '`LEGACY_SETTINGS_PATH` and `LEGACY_LAST_READ_PATH`: the 0.x settings and notification cursor, read while ' +
      'the v1 file is absent',
  },
  'src/libs/post/articleInlineMedia.ts': {
    patterns: ['legacyTree', 'blobs'],
    reason: 'the author check still accepts the 0.x File and blob URIs existing articles reference',
  },
};

/**
 * Files still on the 0.x model while `feat/social-v1` ported the app (55 when the gate landed on
 * 2026-10-30; 36 after the posts, media, articles, collections and Locks port; 3 after the bookmarks
 * port). Empty since the cleanup PR: a new match is ported, never listed.
 */
const LEGACY_RATCHET: readonly string[] = [];

/**
 * No session on an event stream, anywhere, so no allow-list. In `@synonymdev/pubky` 0.16.2 and 0.17.1 a
 * session-bound request holds the shared session Web Lock until its response headers reach the SDK, with no
 * timeout. Behind anything that buffers event streams until the body completes (the Cypress proxy does; an
 * intermediary in the wild could) the headers never arrive, so the SDK's exclusive bearer refresh after any 401
 * waits forever and every session request queues behind it: writes hang with no toast and no rollback
 * (pubky/pubky-homeserver#798, closed as not a deadlock; ADR-0014). Private directories are polled instead. Lift
 * this once the SDK bounds that lease or the team accepts the exposure.
 */
const EVENT_STREAM_BUILDER = /\beventStreamFor(?:User)?\s*\(/;
/** A method call on a builder, with up to one level of nested parentheses in its arguments. */
const CALL_ARGUMENTS = String.raw`\((?:[^()]|\([^()]*\))*\)`;
const CHAINED_CALLS = String.raw`(?:\s*\??\.\s*\w+\s*${CALL_ARGUMENTS})*`;
const DOT_SESSION = String.raw`\s*\??\.\s*session\s*\(`;

/** Whether `code` chains `.session(` onto an event stream builder, directly or through variables holding one. */
function bindsSessionToEventStream(code: string): boolean {
  const direct = new RegExp(`${EVENT_STREAM_BUILDER.source}(?:[^()]|\\([^()]*\\))*\\)${CHAINED_CALLS}${DOT_SESSION}`);
  if (direct.test(code)) return true;

  const holders = new Set<string>();
  // The optional part is a type annotation; it stops at the punctuation of a signature so `f(a: string) { const b =` names `b`.
  const assignment = (source: string) =>
    new RegExp(String.raw`(\w+)\s*(?::[^;(){}=]*)?=\s*(?:await\s+)?${source}`, 'g');
  for (const [, name] of code.matchAll(assignment(String.raw`(?:[\w.]+\.)?${EVENT_STREAM_BUILDER.source}`))) {
    holders.add(name);
  }
  // `const a = sdk.eventStreamForUser(...); const b = a.path(...);` hands the builder on.
  for (let size = -1; size !== holders.size;) {
    size = holders.size;
    for (const holder of [...holders]) {
      for (const [, name] of code.matchAll(assignment(String.raw`${holder}\b`))) holders.add(name);
    }
  }
  return [...holders].some((holder) => new RegExp(String.raw`\b${holder}${CHAINED_CALLS}${DOT_SESSION}`).test(code));
}

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

  it('lets no file hold a session-bound event stream open', () => {
    const offenders = sourceFiles(SRC)
      .filter((path) => bindsSessionToEventStream(withoutComments(readFileSync(path, 'utf8'))))
      .map((path) => relative(ROOT, path));

    expect(offenders).toEqual([]);
  });

  describe('session-bound event stream detection', () => {
    it.each([
      ['a direct chain', 'sdk.eventStreamForUser(pk, cursor).session(session).live().subscribe();'],
      [
        'a chain across lines',
        'pubky\n  .eventStreamForUser(PublicKey.from(z32), null)\n  .session(session)\n  .live();',
      ],
      ['a chain with calls in between', "sdk.eventStreamForUser(pk, null).path('/priv/x/').live().session(session);"],
      ['the other builder entry point', 'sdk.eventStreamFor(homeserver).session(session);'],
      [
        'the builder held in a variable',
        'let builder = sdk.eventStreamForUser(pk, null);\nbuilder = builder.session(s);',
      ],
      ['a variable with calls in between', "const b = sdk.eventStreamForUser(pk);\nb.path('/priv/').session(s);"],
      [
        'a builder handed to a second variable',
        'const a = sdk.eventStreamForUser(pk);\nconst b = a.live();\nb.session(s);',
      ],
      ['optional chaining', 'sdk.eventStreamForUser(pk)?.session(s);'],
      [
        'a typed variable',
        'const b: ReturnType<typeof sdk.eventStreamForUser> = sdk.eventStreamForUser(pk, null);\nb.session(s);',
      ],
      ['a typed nullable variable', 'let b: EventStreamBuilder | null = sdk.eventStreamForUser(pk);\nb.session(s);'],
      ['a typed second variable', 'const a = sdk.eventStreamForUser(pk);\nconst b: Builder = a.live();\nb.session(s);'],
      [
        'a variable after a typed signature',
        'function open(pk: PublicKey) {\n  const b = sdk.eventStreamForUser(pk);\n  return b.session(s);\n}',
      ],
    ])('flags %s', (_name, code) => {
      expect(bindsSessionToEventStream(code)).toBe(true);
    });

    it.each([
      ['a public stream', "sdk.eventStreamForUser(pk, null).path('/pub/x/').live().subscribe();"],
      ['a public stream in a variable', 'const b = sdk.eventStreamForUser(pk);\nb.live().subscribe();'],
      ['a session call on something else', 'const b = sdk.eventStreamForUser(pk);\nb.live();\nother.session(s);'],
      ['a session call with no stream in the file', 'signer.session(s);'],
    ])('ignores %s', (_name, code) => {
      expect(bindsSessionToEventStream(code)).toBe(false);
    });
  });

  it('lets no file outside the allow-lists use the 0.x package, its paths, the Nexus bookmark fields or the Nexus /v0 API', () => {
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
