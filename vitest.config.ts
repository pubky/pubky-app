import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { playwright } from '@vitest/browser-playwright';
import { VRT_VIEWPORT_DESKTOP } from './src/test-utils/vrt.viewports';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    // Force a single copy of these packages so we never load two versions at once.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
    },
    onConsoleLog(log) {
      if (
        log.includes('WebAssembly.instantiateStreaming') ||
        log.includes('application/wasm') ||
        log.includes('MIME type')
      ) {
        return false;
      }
      if (log.includes('Not implemented: navigation')) {
        return false;
      }
      return true;
    },
    dangerouslyIgnoreUnhandledErrors: false,
    silent: false,
    // Vitest rejects `teardownTimeout` on a project, so it is pinned here for
    // every project. 10s is already the default; a hung shutdown fails there
    // instead of holding the process open. The VRT project pins `hookTimeout`
    // the same way.
    teardownTimeout: 10_000,
    // `reporters` is also root-only. Register the progress reporter only when a
    // VRT workflow has set a run budget, so unit tests keep Vitest's own
    // default list (including the github-actions reporter). Re-include that
    // reporter here, because setting `reporters` replaces the default list.
    ...(process.env.VRT_RUN_TIMEOUT_MS
      ? {
          reporters: [
            'default' as const,
            ...(process.env.GITHUB_ACTIONS === 'true' ? ['github-actions' as const] : []),
            './src/test-utils/vrt.progress-reporter.ts',
          ],
        }
      : {}),
    projects: [
      // Unit tests run in jsdom.
      {
        plugins: [react(), tsconfigPaths()],
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/config/test.ts'],
          globals: true,
          include: ['**/*.test.{ts,tsx}'],
          // .claude excludes local tooling worktrees checked out inside the repo.
          exclude: ['**/node_modules/**', '**/.claude/**', '**/*.vrt.test.{ts,tsx}'],
          server: { deps: { inline: ['react-tweet'] } },
        },
      },
      // VRT(Visual Regression Tests) run in real browsers via Playwright.
      {
        plugins: [react(), tsconfigPaths()],
        optimizeDeps: {
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'next/font/google',
          ],
        },
        test: {
          name: 'vrt',
          globals: true,
          testTimeout: 30_000,
          // Pin the browser-mode hook default (30s) so a hung beforeAll fails
          // inside the test budget. A stall that never enters a test is bounded
          // in CI by the job/step timeouts and `VRT_RUN_TIMEOUT_MS`.
          hookTimeout: 30_000,
          // Vitest's Playwright webkit provider can throw
          // `route.fulfill: Target page, context or browser has been closed` when
          // multiple test files run in parallel within a browser context. Running
          // test files sequentially per browser avoids the race while still letting
          // chromium, firefox, and webkit run concurrently as separate projects.
          // `false` also forces maxWorkers to 1, so each browser opens one page.
          // CI selects a single browser project per job, so a macOS runner is not
          // hosting chromium, firefox, and webkit at the same time.
          fileParallelism: false,
          include: ['**/*.vrt.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/.claude/**'],
          setupFiles: ['./src/test-utils/vrt.setup.ts'],
          server: { deps: { inline: ['react-tweet'] } },
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            // Shared by comparison (`npm run test:vrt`) and regeneration
            // (`--update`). A capture within this ratio of the committed
            // baseline is treated as unchanged, so `--update` only rewrites
            // baselines that changed beyond sub-pixel/anti-aliasing noise.
            // Trade-off: visual diffs under this ratio won't be flagged.
            expect: {
              toMatchScreenshot: {
                comparatorName: 'pixelmatch',
                comparatorOptions: {
                  allowedMismatchedPixelRatio: 0.001,
                },
                // Image-heavy suites (Home, Collections) on WebKit need extra
                // headroom for layout to settle after fonts/images decode.
                timeout: 15_000,
              },
            },
            // `viewport` below is the INITIAL browser size only. Each test
            // resizes the page per-call via `page.viewport(w, h)` inside
            // `renderForVRT` (see `src/test-utils/vrt.tsx`), so mobile
            // (VRT_VIEWPORT_MOBILE) is driven by the test, not by this
            // config. Add new sizes to `src/test-utils/vrt.viewports.ts`.
            instances: [
              {
                browser: 'chromium',
                viewport: VRT_VIEWPORT_DESKTOP,
              },
              {
                browser: 'firefox',
                viewport: VRT_VIEWPORT_DESKTOP,
              },
              // `webkit` covers Safari's rendering engine. Nobody browses with
              // WebKit on Linux, so it runs on macOS only and there are no
              // `*-webkit-linux.png` baselines; skipping it here keeps a local
              // Linux run from creating them.
              ...(process.platform === 'linux'
                ? []
                : [
                    {
                      browser: 'webkit' as const,
                      viewport: VRT_VIEWPORT_DESKTOP,
                    },
                  ]),
            ],
          },
        },
      },
    ],
  },
});
