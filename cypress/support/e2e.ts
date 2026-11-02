// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.ts using ES2015 syntax:
import './commands';

// Runs the app as a browser without service worker support, so Serwist never registers its worker.
// On Chromium, Cypress 16 instruments the worker script only on fetches its network interception
// sees, so an unchanged sw.js can reach the browser as different bytes, install a second worker and
// leave it waiting behind the app's persistent "Update available" toast. Test isolation does not
// clear workers, so that toast then covers the page for the rest of the spec.
Cypress.on('window:before:load', (win) => {
  Reflect.deleteProperty(win.Navigator.prototype, 'serviceWorker');
});

// uses Chrome DevTools Protocol to allow clipboard permissions
// resolves 'NotAllowedError: Document is not focused.' in CI
if (Cypress.browser.family === 'chromium') {
  Cypress.automation('remote:debugger:protocol', {
    command: 'Browser.grantPermissions',
    params: {
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      origin: window.location.origin,
    },
  });
}
