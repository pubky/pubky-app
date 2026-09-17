# TypeScript 7, Oxlint and Oxfmt: local performance

Measured on September 17, 2026 for [#2357](https://github.com/pubky/pubky-app/issues/2357).

## Repeated check timings

These are wall-clock medians of three successful runs per setup. Lower is better.

| Check                                             |   Before |   After | Speedup | Time reduction |
| ------------------------------------------------- | -------: | ------: | ------: | -------------: |
| Type check, fresh compiler cache                  | 12.742 s | 1.896 s |   6.72× |          85.1% |
| Type check, unchanged project with compiler cache |  2.565 s | 0.464 s |   5.53× |          81.9% |
| Whole-repository lint                             | 15.307 s | 7.463 s |   2.05× |          51.2% |
| Whole-repository formatting check                 | 10.929 s | 0.723 s |  15.11× |          93.4% |

Adding the three check medians (fresh type check + lint + formatting) gives **38.98 s → 10.08 s**, saving about **28.90 s**, or **74.1%**. This is a derived total, not a separately timed command. It does not predict pre-commit latency: lint-staged checks only staged files, while this benchmark checks the repository.

The native compiler provides the largest reduction in type-check time. Oxlint preserves the existing custom checks and still loads JavaScript plugins for import sorting, padding and missing native rules; that limits its speedup relative to an all-native configuration. Oxfmt provides the largest formatting speedup while retaining Tailwind sorting.

## Memory

Median peak RSS reported by macOS `/usr/bin/time -l`:

| Check             |    Before |     After |
| ----------------- | --------: | --------: |
| Fresh type check  | 2.246 GiB | 2.310 GiB |
| Cached type check | 1.235 GiB | 0.902 GiB |
| Formatting check  | 0.651 GiB | 0.206 GiB |

Fresh type checking is about 3% higher in memory, so this migration should not be presented as reducing its memory requirements. Cached type checking uses about 27% less, and formatting about 68% less in these runs. JavaScript lint peak memory varied substantially between runs, so no reliable lint memory improvement is claimed. Peak RSS is the process accounting reported by `time`, not a measurement of total machine memory consumption.

## Method

- Machine: Apple M4 Pro, 14 CPU cores, 48 GiB RAM; macOS; Node 24.20.0; npm 11.19.0.
- Before: commit `6803c5f5120121e4056399ad150121cb5b74953c`, TypeScript 5.9.3, ESLint 9.39.2, Prettier 3.9.6 and prettier-plugin-tailwindcss 0.8.1.
- After: the #2357 migration, TypeScript 7.0.2, Oxlint 1.83.0 and Oxfmt 0.68.0.
- Source trees were copied into separate temporary directories. The before tree used dependencies installed from its original lockfile; the after tree used the verified dependencies from a clean `npm ci` of the migrated lockfile. Dependencies were not installed or changed while timings ran.
- Commands ran sequentially. Before/after order alternated across the three rounds. No other build or test command from this task ran concurrently.
- Type-check commands used `tsc --noEmit --tsBuildInfoFile <unique-cache-file>`. Each fresh run had a new compiler-cache filename; its cached run immediately reused that filename without edits. These checks ran before generating Next.js build outputs. “Fresh” does not mean the operating system's filesystem caches were cleared, and the cached measurement does not represent an edit that invalidates many dependent files.
- Lint ran the configured `eslint` or `oxlint` command without a lint cache. Formatting used each setup's `format:check` arguments, including Tailwind sorting and matching exclusions for the `Public` templates. The migrated format command additionally covers MJS/CJS tooling files. The migrated tree includes its new configuration, guardrail tests and documentation; this measures the actual setups rather than pretending their file sets are identical.
- Each command ran under `/usr/bin/time -l` for memory accounting, with the parent process measuring wall time. CLI tools were invoked directly through Node, excluding npm's script-launch overhead from both setups.
- These are local measurements on one shared development machine, not a prediction of CI timings or browser runtime performance. Application rendering is still compiled by Next.js; faster TypeScript checks do not imply faster application code.

## Verification

The migrated setup passes a clean `npm ci`, formatting, lint and type checking, the full unit suite (**13,785 passed, 2 skipped**), **75** targeted VRT checks across Chromium/Firefox/WebKit, and a production build. The production startup smoke test returns HTTP 200 for `/` and `/robots.txt` when supplied with the documented required runtime configuration. No VRT baselines changed.

See [Development workflow](development-workflow.md#compiler-linter-and-formatter) for compiler, plugin and editor setup details.
