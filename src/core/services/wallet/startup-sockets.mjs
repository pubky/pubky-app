import { createRelaySocketFactory } from '@beignet/portable-engine';

const maxIdleMs = 15_000;

// A prepared socket carries no protocol bytes until Beignet takes ownership.
export function createStartupSockets(grant) {
  const WebSocket = grant.WebSocket ?? globalThis.WebSocket;
  if (!WebSocket) throw new Error('WebSocket is required');
  const { electrumUrl, peerUrl } = grant;
  const pending = new Set();
  const dialed = new Set();
  const attempts = new Map();
  let closed = false;

  function release(slot) {
    pending.delete(slot);
    clearTimeout(slot.timer);
    slot.socket.onmessage = slot.socket.onclose = slot.socket.onerror = null;
  }

  function discard(slot) {
    release(slot);
    if (slot.socket.readyState < 2) slot.socket.close();
  }

  function usable(slot) {
    return (
      Math.min(slot.until, grant.expiresAt) > Date.now() && slot.token === grant.token && slot.socket.readyState < 2
    );
  }

  function takeSocket(url, protocols) {
    dialed.add(url);
    for (const slot of pending) {
      const socket = slot.socket;
      if (!usable(slot)) {
        discard(slot);
        continue;
      }
      if (url !== slot.url) continue;
      release(slot);
      if (socket.readyState === 1) {
        // Beignet installs its open handler immediately after this constructor returns.
        queueMicrotask(() => {
          if (socket.readyState === 1) socket.onopen?.(new Event('open'));
        });
      }
      return socket;
    }
    return new WebSocket(url, protocols);
  }

  // The adapter validates both relay URLs and the ticket. Keep renewed tickets
  // visible to its normal, on-demand connections too.
  const socketFactory = createRelaySocketFactory({
    ...grant,
    get token() {
      return grant.token;
    },
    WebSocket: takeSocket,
  });

  function prepare(url, count, maxAttempts) {
    const previous = attempts.get(url) ?? 0;
    if (closed || dialed.has(url) || previous >= maxAttempts) return;
    let available = 0;
    for (const slot of pending) {
      if (!usable(slot)) discard(slot);
      else if (slot.url === url) available++;
    }
    const until = Math.min(grant.expiresAt, Date.now() + maxIdleMs);
    if (available >= count || !(until > Date.now())) return;
    attempts.set(url, previous + 1);
    for (let i = available; i < count; i++) {
      let socket;
      try {
        socket = new WebSocket(url, ['beignet.v1', 'auth.' + grant.token]);
      } catch {
        // The engine will make an ordinary connection when it needs one.
        return;
      }
      const slot = { socket, url, until, token: grant.token };
      pending.add(slot);
      socket.onmessage = socket.onclose = socket.onerror = () => discard(slot);
      slot.timer = setTimeout(() => discard(slot), until - Date.now());
    }
  }

  return {
    socketFactory,
    // An explicit unlock can replace sockets that expired while the user typed.
    prepareElectrum: () => prepare(electrumUrl, 2, 2),
    preparePeer: () => prepare(peerUrl, 1, 1),
    close() {
      closed = true;
      for (const slot of pending) discard(slot);
    },
  };
}
