/**
 * Observes the relay ACK the SDK auth listener sends once it has received an approval: `DELETE {relay}/{channel}`
 * through the global `fetch` (the SDK has no fetch option). Until that request is issued the relay still holds the
 * approval, so a freed flow can be resumed. Once it is issued the relay may already have dropped it, and SDK 0.16.2
 * queues the approval for `tryPollOnce` after the ACK settles whatever its outcome, so only the live flow can
 * deliver it. `homeserver.grant-hidden-ios.contract.test.ts` pins this against the real SDK.
 */

type TAckWatcher = (url: string) => void;

const watchers = new Set<TAckWatcher>();
let wrappedFetch: typeof fetch | null = null;
let innerFetch: typeof fetch | null = null;

const requestTarget = (input: RequestInfo | URL, init?: RequestInit): { method: string; url: string } => {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
  return {
    method: (init?.method ?? request?.method ?? 'GET').toUpperCase(),
    url: request ? request.url : input instanceof URL ? input.href : String(input),
  };
};

const install = () => {
  if (typeof globalThis.fetch !== 'function' || globalThis.fetch === wrappedFetch) return;
  const inner = globalThis.fetch;
  const wrapped: typeof fetch = function (this: unknown, input, init) {
    const { method, url } = requestTarget(input, init);
    if (method === 'DELETE') for (const watcher of watchers) watcher(url);
    return inner.call(this, input, init);
  };
  innerFetch = inner;
  wrappedFetch = wrapped;
  globalThis.fetch = wrapped;
};

const uninstall = () => {
  // Another wrapper installed after ours keeps calling it; with no watchers it only passes requests through.
  if (wrappedFetch && globalThis.fetch === wrappedFetch && innerFetch) globalThis.fetch = innerFetch;
  wrappedFetch = null;
  innerFetch = null;
};

/**
 * Starts watching for an ACK to any channel under `relayBase` (the relay passed to the SDK flow). `sent()` stays
 * true once an ACK was issued; call `stop()` when the flow settles.
 */
export const watchRelayAcks = (relayBase: string): { sent: () => boolean; stop: () => void } => {
  const prefix = `${relayBase.replace(/\/+$/, '')}/`;
  let sent = false;
  const watcher: TAckWatcher = (url) => {
    if (url.startsWith(prefix)) sent = true;
  };
  watchers.add(watcher);
  install();
  let stopped = false;
  return {
    sent: () => sent,
    stop: () => {
      if (stopped) return;
      stopped = true;
      watchers.delete(watcher);
      if (watchers.size === 0) uninstall();
    },
  };
};
