import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterAll, beforeAll, test } from 'vitest';

const repo = process.cwd();
const config = JSON.parse(readFileSync(join(repo, '.oxlintrc.json'), 'utf8'));
const root = mkdtempSync(join(tmpdir(), 'pubky-oxlint-test-'));
type RuleConfig = string | [string, ...unknown[]];
interface Fixture {
  name: string;
  code: string;
  errors: number;
  path: string;
}
interface Diagnostic {
  filename: string;
  message: string;
  labels: { span: { line: number } }[];
}

const rules = new Set(['pubky/no-restricted-syntax', 'no-restricted-imports']);
// Use the real selectors, file overrides and exclusions; isolate unrelated lint rules.
const pickRules = (entries: Record<string, RuleConfig> = {}) =>
  Object.fromEntries(Object.entries(entries).filter(([name]) => rules.has(name)));
const actual = new Map<string, Diagnostic[]>();

const cases: Fixture[] = [];

function add(name: string, code: string, errors: number, path = `src/cases/${name}.ts`) {
  cases.push({ name, code, errors, path });
}

add('env-wrapper-blocked', 'const x = Env.NEXT_PUBLIC_NEXUS_URL;', 1);
add('public-process-blocked', 'const x = process.env.NEXT_PUBLIC_NEXUS_URL;', 1);
add('runtime-process-blocked', 'const x = process.env.PUBKY_RUNTIME_NEXUS_URL;', 1);
add('runtime-write-blocked', 'process.env.PUBKY_RUNTIME_NEXUS_URL = "test";', 1);
add(
  'multiple-violations',
  'const a = Env.NEXT_PUBLIC_X;\nconst b = process.env.NEXT_PUBLIC_X;\nconst c = process.env.PUBKY_RUNTIME_X;',
  3,
);
add(
  'tsx-environment-read',
  'export const View = () => <div>{process.env.PUBKY_RUNTIME_X}</div>;',
  1,
  'src/components/View.tsx',
);
add(
  'javascript-environment-read',
  'const x = process.env.PUBKY_RUNTIME_X;',
  1,
  'src/cases/javascript-environment-read.js',
);
add('computed-env-object', 'const x = process["env"].PUBKY_RUNTIME_X;', 0);
add('computed-env-key', 'const x = process.env["PUBKY_RUNTIME_X"];', 0);
add('unrelated-object', 'const x = other.PUBKY_RUNTIME_X;', 0);
add('node-env-allowed', 'const x = process.env.NODE_ENV;', 0);
add('ordinary-string-allowed', 'const x = "process.env.PUBKY_RUNTIME_X";', 0);
add('getter-allowed', 'const x = getRuntimeConfig().nexusUrl;', 0);
for (const key of ['DB_NAME', 'DB_VERSION', 'DEBUG_MODE', 'APP_VERSION']) {
  add(`whitelist-${key}`, `const a = Env.NEXT_PUBLIC_${key}; const b = process.env.NEXT_PUBLIC_${key};`, 0);
}
add('whitelist-prefix-is-blocked', 'const x = process.env.NEXT_PUBLIC_DB_NAME_EXTRA;', 1);
add('resolver-exempt', 'const x = process.env.PUBKY_RUNTIME_X;', 0, 'src/libs/runtime-config/resolver.ts');
add(
  'nested-resolver-exempt',
  'const x = process.env.PUBKY_RUNTIME_X;',
  0,
  'src/libs/runtime-config/nested/resolver.ts',
);
add('test-setup-exempt', 'process.env.PUBKY_RUNTIME_X = "test";', 0, 'src/config/test.ts');
add(
  'similar-directory-not-exempt',
  'const x = process.env.PUBKY_RUNTIME_X;',
  1,
  'src/libs/runtime-config-other/resolver.ts',
);
add('ordinary-config-not-exempt', 'const x = process.env.PUBKY_RUNTIME_X;', 1, 'src/config/other.ts');
add('any-cast', 'const x = value as any;', 1, 'src/cases/any-cast.test.ts');
add('double-cast', 'const x = value as unknown as Thing;', 1, 'src/cases/double-cast.test.ts');
add('parenthesized-cast', 'const x = ((value as unknown) as Thing);', 1, 'src/cases/parenthesized-cast.test.ts');
add('both-casts', 'const a = value as any;\nconst b = value as unknown as Thing;', 2, 'src/cases/both-casts.test.ts');
add('tsx-cast', 'const node = <div>{value as any}</div>;', 1, 'src/cases/tsx-cast.test.tsx');
add('safe-cast', 'const x = value as Thing;', 0, 'src/cases/safe-cast.test.ts');
add('single-unknown', 'const x = value as unknown;', 0, 'src/cases/single-unknown.test.ts');
add('const-assertion', 'const x = { a: 1 } as const;', 0, 'src/cases/const-assertion.test.ts');
add('helper-call', 'const x = asOpaque<Thing>(value);', 0, 'src/cases/helper-call.test.ts');
add('satisfies-expression', 'const x = value satisfies Thing;', 0, 'src/cases/satisfies-expression.test.ts');
add('non-test-double-cast', 'const x = value as unknown as Thing;', 0);
add('test-helper-exempt', 'const x = value as unknown as Thing;', 0, 'src/test-utils/helper.test.ts');
add('nested-test-helper-exempt', 'const x = value as any;', 0, 'src/test-utils/nested/helper.test.tsx');
add('similar-helper-directory-not-exempt', 'const x = value as any;', 1, 'src/test-utils-other/helper.test.ts');
// Preserve the existing override order: test restrictions replace the environment selectors.
add('existing-test-env-override', 'const x = process.env.PUBKY_RUNTIME_X;', 0, 'src/cases/environment.test.ts');
add('nested-test-in-resolver', 'const x = value as any;', 1, 'src/libs/runtime-config/resolver.test.ts');
add('unicode-position', 'const label = "😀"; const x = process.env.PUBKY_RUNTIME_X;', 1);
add(
  'jsx-whitespace',
  'export const View = () => (\n  <div>{Env.NEXT_PUBLIC_X}</div>\n);',
  1,
  'src/cases/jsx-whitespace.tsx',
);
// Suppression directives need the migrated plugin-qualified rule name in Oxlint.
add(
  'line-suppression',
  '// oxlint-disable-next-line pubky/no-restricted-syntax -- fixture\nconst x = process.env.PUBKY_RUNTIME_X;',
  0,
);
add(
  'block-suppression',
  '/* oxlint-disable pubky/no-restricted-syntax -- fixture */\nconst x = process.env.PUBKY_RUNTIME_X;\n/* oxlint-enable pubky/no-restricted-syntax */\nconst y = process.env.PUBKY_RUNTIME_Y;',
  1,
);

add('toast-store-blocked', "import { x } from '@/molecules/Toaster/toast.store';", 1);
add('toast-state-blocked', "import { x } from '@/molecules/Toaster/useToastState';", 1);
add('toast-atom-blocked', "import { x } from '@/atoms/Toast/Toast';", 1);
add('nested-toast-atom-blocked', "import { x } from '@/atoms/Toast/parts/Icon';", 1);
add('toast-api-allowed', "import { toast } from '@/molecules/Toaster/toast';", 0);
add(
  'toaster-internals-allowed',
  "import { x } from '@/molecules/Toaster/toast.store';",
  0,
  'src/components/molecules/Toaster/example.ts',
);
add(
  'toast-atom-internals-allowed',
  "import { x } from '@/atoms/Toast/Toast';",
  0,
  'src/components/atoms/Toast/example.ts',
);
add(
  'similar-toaster-directory-not-exempt',
  "import { x } from '@/molecules/Toaster/toast.store';",
  1,
  'src/components/molecules/ToasterOther/example.ts',
);
add('cypress-excluded', 'const x = process.env.PUBKY_RUNTIME_X;', 0, 'cypress/example.ts');
// Only root tool configs are excluded; nested `*.config.ts` files (the Sentry inits) are app code.
add('root-config-excluded', 'const x = process.env.PUBKY_RUNTIME_X;', 0, 'next.config.ts');
add('nested-config-linted', 'const x = process.env.PUBKY_RUNTIME_X;', 1, 'src/sentry.server.config.ts');
add('generated-service-worker-excluded', 'const x = process.env.PUBKY_RUNTIME_X;', 0, 'public/sw.js');
add('local-worktree-excluded', 'const x = process.env.PUBKY_RUNTIME_X;', 0, '.claude/worktrees/example/src/example.ts');

beforeAll(() => {
  writeFileSync(
    join(root, '.oxlintrc.json'),
    JSON.stringify({
      plugins: [],
      categories: { correctness: 'off' },
      ignorePatterns: config.ignorePatterns,
      jsPlugins: [join(repo, 'tooling/oxlint/pubky.mjs')],
      rules: pickRules(config.rules),
      overrides: config.overrides.map(
        ({ files, rules: overrideRules }: { files: string[]; rules: Record<string, RuleConfig> }) => ({
          files,
          rules: pickRules(overrideRules),
        }),
      ),
    }),
  );
  for (const fixture of cases) {
    const path = join(root, fixture.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, fixture.code + '\n');
  }
  const run = spawnSync(
    process.execPath,
    [join(repo, 'node_modules/oxlint/bin/oxlint'), '--format', 'json', ...cases.map(({ path }) => path)],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10_000,
    },
  );
  assert.equal(run.status, 1, `Expected lint diagnostics: ${run.stderr || run.stdout}`);
  const output: { diagnostics: Diagnostic[] } = JSON.parse(run.stdout);
  for (const diagnostic of output.diagnostics) {
    const path = diagnostic.filename.startsWith('/') ? relative(root, diagnostic.filename) : diagnostic.filename;
    const messages = actual.get(path) ?? [];
    messages.push(diagnostic);
    actual.set(path, messages);
  }
  assert.equal(
    output.diagnostics.length,
    cases.reduce((total, fixture) => total + fixture.errors, 0),
  );
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

for (const fixture of cases) {
  test(fixture.name, () => {
    const diagnostics = actual.get(fixture.path) ?? [];
    assert.equal(diagnostics.length, fixture.errors);
    for (const { message, labels } of diagnostics) {
      assert.ok(message.length > 0);
      assert.ok(labels[0].span.line > 0);
    }
  });
}
