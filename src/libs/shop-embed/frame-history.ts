import { shopHostPath } from './bridge';

export type ShopFrameSnapshot = {
  document: Document;
  history: History;
  path: string;
  state: unknown;
  scroll: { x: number; y: number };
};

export type ShopFrameHistory = {
  dispose: () => void;
  capture: () => ShopFrameSnapshot | null;
  restore: (snapshot: ShopFrameSnapshot) => boolean;
  restoreScroll: () => void;
  cancelScroll: () => void;
};

const inactiveHistory: ShopFrameHistory = {
  dispose: () => {},
  capture: () => null,
  restore: () => false,
  restoreScroll: () => {},
  cancelScroll: () => {},
};

/** Keep Next's child state while the App owns durable browser navigation entries. */
export function installShopFrameHistory(
  frameWindow: Window,
  onNavigate: (path: string, mode: 'push' | 'replace') => void,
  beforePush: () => void = () => {},
): ShopFrameHistory {
  let capture: {
    document: Document;
    history: History;
    origin: string;
    push: History['pushState'];
    replace: History['replaceState'];
    removeEventListener: Window['removeEventListener'];
    cancelAnimationFrame: Window['cancelAnimationFrame'];
  };
  try {
    const { origin, pathname, search, hash } = frameWindow.location;
    if (origin !== window.location.origin || !shopHostPath(`${pathname}${search}${hash}`)) return inactiveHistory;
    const history = frameWindow.history;
    capture = {
      document: frameWindow.document,
      history,
      origin,
      push: history.pushState,
      replace: history.replaceState,
      removeEventListener: frameWindow.removeEventListener.bind(frameWindow),
      cancelAnimationFrame: frameWindow.cancelAnimationFrame.bind(frameWindow),
    };
  } catch {
    // A frame can leave the same-origin mount before its load event is handled.
    return inactiveHistory;
  }

  let active = true;
  let pendingScroll: ShopFrameSnapshot | null = null;
  let scrollFrame: number | null = null;
  const readPath = (): string | null => {
    try {
      if (!active || frameWindow.document !== capture.document || frameWindow.history !== capture.history) return null;
      const { origin, pathname, search, hash } = frameWindow.location;
      if (origin !== capture.origin) return null;
      const path = `${pathname}${search}${hash}`;
      return shopHostPath(path) ? path : null;
    } catch {
      return null;
    }
  };
  let lastScroll = { path: readPath(), x: frameWindow.scrollX, y: frameWindow.scrollY };
  const recordScroll = () => {
    const path = readPath();
    if (path !== null && !pendingScroll) lastScroll = { path, x: frameWindow.scrollX, y: frameWindow.scrollY };
  };
  const cancelScroll = () => {
    pendingScroll = null;
    if (scrollFrame !== null) capture.cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    recordScroll();
  };
  // Input takes precedence over a delayed restoration; never move the viewport
  // back after the user has started scrolling or interacting with the page.
  const scrollIntentEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  for (const event of scrollIntentEvents) frameWindow.addEventListener(event, cancelScroll, { passive: true });
  frameWindow.addEventListener('scroll', recordScroll, { passive: true });
  const targetsShop = (url: string | URL | null | undefined): boolean => {
    if (url == null) return true;
    try {
      const target = new URL(url, capture.document.baseURI);
      return (
        target.origin === capture.origin && shopHostPath(`${target.pathname}${target.search}${target.hash}`) !== null
      );
    } catch {
      return false;
    }
  };
  const report = (mode: 'push' | 'replace') => {
    const path = readPath();
    if (path !== null) onNavigate(path, mode);
  };

  const push: History['pushState'] = function (this: History, ...args) {
    if (this !== capture.history || readPath() === null || !targetsShop(args[2])) {
      return capture.push.apply(this, args);
    }
    // Call the existing implementation, including Next's own wrapper. Forward
    // the original receiver and all arguments so its router state is retained.
    beforePush();
    cancelScroll();
    const result = capture.replace.apply(this, args);
    report('push');
    return result;
  };
  const replace: History['replaceState'] = function (this: History, ...args) {
    const shouldReport = this === capture.history && readPath() !== null;
    const result = capture.replace.apply(this, args);
    if (shouldReport) report('replace');
    return result;
  };
  // Plain same-document anchors otherwise add a child-only joint-history entry
  // which cannot survive replacing the iframe after a full App reload.
  const onAnchorClick = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      readPath() === null
    )
      return;
    const target = event.target;
    if (!target || !('nodeType' in target) || target.nodeType !== 1) return;
    const anchor = (target as Element).closest('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;
    const targetName = anchor.getAttribute('target') ?? capture.document.querySelector('base')?.target ?? '';
    if (targetName && targetName.toLowerCase() !== '_self') return;
    let destination: URL;
    try {
      destination = new URL(anchor.getAttribute('href')!, capture.document.baseURI);
    } catch {
      return;
    }
    const previous = new URL(frameWindow.location.href);
    if (
      destination.origin !== previous.origin ||
      destination.pathname !== previous.pathname ||
      destination.search !== previous.search ||
      !destination.href.includes('#')
    )
      return;
    event.preventDefault();
    if (destination.href !== previous.href) {
      push.call(capture.history, capture.history.state, '', destination.href);
      frameWindow.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: previous.href, newURL: destination.href }));
    }
    let fragment = destination.hash.slice(1);
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
      /* Browsers retain malformed escape sequences in fragments. */
    }
    const element = capture.document.getElementById(fragment) ?? capture.document.getElementsByName(fragment)[0];
    if (element) element.scrollIntoView();
    else if (!fragment || fragment.toLowerCase() === 'top') frameWindow.scrollTo(0, 0);
  };
  frameWindow.addEventListener('click', onAnchorClick);
  const cleanup = () => {
    active = false;
    // Keep cleanup tied to the installed realm: its WindowProxy may now expose
    // a cross-origin document where looking up these methods would throw.
    capture.removeEventListener('scroll', recordScroll);
    capture.removeEventListener('click', onAnchorClick);
    for (const event of scrollIntentEvents) capture.removeEventListener(event, cancelScroll);
    cancelScroll();
    // Next may have installed another wrapper since ours. Its captured callback
    // can still reach these functions, which become native pass-throughs above.
    if (capture.history.pushState === push) capture.history.pushState = capture.push;
    if (capture.history.replaceState === replace) capture.history.replaceState = capture.replace;
  };
  capture.history.pushState = push;
  capture.history.replaceState = replace;
  return {
    dispose: cleanup,
    cancelScroll,
    capture: () => {
      const path = readPath();
      return path === null
        ? null
        : {
            document: capture.document,
            history: capture.history,
            path,
            state: capture.history.state,
            scroll:
              pendingScroll?.path === path
                ? pendingScroll.scroll
                : lastScroll.path === path
                  ? { x: lastScroll.x, y: lastScroll.y }
                  : { x: frameWindow.scrollX, y: frameWindow.scrollY },
          };
    },
    restore: (snapshot) => {
      // Only Next App Router entries from this exact living document are safe to
      // traverse. An entry surviving a reload has a URL, but no live router cache.
      if (
        readPath() === null ||
        snapshot.document !== capture.document ||
        snapshot.history !== capture.history ||
        !snapshot.state ||
        typeof snapshot.state !== 'object' ||
        !('__NA' in snapshot.state) ||
        !snapshot.state.__NA
      )
        return false;
      cancelScroll();
      pendingScroll = snapshot;
      // __NA makes an installed Next wrapper retain the destination's captured
      // tree. popstate then restores its route from the existing segment cache.
      capture.replace.call(capture.history, snapshot.state, '', snapshot.path);
      frameWindow.dispatchEvent(new PopStateEvent('popstate', { state: snapshot.state }));
      return true;
    },
    restoreScroll: () => {
      const snapshot = pendingScroll;
      if (!snapshot || readPath() !== snapshot.path) return;
      if (scrollFrame !== null) capture.cancelAnimationFrame(scrollFrame);
      // Next can commit a short loading skeleton before local catalog queries
      // render the rows. Give that content up to one second to fit the saved
      // position, then let the browser clamp it if the page really is shorter.
      const deadline = frameWindow.performance.now() + 1000;
      const applyScroll: FrameRequestCallback = (time) => {
        scrollFrame = null;
        if (pendingScroll !== snapshot) return;
        if (readPath() !== snapshot.path) {
          cancelScroll();
          return;
        }
        const root = capture.document.documentElement;
        const maxY = Math.max(0, (root?.scrollHeight ?? 0) - frameWindow.innerHeight);
        const maxX = Math.max(0, (root?.scrollWidth ?? 0) - frameWindow.innerWidth);
        if ((snapshot.scroll.y > maxY || snapshot.scroll.x > maxX) && time < deadline) {
          scrollFrame = frameWindow.requestAnimationFrame(applyScroll);
          return;
        }
        frameWindow.scrollTo(snapshot.scroll.x, snapshot.scroll.y);
        pendingScroll = null;
        recordScroll();
      };
      scrollFrame = frameWindow.requestAnimationFrame(applyScroll);
    },
  };
}
