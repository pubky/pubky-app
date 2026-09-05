import { getSessionBridgeEarlyWindow, SESSION_BRIDGE_DISPATCH_KEY, SESSION_BRIDGE_PENDING_KEY } from './early-listener';
import { createSessionBridgeHandler } from './handler';
import { readPersistedSessionExport } from './persisted-session';
import { readSessionBridgeAllowlistFromEnv } from './read-allowlist';

type InstalledBridge = {
  handleMessage: (event: MessageEvent) => void;
  handleStorage: (event: StorageEvent) => void;
  usesEarlyDispatch: boolean;
  installCount: number;
};

let installed: InstalledBridge | null = null;

export function isSessionBridgeEmbedded(win: Window = window): boolean {
  return win.top !== win.self;
}

function drainPending(handleMessage: (event: MessageEvent) => void, win: Window): void {
  const early = getSessionBridgeEarlyWindow(win);
  const pending = early[SESSION_BRIDGE_PENDING_KEY];
  if (!Array.isArray(pending)) {
    return;
  }

  while (pending.length > 0) {
    const event = pending.shift();
    if (event !== undefined) {
      handleMessage(event);
    }
  }
}

/**
 * Attaches the session-bridge handler once per page. Safe to call from
 * `useLayoutEffect` (Strict Mode remounts increment a refcount).
 *
 * Limitation: without the layout's early inline script, requests that arrive
 * before this function runs are dropped. With the script, they are queued and
 * drained here (one reply per request, one storage subscriber).
 */
export function installSessionBridgeListeners(win: Window = window): () => void {
  if (!isSessionBridgeEmbedded(win)) {
    return () => undefined;
  }

  if (installed === null) {
    const handler = createSessionBridgeHandler({
      allowlist: readSessionBridgeAllowlistFromEnv(),
      getSessionExport: () => readPersistedSessionExport(win.localStorage),
    });

    const handleMessage = (event: MessageEvent) => {
      handler.handleMessage(event);
    };
    const handleStorage = (event: StorageEvent) => {
      handler.handleStorage(event);
    };

    const early = getSessionBridgeEarlyWindow(win);
    const usesEarlyDispatch = typeof early[SESSION_BRIDGE_DISPATCH_KEY] === 'function';

    if (usesEarlyDispatch) {
      early[SESSION_BRIDGE_DISPATCH_KEY] = handleMessage;
      drainPending(handleMessage, win);
    } else {
      win.addEventListener('message', handleMessage);
    }

    win.addEventListener('storage', handleStorage);

    installed = {
      handleMessage,
      handleStorage,
      usesEarlyDispatch,
      installCount: 0,
    };
  }

  installed.installCount += 1;

  return () => {
    if (installed === null) {
      return;
    }

    installed.installCount -= 1;
    if (installed.installCount > 0) {
      return;
    }

    if (installed.usesEarlyDispatch) {
      const early = getSessionBridgeEarlyWindow(win);
      early[SESSION_BRIDGE_DISPATCH_KEY] = (event: MessageEvent) => {
        const pending = early[SESSION_BRIDGE_PENDING_KEY];
        if (Array.isArray(pending)) {
          pending.push(event);
        }
      };
    } else {
      win.removeEventListener('message', installed.handleMessage);
    }

    win.removeEventListener('storage', installed.handleStorage);
    installed = null;
  };
}

export function resetSessionBridgeInstallForTests(): void {
  installed = null;
}
