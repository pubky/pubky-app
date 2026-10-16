import { shopHostPath } from './bridge';

/** Keep Next's child state while the App owns durable browser navigation entries. */
export function installShopFrameHistory(
  frameWindow: Window,
  onNavigate: (path: string, mode: 'push' | 'replace') => void,
): () => void {
  let capture: {
    document: Document;
    history: History;
    origin: string;
    push: History['pushState'];
    replace: History['replaceState'];
  };
  try {
    const { origin, pathname, search, hash } = frameWindow.location;
    if (origin !== window.location.origin || !shopHostPath(`${pathname}${search}${hash}`)) return () => {};
    const history = frameWindow.history;
    capture = {
      document: frameWindow.document,
      history,
      origin,
      push: history.pushState,
      replace: history.replaceState,
    };
  } catch {
    // A frame can leave the same-origin mount before its load event is handled.
    return () => {};
  }

  let active = true;
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
  const cleanup = () => {
    active = false;
    // Next may have installed another wrapper since ours. Its captured callback
    // can still reach these functions, which become native pass-throughs above.
    if (capture.history.pushState === push) capture.history.pushState = capture.push;
    if (capture.history.replaceState === replace) capture.history.replaceState = capture.replace;
  };
  capture.history.pushState = push;
  capture.history.replaceState = replace;
  return cleanup;
}
