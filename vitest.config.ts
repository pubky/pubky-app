import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    // react-tweet is ESM-only with CSS module imports that Node.js can't resolve
    // without bundling. Inlining forces Vitest to transform it through Vite's pipeline.
    server: { deps: { inline: ['react-tweet'] } },
    environment: 'jsdom',
    setupFiles: ['./src/config/test.ts'],
    globals: true,
    exclude: ['**/*.stories.tsx', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
    },
    // Snapshot testing configuration
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: false,
    },
    // Configure snapshots to be placed alongside test files
    resolveSnapshotPath: (testPath, snapExtension) => {
      return testPath + snapExtension;
    },
    // Suppress specific warnings
    onConsoleLog(log) {
      // Suppress WebAssembly warnings
      if (
        log.includes('WebAssembly.instantiateStreaming') ||
        log.includes('application/wasm') ||
        log.includes('MIME type')
      ) {
        return false;
      }
      // Suppress JSDOM navigation warnings
      if (log.includes('Not implemented: navigation')) {
        return false;
      }
      return true;
    },
    // Configure to better handle unhandled rejections
    dangerouslyIgnoreUnhandledErrors: false,
    // Silence some types of warnings in stderr
    silent: false,
  },
});
