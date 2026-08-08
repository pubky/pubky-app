# Visual Regression Testing (VRT)

VRT renders a component in a real browser (Playwright via `@vitest/browser`),
screenshots it, and pixel-compares against a committed baseline. It catches
layout/style/responsive/cross-OS regressions — not functional bugs (use unit /
interaction tests for those).

- Test files: `*.vrt.test.tsx` (the `vrt` Vitest project in `vitest.config.ts`).
- Run: `npm run test:vrt`. Update baselines: `npm run test:vrt:regenerate-baseline`.
- Baselines: `__screenshots__/<file>/<name>-<browser>-<platform>.png`, one per
  browser (chromium/firefox/webkit) × platform (darwin/linux).
- Harness: `src/test-utils/vrt.tsx` (`renderForVRT`, `VRT_ROOT_TESTID`),
  `vrt.setup.ts` (global mocks), `vrt.clock.ts`, `vrt.viewports.ts`.
- Reference example: `src/test/vrt/feed/Home.vrt.test.tsx`.

## Writing a test

```tsx
const screen = await renderForVRT(<Component />, { viewport: VRT_VIEWPORT_DESKTOP });
await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('name-desktop');
```

`renderForVRT` wraps the tree in a viewport-clamped root (the screenshot is
exactly the viewport, not full scroll height), freezes the clock, seeds
`Math.random`, and waits for fonts + successfully loaded images. Mock every
data dependency (store/hook/fetch/router) so the pixels are deterministic.

## Determinism

Renders should be as close to identical as possible every run, on every OS.
`vitest.config.ts` sets a small `toMatchScreenshot` tolerance
(`comparatorOptions.allowedMismatchedPixelRatio: 0.001`, i.e. 0.1%) so residual
sub-pixel anti-aliasing noise between runs/environments is not treated as a
regression. This tolerance is shared by comparison (`npm run test:vrt`) and
regeneration (`--update`): `--update` only rewrites a baseline when a capture
differs by more than the ratio, which is what keeps regeneration diffs limited
to genuinely-changed surfaces. The trade-off is that a visual change under 0.1%
of pixels won't be flagged — still pin every deterministic source below so real
diffs stand out:

- **Async data** — mock the hook/controller to a fixed value. An unmocked fetch
  resolves differently per run/region. This is the #1 cause of flakiness.
- **Time** — `renderForVRT` calls `freezeNow()`; mock any relative-time hook to
  the stable formatter in `vrt.clock.ts`.
- **Randomness** — `Math.random` is seeded by the harness, so name generators
  and placeholders stay stable.
- **Images** — `next/image` is mocked to a plain `<img>` in `vrt.setup.ts` (the
  browser runtime has no Next image optimizer, so the real component 404s).
  `renderForVRT` waits until each `<img>` has real pixels (`naturalWidth > 0`),
  then `decode()`, then two animation frames so SVG/logo paint cannot race the
  screenshot. Each image has a short timeout that rejects with the URL (and
  `complete` / `naturalWidth`) so a hung load is not mistaken for a generic
  test timeout. Load/decode failures reject with the image URL — broken assets
  must not become blank baselines. Swallowing `decode()` alone was not enough
  and caused intermittent blank header logos. Intentionally absent artwork
  should be mocked out of the tree rather than left as a broken `<img>`.
  **CSS `background-image` is not covered by that wait** — covers and other
  decorative backgrounds settle only via `toMatchScreenshot` retries unless
  you preload them first. Always `preloadImages(...)` (decode via `new Image()`)
  for any CSS background URLs the surface paints, the same way Collections VRT
  does for card/hero covers before `renderForVRT`.
- **Avatars** — VRT profile fixtures use `image: null` so every avatar renders
  `FacehashAvatar`. `vrt.setup.ts` sets `globalThis.__VRT__` and stabiliser CSS;
  `FacehashAvatar` disables blink, 3D tilt, and hover when that flag is set.
- **vi.mock + import order** — factories are hoisted; keep the
  `eslint-disable simple-import-sort/imports` header so `eslint --fix` can't
  reorder imports into a TDZ crash. Don't reference a top-level `const` inside a
  `vi.mock` factory (it's hoisted above the const) — inline the literal.

## Render like the real app

A template alone misses chrome the root layout adds. Onboarding pages render
under `<Header />` (the step bar), mounted by `src/app/layout.tsx`. Render that
wrapper in the test and mock what it reads (`usePathname`, `useAuthStore`,
`usePublicRoute`) so the snapshot matches what the user sees.

## Limitation: can't capture a page taller than the screen

A page taller than the viewport is cropped at the fold — the bottom is not in
the baseline. `toMatchScreenshot` takes an element (locator) screenshot, which
can't do full-page capture, and a headless browser doesn't rasterize offscreen
content anyway. Growing the viewport doesn't help: an oversized initial viewport
makes the browser scale the whole screenshot by an env-dependent factor, which
breaks the cross-OS comparison.

**What to do:** accept the viewport crop (every other VRT here does), or capture
a tall page section by section (header / card / footer as separate snapshots).

See [Vitest Discussion #7749](https://github.com/vitest-dev/vitest/discussions/7749).

## Artifact: sub-pixel seams on segmented elements

A baseline may show thin tick lines that you don't see in your real browser.
Example: the onboarding progress bar (`molecules/ProgressSteps`) is 5 adjacent
`<div>` segments (`gap-0`), each with its own fill; the seams between them show
as faint notches.

Cause: the test renders at a lower device-pixel-ratio than a retina display, so
adjacent elements anti-alias at the boundary instead of blending. Not a CSS bug
— a rasterization artifact of any element built from abutting pieces.

**Accept it in the baseline.** It reproduces identically every run, so it doesn't
cause flakiness or hide regressions.

## Updating baselines

`test:vrt:regenerate-baseline` (`--update`) updates **every** baseline that runs,
ignoring a path argument — so it silently rewrites unrelated baselines with your
machine's render. To update only your files:

```bash
npx vitest run --project vrt <path-to-your-dir-or-file> --update
```

After any `--update`, run `git status` and revert baselines you didn't intend to
touch (`git checkout -- <path>`). Pre-existing cross-machine drift (a baseline
that fails on your Mac with the code reverted) is not yours to re-baseline.

Prove a hypothesis on one test before regenerating many. If a shared helper
(`vrt.tsx` / `vrt.setup.ts`) changes, re-run one image and eyeball it first.

## CI baseline update workflow

Actions → **VRT Update Baselines** → run on the branch whose code you want
baselined.

| Triggered from | Commit target                                    | Pull request                    |
| -------------- | ------------------------------------------------ | ------------------------------- |
| `dev`          | `vrt-update-baselines` (reset from latest `dev`) | Opens PR → `dev` if none exists |
| Feature branch | Same feature branch                              | None                            |
| `master`       | —                                                | Workflow fails (do not use)     |

The workflow never commits directly to `dev` or `master`. It regenerates on both
`ubuntu-latest` and `macos-latest`, merges `*-linux.png` and `*-darwin.png`
artifacts, then commits the combined result.

Only baselines that changed are committed: `--update` leaves matching baselines
untouched on disk (within the tolerance above), and the commit step stages via
`git add` + `git diff --staged --quiet`, so a run with no visual changes makes no
commit and opens no PR.

**CI is the source of truth.** Because pixel rendering differs between a local
machine and the GitHub runners, baselines must be generated by this workflow, not
committed by hand. The first run after adopting this workflow regenerates every
baseline (locally-made baselines never match the runners) — merge that one large
PR to make the runners the baseline owner. Subsequent runs then only touch
surfaces that genuinely changed.
