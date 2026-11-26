// The list `recordRoutes` is filling, if a test is recording. One recording at a time: a later call
// points this at its own array, and listeners already attached to the document follow it.
let recordedRoutes: string[] | null = null;

// Windows whose history methods and navigation events already report into `recordedRoutes`.
const instrumented = new WeakSet<Window>();

// TypeScript's DOM types do not include the Navigation API yet. `currententrychange` fires for
// pushState and replaceState whoever holds the method, including a copy captured before we wrapped it.
type CurrentEntryNavigation = {
  addEventListener(type: 'currententrychange', listener: () => void): void;
};

const recordUrl = (url: string) => {
  if (!recordedRoutes || url.length === 0 || url === 'about:blank') return;
  if (recordedRoutes[recordedRoutes.length - 1] === url) return;
  recordedRoutes.push(url);
};

// Cypress reports `url:changed` only from its own `history.pushState` wrapper, and skips installing
// that wrapper when a new document's load begins before the previous document's unload — a
// service-worker cache makes the race intermittent. Next's app router then calls the native method
// it captured, so a client-side walk never emits `url:changed`, while `cy.location` still reads the
// address bar. `currententrychange` is the browser's own signal for those calls. Where the Navigation
// API is missing, wrap the methods that are installed now so the same calls are still observed.
const installRouteRecorder = (win: Window) => {
  if (instrumented.has(win)) return;
  instrumented.add(win);

  const record = () => recordUrl(win.location.href);
  const navigation: CurrentEntryNavigation | undefined = Reflect.get(win, 'navigation');
  if (navigation) {
    navigation.addEventListener('currententrychange', record);
    return;
  }

  const { pushState, replaceState } = win.history;
  win.history.pushState = function pushStateWrapper(this: History, ...args: Parameters<History['pushState']>) {
    const result = pushState.apply(this, args);
    record();
    return result;
  };
  win.history.replaceState = function replaceStateWrapper(this: History, ...args: Parameters<History['replaceState']>) {
    const result = replaceState.apply(this, args);
    record();
    return result;
  };
  win.addEventListener('popstate', record);
};

/**
 * Appends every URL the document reaches from here on to `visited`. A full load (a reload, a
 * `cy.visit`) drops the document's listeners, so the next document is instrumented from its load
 * and that load's URL is recorded. Does not throw; a listener that throws hangs the run.
 */
export const recordRoutes = (visited: string[]) => {
  recordedRoutes = visited;
  cy.on('window:load', (win) => {
    installRouteRecorder(win);
    recordUrl(win.location.href);
  });
  cy.window({ log: false }).then((win) => {
    installRouteRecorder(win);
  });
};
