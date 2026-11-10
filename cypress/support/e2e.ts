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
import './console-log';
import { skipTestsOutsideMobileSubset } from './mobile';

skipTestsOutsideMobileSubset();

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

// The default `top` puts an action's target at the viewport's top edge, under the sticky header.
// WebKit then scrolls to reveal the element Cypress focuses on mousedown, so the mouseup and click
// land on whatever moved under the pointer, and the target never gets its click.
if (Cypress.isBrowser('webkit')) {
  Cypress.config('scrollBehavior', 'center');
}
