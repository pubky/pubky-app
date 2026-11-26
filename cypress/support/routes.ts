// The list `recordRoutes` is filling, if a test is recording. One recording at a time: a later call
// points this at its own array, and listeners already attached to the document follow it.
let recordedRoutes: string[] | null = null;

// Windows whose history methods and navigation events already report into `recordedRoutes`.
const instrumented = new WeakSet<Window>();

// TypeScript's DOM types do not include the Navigation API yet.
type CurrentEntryNavigation = {
  addEventListener(type: 'currententrychange', listener: () => void): void;
};

const recordUrl = (url: string) => {
  if (!recordedRoutes || url.length === 0 || url === 'about:blank') return;
  if (recordedRoutes[recordedRoutes.length - 1] === url) return;
  recordedRoutes.push(url);
};

// Cypress emits `url:changed` only from its own history wrapper, and it skips installing that wrapper
// when a new document starts loading before the previous one unloads. `currententrychange` alone
// still recorded nothing in Chrome under Cypress: the signup finished on /home with an empty list.
// Next's app router calls the live `history.pushState` / `replaceState` (including the copy it
// installed itself), so wrap whichever functions are there now and record after they return.
// `popstate` covers back and forward. Recording must not throw: a throw rejects the navigation.
const installRouteRecorder = (win: Window) => {
  if (instrumented.has(win)) return;
  instrumented.add(win);

  const record = () => {
    try {
      recordUrl(win.location.href);
    } catch {
      // The history call has already changed the document. Swallow a read failure.
    }
  };

  const navigation: CurrentEntryNavigation | undefined = Reflect.get(win, 'navigation');
  if (navigation) navigation.addEventListener('currententrychange', record);

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
 * and that load's URL is recorded.
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
