import { createRelaySocketFactory } from '@beignet/portable-engine';
import { prepareElectrumHandshake } from './electrum-handshake.mjs';

const electrumIdleMs = 15_000;
// Beignet primaries normally allow 10 seconds for an incoming handshake.
const peerIdleMs = 5_000;

// Only the hosted mainnet transport opts into the pinned public handshake.
export function createStartupSockets(grant) {
  const WebSocket = grant.WebSocket ?? globalThis.WebSocket;
  if (!WebSocket) throw new Error('WebSocket is required');
  const { electrumUrl, peerUrl } = grant;
  const pending = new Set();
  const dialed = new Set();
  const attempts = new Map();
  let closed = false;
  let electrumDials = 0;
  const warmHandshake = grant.network === 'mainnet' && grant.fastElectrumStart === true;

  function release(slot) {
    pending.delete(slot);
    clearTimeout(slot.timer);
    if (!slot.handshake) slot.socket.onmessage = slot.socket.onclose = slot.socket.onerror = null;
  }

  function discard(slot) {
    release(slot);
    if (slot.handshake) slot.handshake.cancel();
    else if (slot.socket.readyState < 2) slot.socket.close();
  }

  function usable(slot) {
    return (
      Math.min(slot.until, grant.expiresAt) > Date.now() && slot.token === grant.token && slot.socket.readyState < 2
    );
  }

  function takeSocket(url, protocols) {
    dialed.add(url);
    const index = url === electrumUrl ? electrumDials++ : 0;
    for (const slot of pending) {
      const socket = slot.socket;
      if (!usable(slot)) {
        discard(slot);
        continue;
      }
      if (url !== slot.url || (slot.handshake && slot.index !== index)) continue;
      release(slot);
      if (slot.handshake) return slot.handshake.claim();
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
    const available = new Set();
    for (const slot of pending) {
      if (!usable(slot)) discard(slot);
      else if (slot.url === url) available.add(slot.index);
    }
    const until = Math.min(grant.expiresAt, Date.now() + (url === peerUrl ? peerIdleMs : electrumIdleMs));
    if (available.size >= count || !(until > Date.now())) return;
    attempts.set(url, previous + 1);
    for (let index = 0; index < count; index++) {
      if (available.has(index)) continue;
      const newSocket = () => new WebSocket(url, ['beignet.v1', 'auth.' + grant.token]);
      let socket;
      try {
        socket = newSocket();
      } catch {
        // The engine will make an ordinary connection when it needs one.
        return;
      }
      const slot = { socket, url, index, until, token: grant.token };
      pending.add(slot);
      slot.timer = setTimeout(() => discard(slot), until - Date.now());
      const abandon = () => discard(slot);
      if (warmHandshake && url === electrumUrl) {
        slot.handshake = prepareElectrumHandshake(socket, index === 0 ? 'genesis' : 'session', abandon, newSocket);
      } else {
        socket.onmessage = socket.onclose = socket.onerror = abandon;
      }
    }
  }

  return {
    socketFactory,
    // An explicit unlock can replace sockets that expired while the user typed.
    prepareElectrum: () => prepare(electrumUrl, 2, 2),
    // A slow node startup can outlast the first idle peer socket.
    preparePeer: () => prepare(peerUrl, 1, 2),
    close() {
      closed = true;
      for (const slot of pending) discard(slot);
    },
  };
}
