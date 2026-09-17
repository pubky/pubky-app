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

All four use identical `format.yml` and `test.yml` workflows, `ubuntu-latest` (image `ubuntu-24.04`, version `20260907.300.1`), Node 24.20.0 and npm 11.19.0. The baseline PRs have identical package manifests, including TypeScript 5.9.3, ESLint 9.39.2, Prettier 3.9.6 and Next.js 16.3.4. The measured commit keeps the Next.js version and these two workflows unchanged.

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

## Local production-build comparison

Measured on 2026-09-17 on the same Apple M4 Pro (14 CPU cores, 48 GiB RAM), macOS 26.7, Node 24.20.0 and npm 11.19.0. The baseline is `80c2e031e98ba0a18e836ffbad32337aa9ad4027`, which already contains the TypeScript 7/Oxc migration; the Turbopack implementation is `c2206c06bdb3215b58a122675f7df6a0cbc3255b`.

The measurement is wall time for the complete `npm run build` command. Webpack builds the worker through its plugin; Turbopack runs Next.js and then `npm run build:sw`. Both include TypeScript checking and worker generation. Dependency installation, browser checks and Docker builds are excluded.

Each bundler ran three cold/repeat pairs in separate temporary checkouts with their own dependencies. A cold run removed `.next`, `tsconfig.tsbuildinfo`, `public/sw.js` and `public/sw.js.map`; its immediate repeat retained the generated output and caches without changing source files. Three additional cached builds per bundler changed only the offline page’s copy in the temporary checkout, using distinct text in each round; those edits were restored afterward. Bundler order alternated between rounds. `NEXT_TELEMETRY_DISABLED=1` was set; `NODE_OPTIONS`, `NEXT_STANDALONE`, `TURBOPACK` and `NEXT_PUBLIC_APP_VERSION` were unset. No other assistant build, test suite or Docker workload ran during the measurements. These are local cache conditions; the OS filesystem cache was not flushed.

| Build case, three-run median        |   Webpack | Turbopack + Serwist CLI | Speedup | Less time |
| ----------------------------------- | --------: | ----------------------: | ------: | --------: |
| Cold production build               | 173.397 s |                18.599 s |   9.32× |     89.3% |
| Unchanged repeat build              |  26.522 s |                 5.939 s |   4.47× |     77.6% |
| Cached build after a page-text edit | 145.410 s |                 6.470 s |  22.47× |     95.6% |

### Raw build measurements

| Build case                                     |     Run 1 |     Run 2 |     Run 3 |
| ---------------------------------------------- | --------: | --------: | --------: |
| Webpack: cold production build                 | 171.575 s | 173.397 s | 174.359 s |
| Turbopack: cold production build               |  20.106 s |  16.469 s |  18.599 s |
| Webpack: unchanged repeat build                |  26.341 s |  27.016 s |  26.522 s |
| Turbopack: unchanged repeat build              |   5.874 s |   5.939 s |   6.029 s |
| Webpack: cached build after a page-text edit   | 147.960 s | 145.410 s | 144.243 s |
| Turbopack: cached build after a page-text edit |   7.124 s |   5.508 s |   6.470 s |

The repeat figures describe unchanged local rebuilds with caches available. The page-edit figures cover a small, isolated source change; a dependency or configuration change can invalidate more work. Neither is a promised CI duration. The normal CI Build job now preserves `.next/cache`; Docker keeps its existing layer cache without transferring Next's incremental cache between fresh builders. This measures build tooling, not browser interaction or page-load performance.

## PR CI production-build comparison

Measured actual GitHub Actions runs of [PR #2571](https://github.com/pubky/pubky-app/pull/2571) on 2026-09-17. The direct before/after pair uses Webpack head `80c2e031` and Turbopack head `c2206c06`, both against base `6803c5f5`. The normal Build workflow checked out GitHub's merge commits `89eaf784` and `702e77dd`. Both already use TypeScript 7/Oxc, and both logs confirm a Next.js cache miss. This isolates the bundler/Serwist change from the earlier compiler migration and from incremental-cache reuse.

Both Build jobs use `ubuntu-24.04` image `20260907.300.1`, Node 24.20.0 and npm 11.19.0. Step/job times come from GitHub's timestamps, rounded to whole seconds; Docker command times come from BuildKit's `DONE` records. Each before/after result is one observed run, not a repeated-run median.

| Measurement                                                  | Webpack | Turbopack + Serwist CLI | Change                  |
| ------------------------------------------------------------ | ------: | ----------------------: | ----------------------- |
| Build workflow: complete `npm run build`, Next.js cache miss |   147 s |                    52 s | 64.6% less time (2.83×) |
| Entire Build job, including setup/install/cache/smoke test   |   203 s |                   101 s | 50.2% less time         |
| Preview Docker: `RUN npm run build`                          | 163.4 s |                  79.0 s | 51.7% less time (2.07×) |
| Entire preview image build-and-push job                      |   328 s |                   362 s | 10.4% more time         |
| Preview workflow, first job start to final job completion    |   412 s |                   439 s | 6.6% more time          |

The complete build commands include type checking and service-worker generation. The Build job's npm download cache hit before and missed after; installation took 31 s and 29 s, respectively. Neither used a restored Next.js cache. Preview Docker builds use Linux/amd64 and the unchanged Dockerfile/layer-cache setup; both `npm run build` layers actually executed. Docker does not restore the normal Build job's `.next/cache`.

Compilation improved, but these samples do **not** demonstrate faster preview deployments. The new dependencies invalidated Docker's cached installation layer (42.3 s after versus a cache hit before). Image export/upload took 130.4 s after versus 69.2 s before, and the separate Sentry upload step took 25.2 s versus 17.5 s. Those costs offset the compilation gain. Whole-job duration includes setup/cleanup; preview workflow elapsed time also includes waits between jobs. Queue time before the first job is excluded, and parallel job durations are not summed.

### Cache reuse and run variability

A later Build run at head `fa06d02f` restored the compatible cache saved by `c2206c06`: **21 s** for `npm run build`, **78 s** for the entire job. This was a restore-key hit after source changes, not an unchanged-repeat benchmark: `dev` had advanced to `8de93300` with #2552, and GitHub tested merge commit `9099015c`. The cache restored in 5 s and the new entry saved in 6 s. This verifies that the simple CI cache works across compatible source changes; it is not a measured warm-Webpack comparison.

Four consecutive successful Webpack Build runs in this PR took **136, 141, 156 and 147 s** for the build command (median **144 s**), versus **52 s** for the first cold Turbopack run. Three completed Webpack preview runs took **175.2, 156.2 and 163.4 s** for Docker's build command, while their entire image jobs ranged from **306 to 444 s**. This variation is why the report separates compilation from deployment and does not extrapolate a single run to all CI workloads.

### Source runs

| Head and condition                                       | Build workflow                                                     | Preview workflow                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `0cd49bca`, Webpack, no Next.js cache restore            | [Run](https://github.com/pubky/pubky-app/actions/runs/35181950899) | Cancelled; excluded                                                |
| `c47b0e57`, Webpack, no Next.js cache restore            | [Run](https://github.com/pubky/pubky-app/actions/runs/35182356199) | [Run](https://github.com/pubky/pubky-app/actions/runs/35182356426) |
| `11326f0f`, Webpack, no Next.js cache restore            | [Run](https://github.com/pubky/pubky-app/actions/runs/35183089235) | [Run](https://github.com/pubky/pubky-app/actions/runs/35183089596) |
| `80c2e031`, Webpack, Next.js cache miss                  | [Run](https://github.com/pubky/pubky-app/actions/runs/35184138730) | [Run](https://github.com/pubky/pubky-app/actions/runs/35184138930) |
| `c2206c06`, Turbopack, Next.js cache miss                | [Run](https://github.com/pubky/pubky-app/actions/runs/35185281615) | [Run](https://github.com/pubky/pubky-app/actions/runs/35185281786) |
| `fa06d02f`, Turbopack, compatible Next.js cache restored | [Run](https://github.com/pubky/pubky-app/actions/runs/35186756262) | Not used in this comparison                                        |

## Bundler verification

- Clean `npm ci`, formatting, lint, type checking and workflow validation pass. The full unit suite passes **13,791 tests**, with **2 skipped**, including **12** service-worker registration checks.
- Chromium verifies upgrading an installed Webpack worker to the new worker at the same `/sw.js` URL and `/` scope, shared text/file redirects, cached assets offline, and no page errors. All **69 public assets** retain identical URLs and revisions. Emitted fonts are cached; source maps are excluded.
- A local Linux/arm64 Docker image builds without Sentry credentials and serves `/`, `/home`, `/robots.txt` and the exact generated worker bytes. Browser source maps are absent; **68** server maps retain matching Sentry Debug IDs. Uploading to Sentry was not exercised locally.
- CI passes the [production build, worker smoke test and cache save](https://github.com/pubky/pubky-app/actions/runs/35185281615), [code quality](https://github.com/pubky/pubky-app/actions/runs/35185281681) and [unit tests](https://github.com/pubky/pubky-app/actions/runs/35185281694), and [preview Docker build/deployment](https://github.com/pubky/pubky-app/actions/runs/35185281786). Browser verification used local production servers; the deployed preview requires Google IAP authentication.

Existing worker limitations were reproduced before and after the migration: `/offline` is not precached, so offline document navigation fails, and the default 2 MiB chunk limit excludes one large JavaScript chunk in each bundler's output. Public files retain the classic integration's separate size policy, including the large landing-page video. Changing offline navigation or the chunk limit is outside this build migration.

## Initial tooling-migration verification

The migrated setup passes a clean `npm ci`, formatting, lint and type checking, the full unit suite (**13,785 passed, 2 skipped**), **75** targeted VRT checks across Chromium/Firefox/WebKit, and a production build. The production startup smoke test returns HTTP 200 for `/` and `/robots.txt` when supplied with the documented required runtime configuration. No VRT baselines changed.

The first CI run also passes code quality, all five test shards and coverage merging, and the production build and startup smoke test.

See [Development workflow](development-workflow.md#compiler-linter-and-formatter) for compiler, plugin and editor setup details.
