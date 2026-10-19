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

// Cap for the one-time warm-up below only; no suite-wide timeout changes.
const SERVICE_WORKER_WARM_UP_TIMEOUT_MS = 180_000;

// Runs once per spec, before the spec's own hooks. A cold browser's first visit compiles the JS and
// installs the service worker (src/sw.ts), whose install event precaches the shell chunks; the first
// worker only becomes `navigator.serviceWorker.ready` once that install has finished. Cypress keeps the
// worker and Cache Storage for the rest of the spec, so only this hook pays the cost. The worker is
// deliberately not stubbed or unregistered: the suite should run in the browser a user gets.
before(() => {
  const startedAt = Date.now();
  cy.visit('/', { timeout: SERVICE_WORKER_WARM_UP_TIMEOUT_MS });
  cy.window()
    .then({ timeout: SERVICE_WORKER_WARM_UP_TIMEOUT_MS }, (win) => {
      // Serwist only injects `window.serwist` in production builds on browsers with service workers.
      if (!('serwist' in win)) return 'skipped (this build does not register a service worker)';
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cap = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Service worker warm-up exceeded ${SERVICE_WORKER_WARM_UP_TIMEOUT_MS}ms`)),
          SERVICE_WORKER_WARM_UP_TIMEOUT_MS - (Date.now() - startedAt),
        );
      });
      const ready = win.navigator.serviceWorker.ready.then(
        (registration) => `service worker ${registration.active?.state ?? 'ready'}, precache installed`,
      );
      return Promise.race([ready, cap]).finally(() => clearTimeout(timer));
    })
    .then((result) => {
      const message = `[warm-up] ${result} in ${Date.now() - startedAt}ms`;
      cy.task('log', message);
      cy.log(message);
    });
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
