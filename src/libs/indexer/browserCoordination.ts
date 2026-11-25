import type { Coordination, CoordinationMessage } from './runtime.types';

// The one file that touches browser APIs, so the rest of the library runs anywhere.

const DEFAULT_NAME = 'pubky-indexer';
const MESSAGE_TYPES = new Set(['changed', 'leader', 'request', 'settled', 'synced']);

/** The two browser capabilities coordination needs, injected in tests. */
export interface BrowserApis {
  requestLock(name: string, task: () => Promise<void>): Promise<void>;
  openChannel(name: string): {
    post(message: unknown): void;
    listen(listener: (data: unknown) => void): void;
  };
}

/** Web Locks and BroadcastChannel, `null` when either is missing. */
export function browserApis(): BrowserApis | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator) || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  const { locks } = navigator;
  return {
    requestLock: async (name, task) => {
      await locks.request(name, () => task());
    },
    openChannel: (name) => {
      const channel = new BroadcastChannel(name);
      return {
        post: (message) => channel.postMessage(message),
        listen: (listener) => channel.addEventListener('message', (event: MessageEvent) => listener(event.data)),
      };
    },
  };
}

// Only this library's tabs post on the channel; the check keeps a stray message from reaching the runtime.
const isMessage = (data: unknown): data is CoordinationMessage =>
  typeof data === 'object' &&
  data !== null &&
  'type' in data &&
  typeof data.type === 'string' &&
  MESSAGE_TYPES.has(data.type);

/**
 * Coordination between the tabs of one origin that share `name`, `null` where the browser cannot provide it. The
 * name scopes both the locks and the channel, so pass one per store, such as its database name: tabs of two
 * accounts under one name would hear each other's changes.
 */
export function createBrowserCoordination(
  apis: BrowserApis | null = browserApis(),
  name = DEFAULT_NAME,
): Coordination | null {
  if (apis === null) return null;
  const channel = apis.openChannel(name);
  const listeners = new Set<(message: CoordinationMessage) => void>();
  channel.listen((data) => {
    if (!isMessage(data)) return;
    for (const listener of listeners) listener(data);
  });
  return {
    runExclusive: (lock, task) => apis.requestLock(`${name}/${lock}`, task),
    post: (message) => channel.post(message),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
