import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { playwright } from '@vitest/browser-playwright';

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
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: false,
    },
    resolveSnapshotPath: (testPath, snapExtension) => testPath + snapExtension,
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
          exclude: ['**/node_modules/**', '**/*.vrt.test.{ts,tsx}'],
          server: { deps: { inline: ['react-tweet'] } },
        },
      },
      // VRT(Visual Regression Tests) run in a real Chromium browser via Playwright.
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
          include: ['**/*.vrt.test.{ts,tsx}'],
          exclude: ['**/node_modules/**'],
          setupFiles: ['./src/test-utils/vrt.setup.ts'],
          server: { deps: { inline: ['react-tweet'] } },
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [
              {
                browser: 'chromium',
                viewport: { width: 1440, height: 900 },
              },
            ],
          },
        },
      },
    ],
  },
});
