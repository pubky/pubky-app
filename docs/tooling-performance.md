# TypeScript 7, Oxlint and Oxfmt: local and CI performance

Measured on September 17, 2026 for [#2357](https://github.com/pubky/pubky-app/issues/2357).

## Local repeated check timings

These are wall-clock medians of three successful runs per setup. Lower is better.

| Check                                             |   Before |   After | Speedup | Time reduction |
| ------------------------------------------------- | -------: | ------: | ------: | -------------: |
| Type check, fresh compiler cache                  | 12.742 s | 1.896 s |   6.72× |          85.1% |
| Type check, unchanged project with compiler cache |  2.565 s | 0.464 s |   5.53× |          81.9% |
| Whole-repository lint                             | 15.307 s | 7.463 s |   2.05× |          51.2% |
| Whole-repository formatting check                 | 10.929 s | 0.723 s |  15.11× |          93.4% |

Adding the three check medians (fresh type check + lint + formatting) gives **38.98 s → 10.08 s**, saving about **28.90 s**, or **74.1%**. This is a derived total, not a separately timed command. It does not predict pre-commit latency: lint-staged checks only staged files, while this benchmark checks the repository.

The native compiler provides the largest reduction in type-check time. Oxlint preserves the existing custom checks and still loads JavaScript plugins for import sorting, padding and missing native rules; that limits its speedup relative to an all-native configuration. Oxfmt provides the largest formatting speedup while retaining Tailwind sorting.

## Local memory

Median peak RSS reported by macOS `/usr/bin/time -l`:

| Check             |    Before |     After |
| ----------------- | --------: | --------: |
| Fresh type check  | 2.246 GiB | 2.310 GiB |
| Cached type check | 1.235 GiB | 0.902 GiB |
| Formatting check  | 0.651 GiB | 0.206 GiB |

Fresh type checking is about 3% higher in memory, so this migration should not be presented as reducing its memory requirements. Cached type checking uses about 27% less, and formatting about 68% less in these runs. JavaScript lint peak memory varied substantially between runs, so no reliable lint memory improvement is claimed. Peak RSS is the process accounting reported by `time`, not a measurement of total machine memory consumption.

## Local benchmark method

- Machine: Apple M4 Pro, 14 CPU cores, 48 GiB RAM; macOS; Node 24.20.0; npm 11.19.0.
- Before: commit `6803c5f5120121e4056399ad150121cb5b74953c`, TypeScript 5.9.3, ESLint 9.39.2, Prettier 3.9.6 and prettier-plugin-tailwindcss 0.8.1.
- After: the #2357 migration, TypeScript 7.0.2, Oxlint 1.83.0 and Oxfmt 0.68.0.
- Source trees were copied into separate temporary directories. The before tree used dependencies installed from its original lockfile; the after tree used the verified dependencies from a clean `npm ci` of the migrated lockfile. Dependencies were not installed or changed while timings ran.
- Commands ran sequentially. Before/after order alternated across the three rounds. No other build or test command from this task ran concurrently.
- Type-check commands used `tsc --noEmit --tsBuildInfoFile <unique-cache-file>`. Each fresh run had a new compiler-cache filename; its cached run immediately reused that filename without edits. These checks ran before generating Next.js build outputs. “Fresh” does not mean the operating system's filesystem caches were cleared, and the cached measurement does not represent an edit that invalidates many dependent files.
- Lint ran the configured `eslint` or `oxlint` command without a lint cache. Formatting used each setup's `format:check` arguments, including Tailwind sorting and matching exclusions for the `Public` templates. The migrated format command additionally covers MJS/CJS tooling files. The migrated tree includes its new configuration, guardrail tests and documentation; this measures the actual setups rather than pretending their file sets are identical.
- Each command ran under `/usr/bin/time -l` for memory accounting, with the parent process measuring wall time. CLI tools were invoked directly through Node, excluding npm's script-launch overhead from both setups.
- These are local measurements on one shared development machine, not a prediction of CI timings or browser runtime performance. Application rendering is still compiled by Next.js; faster TypeScript checks do not imply faster application code.

## CI comparison with open PRs

Measured the first run of [PR #2571](https://github.com/pubky/pubky-app/pull/2571), commit `0cd49bca2d03a0a0ddbb279b4162caec22a267f0`, against the latest successful runs at the measured heads of three other open PRs targeting `dev`. These runs occurred on September 16–17, 2026.

All four use identical `format.yml` and `test.yml` workflows, `ubuntu-latest` (image `ubuntu-24.04`, version `20260907.300.1`), Node 24.20.0 and npm 11.19.0. The baseline PRs have identical package manifests, including TypeScript 5.9.3, ESLint 9.39.2, Prettier 3.9.6 and Next.js 16.3.4. This migration leaves Next.js and the workflows unchanged.

Durations below come from GitHub Actions job/step timestamps, in whole seconds. Queue time is excluded. The baseline median is across the three different PRs; the migrated result is one run, not a repeated-run median.

| Measurement                                      | #2569 | #2566 | #2552 | Baseline median | #2571 | Change vs median |
| ------------------------------------------------ | ----: | ----: | ----: | --------------: | ----: | ---------------- |
| Formatting step                                  |  29 s |  18 s |  23 s |            23 s |   3 s | 87.0% less time  |
| Lint step                                        |  37 s |  25 s |  28 s |            28 s |  19 s | 32.1% less time  |
| Type-check step                                  |  32 s |  18 s |  23 s |            23 s |   7 s | 69.6% less time  |
| Sum of those three checks                        |  98 s |  61 s |  74 s |            74 s |  29 s | 60.8% less time  |
| Entire code-quality job, including install/setup | 137 s |  94 s | 111 s |           111 s |  77 s | 30.6% less time  |
| Slowest of five Vitest shard steps               | 139 s | 130 s | 140 s |           139 s | 130 s | 6.5% less time   |

The clear gain is in formatting and type checking, with a smaller lint improvement. The small test difference is not evidence of a reliable speedup. Test workloads differ: #2569 passed 13,778 tests, #2566 passed 13,728, #2552 passed 13,814 (plus two expected failures), and #2571 passed 13,785, including all 53 tooling fixtures. All four skipped two tests. Shards run concurrently, so their durations must not be added to claim elapsed suite time.

The new lockfile caused an npm download-cache miss in #2571's code-quality job; all three baseline jobs hit the existing cache. Its install step took 38 s versus a 24 s baseline median. That reduces the observed whole-job gain and is why install/setup is separated from the checks. The test workflow instead uses Bun 1.3.11 and five shards with four workers each, unchanged by this PR.

These are observations from separate hosted runners and different source changes, not a controlled same-commit experiment. Baseline variability is visible in the table. Do not extrapolate the percentages to the entire CI pipeline, preview deployment or application runtime.

### Source runs

| PR and measured head                                                                              | Code quality                                                       | Tests                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [#2569](https://github.com/pubky/pubky-app/pull/2569), `79205c07be612edbec2c82265eba7a124ad91738` | [Run](https://github.com/pubky/pubky-app/actions/runs/35160629809) | [Run](https://github.com/pubky/pubky-app/actions/runs/35160629771) |
| [#2566](https://github.com/pubky/pubky-app/pull/2566), `48d2c7c03291eb3ef5dd2735889907610fb361db` | [Run](https://github.com/pubky/pubky-app/actions/runs/35155271226) | [Run](https://github.com/pubky/pubky-app/actions/runs/35155271223) |
| [#2552](https://github.com/pubky/pubky-app/pull/2552), `08fa17e92b2336fedea7c1303a94521ddae355ea` | [Run](https://github.com/pubky/pubky-app/actions/runs/35181054522) | [Run](https://github.com/pubky/pubky-app/actions/runs/35181054440) |
| [#2571](https://github.com/pubky/pubky-app/pull/2571), `0cd49bca2d03a0a0ddbb279b4162caec22a267f0` | [Run](https://github.com/pubky/pubky-app/actions/runs/35181950765) | [Run](https://github.com/pubky/pubky-app/actions/runs/35181950755) |

To inspect the measurements, use `gh api repos/pubky/pubky-app/actions/runs/<run-id>/jobs` for each job's `started_at`, `completed_at` and `steps`. `gh run view <run-id> --repo pubky/pubky-app --log` includes the runner image, cache result and test counts.

## Verification

The migrated setup passes a clean `npm ci`, formatting, lint and type checking, the full unit suite (**13,785 passed, 2 skipped**), **75** targeted VRT checks across Chromium/Firefox/WebKit, and a production build. The production startup smoke test returns HTTP 200 for `/` and `/robots.txt` when supplied with the documented required runtime configuration. No VRT baselines changed.

The first CI run also passes code quality, all five test shards and coverage merging, and the production build and startup smoke test.

See [Development workflow](development-workflow.md#compiler-linter-and-formatter) for compiler, plugin and editor setup details.
