import { defineConfig } from 'cypress';
import { config } from 'dotenv';

import { appendFileSync, readdirSync } from 'fs';
import { startLockServerWrites } from './plugins/lock-server';
import { createNexusTasks } from './plugins/nexus';
import { createSeedTasks } from './plugins/seed';
import { defaultMs } from './support/slow-down';

config({ path: '../.env' });

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'support/e2e.ts',
    videosFolder: 'videos',
    screenshotsFolder: 'screenshots',
    downloadsFolder: 'download',
    fixturesFolder: 'fixtures',
    defaultCommandTimeout: process.env['CI'] ? 60_000 : 15_000,
    video: true, // Firefox videos are not working, see https://github.com/cypress-io/cypress/issues/18415
    viewportWidth: 1920,
    viewportHeight: 1080,
    // Safari support
    experimentalWebKitSupport: true,
    env: {
      // Server-side only admin credentials (not exposed to client bundle)
      homeserverAdminUrl: process.env['HOMESERVER_ADMIN_URL'] || 'http://localhost:6288/generate_signup_token',
      homeserverAdminPassword: process.env['HOMESERVER_ADMIN_PASSWORD'] || 'admin',
      nexusUrl: process.env['PUBKY_RUNTIME_NEXUS_URL'] || 'http://localhost:8080',
      // The pubky-testnet homeserver key, which the app's testnet mode also defaults to
      homeserverPublicKey:
        process.env['PUBKY_RUNTIME_HOMESERVER'] || '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo',
    },
    expose: {
      // slow down execution more in CI to avoid flaky tests
      commandDelay: defaultMs,
      ci: process.env['CI'],
      isMobile: false,
      // Origin of the stubbed Lock Server (locks.cy.ts); the e2e workflow gives the app the same value.
      locksStubUrl: process.env['PUBKY_RUNTIME_E2E_LOCKS_STUB_URL'] || 'http://lock-server.e2e.test',
    },

    // Plugins

    async setupNodeEvents(on, cypressConfig) {
      on('before:browser:launch', (browser, launchOptions) => {
        if (browser.family === 'firefox') {
          // Firefox to treat localhost as secure context (needed for win.navigator.clipboard)
          launchOptions.preferences['network.proxy.testing_localhost_is_secure_when_hijacked'] = true;
          // Enables clipboard access
          launchOptions.preferences['dom.events.testing.asyncClipboard'] = true;
          // Enables readText from clipboard
          launchOptions.preferences['dom.events.asyncClipboard.readText'] = true;
        }
        // Enable clipboard for Chrome
        if (browser.family === 'chromium' && browser.name !== 'electron') {
          launchOptions.args.push('--enable-experimental-web-platform-features');
          launchOptions.args.push('--clipboard-read-write'); // Enable clipboard read/write
          launchOptions.args.push('--clipboard-sanitized-write'); // Enable sanitized write permissions
        }
        return launchOptions;
      });

      on('task', {
        checkFileExistsWithSuffix({ folder, suffix }) {
          const files = readdirSync(folder);
          const matchedFile = files.find((file) => file.endsWith(suffix));
          return !!matchedFile; // Return true if a match is found
        },

        log(message) {
          console.log(message); // log to the console
          return null; // return null to indicate task completion
        },

        logToFile({ testName, message }) {
          appendFileSync('cypress.log', `\nTest: ${testName}\nTime: ${new Date().toISOString()}\n${message}`);
          return null; // return null to indicate task completion
        },
      });

      // Seed supporting users and activity through the homeserver API (see plugins/seed.ts)
      const seedTasks = createSeedTasks({
        homeserverAdminUrl: String(cypressConfig.env['homeserverAdminUrl']),
        homeserverAdminPassword: String(cypressConfig.env['homeserverAdminPassword']),
        homeserverPublicKey: String(cypressConfig.env['homeserverPublicKey']),
        nexusUrl: String(cypressConfig.env['nexusUrl']),
      });
      on('task', seedTasks);

      // Wait for a phase's seeds to be indexed, all at once (see plugins/nexus.ts)
      on('task', createNexusTasks(String(cypressConfig.env['nexusUrl'])));

      // The stubbed Lock Server's homeserver writes, for locks.cy.ts (see plugins/lock-server.ts)
      cypressConfig.expose['lockServerWritesUrl'] = await startLockServerWrites(seedTasks.seedLockServerWrite);
      return cypressConfig;
    },
    experimentalModifyObstructiveThirdPartyCode: true,
    // Chrome's native network path (Cypress 16) instruments the service worker script on the
    // registration fetch but not on the browser's update check, so an unchanged sw.js reaches the
    // browser as different bytes and installs a second worker that waits behind the app's
    // "Update available" toast (cypress-io/cypress#34943). The HTTP/1 proxy rewrites every fetch
    // alike. Remove once that issue is fixed.
    forceHttp1: true,
    chromeWebSecurity: false,
    pageLoadTimeout: 60000,
  },
});
