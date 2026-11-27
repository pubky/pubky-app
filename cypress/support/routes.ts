// The list `recordRoutes` is filling, if a test is recording. One recording at a time: a later call
// points this at its own array, and wrappers already installed follow it.
let recordedRoutes: string[] | null = null;

const recordUrl = (url: string) => {
  if (!recordedRoutes || url.length === 0 || url === 'about:blank') return;
  if (recordedRoutes[recordedRoutes.length - 1] === url) return;
  recordedRoutes.push(url);
};

// Cypress reports `url:changed` only from its own history wrapper and skips installing it when a new
// document's load begins before the previous document's unload — a race the service worker makes
// intermittent — and the Navigation API's `currententrychange` recorded nothing in Chrome under
// Cypress. So wrap `pushState` / `replaceState` directly. The application iframe keeps one window
// object for the whole spec, while each load replaces the document and its history methods, so the
// wrap happens here, on every document, before the app's scripts run: Next's own patch installs
// after this hook, captures this wrapper, and its client-side routes are recorded too. `popstate`
// covers back and forward. Recording must not throw: a throw rejects the navigation.
Cypress.on('window:before:load', (win: Window) => {
  const record = () => {
    try {
      recordUrl(win.location.href);
    } catch {
      // The history call has already changed the document. Swallow a read failure.
    }
  };

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = win.history[method];
    win.history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      record();
      return result;
    };
  }
  win.addEventListener('popstate', record);

  // A full load (a `cy.visit`, a reload) calls no history method: record where it lands.
  record();
});

// A visit in the next test must not append to the previous test's list.
Cypress.on('test:before:run', () => {
  recordedRoutes = null;
});

/**
 * Appends every URL the document reaches from here on to `visited`.
 *
 * The sink is assigned when the command queue reaches this call, not when the caller runs: callers
 * such as `signInWithPubkyRing` invoke `recordRoutes` while they are still queueing the sign-in, so
 * assigning here would record pages the test only starts watching later (its own `/sign-in` visit).
 */
export const recordRoutes = (visited: string[]) => {
  cy.then(() => {
    recordedRoutes = visited;
  });
};
