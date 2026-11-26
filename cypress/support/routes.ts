// The list `recordRoutes` is filling, if a test is recording. One recording at a time: a later call
// points this at its own array, and listeners already attached to the document follow it.
let recordedRoutes: string[] | null = null;

// History methods this module installed. A new document has new methods, so it is wrapped again.
const wrappedHistoryMethods = new WeakSet<object>();

// Documents whose navigation and popstate listeners are already attached.
const documentsListening = new WeakSet<Document>();

// TypeScript's DOM types do not include the Navigation API yet.
type CurrentEntryNavigation = {
  addEventListener(type: 'currententrychange', listener: () => void): void;
};

const recordUrl = (url: string) => {
  if (!recordedRoutes || url.length === 0 || url === 'about:blank') return;
  if (recordedRoutes[recordedRoutes.length - 1] === url) return;
  recordedRoutes.push(url);
};

// The application iframe keeps one window object for the whole spec, while each load replaces the
// document and its history methods. Remembering the window therefore skipped every later document,
// and the signup walk was recorded as nothing. Wrap whatever `pushState` / `replaceState` are
// installed now, including Next's own patch, which calls the previous function for its own
// navigations. `window:before:load` runs before the app's scripts, so that patch captures this
// wrapper. Recording must not throw: a throw rejects the navigation.
const ensureHistoryWrapped = (win: Window) => {
  if (!win.history) return;

  const record = () => {
    try {
      recordUrl(win.location.href);
    } catch {
      // The history call has already changed the document. Swallow a read failure.
    }
  };

  const doc = win.document;
  if (doc && !documentsListening.has(doc)) {
    documentsListening.add(doc);
    const navigation: CurrentEntryNavigation | undefined = Reflect.get(win, 'navigation');
    if (navigation) navigation.addEventListener('currententrychange', record);
    win.addEventListener('popstate', record);
  }

  for (const method of ['pushState', 'replaceState'] as const) {
    const current = win.history[method];
    if (typeof current !== 'function' || wrappedHistoryMethods.has(current)) continue;
    const wrapped = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = current.apply(this, args);
      record();
      return result;
    };
    wrappedHistoryMethods.add(wrapped);
    win.history[method] = wrapped;
  }
};

// Before the app's scripts, on every document, so a load that happens before `recordRoutes` is
// still wrapped when a test starts recording.
Cypress.on('window:before:load', (win: Window) => {
  ensureHistoryWrapped(win);
});

// A visit in the next test must not append to the previous test's list.
Cypress.on('test:before:run', () => {
  recordedRoutes = null;
});

/**
 * Appends every URL the document reaches from here on to `visited`. A full load (a reload, a
 * `cy.visit`) drops the document's listeners, so the next document is instrumented from its load
 * and that load's URL is recorded.
 */
export const recordRoutes = (visited: string[]) => {
  recordedRoutes = visited;
  cy.on('window:load', (win: Window) => {
    ensureHistoryWrapped(win);
    recordUrl(win.location.href);
  });
  cy.window({ log: false }).then((win) => {
    ensureHistoryWrapped(win);
  });
};
