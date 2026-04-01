import { defineConfig } from 'cypress';
import { config } from 'dotenv';

import { readdirSync, rm, unlink, rename, appendFileSync } from 'fs';
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
      // slow down execution more in CI to avoid flaky tests
      commandDelay: defaultMs,
      // Server-side only admin credentials (not exposed to client bundle)
      homeserverAdminUrl: process.env['HOMESERVER_ADMIN_URL'] || 'http://localhost:6288/generate_signup_token',
      homeserverAdminPassword: process.env['HOMESERVER_ADMIN_PASSWORD'] || 'admin',
    },
    expose: {
      ci: process.env['CI'],
      isMobile: false,
    },

    // Plugins

    setupNodeEvents(on, _config) {
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
        // task to delete a folder
        deleteFolder(folderName) {
          console.log('deleting folder %s', folderName);

          return new Promise((resolve, _reject) => {
            rm(folderName, { maxRetries: 10, recursive: true, force: true }, (err) => {
              if (err) {
                console.error(err);
              }
              resolve(null);
            });
          });
        },

        // task to delete a file
        deleteFile(filePath) {
          console.log('deleting file %s', filePath);

          return new Promise((resolve, reject) => {
            unlink(filePath, (err) => {
              if (err) {
                console.error(err);
                return reject(err);
              }
              resolve(null);
            });
          });
        },

        // Task to rename a file
        renameFile({ fromPath, toPath }) {
          console.log('renaming file from %s to %s', fromPath, toPath);

          return new Promise((resolve, reject) => {
            rename(fromPath, toPath, (err) => {
              if (err) {
                console.error(err);
                return reject(err);
              }
              resolve(null);
            });
          });
        },

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
    },
    experimentalModifyObstructiveThirdPartyCode: true,
    chromeWebSecurity: false,
    pageLoadTimeout: 60000,
  },
});
