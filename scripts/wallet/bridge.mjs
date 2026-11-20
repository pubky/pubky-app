import net from 'node:net';
import tls from 'node:tls';
import { createWebSocketStream } from 'ws';
import { bridgeIroh } from './iroh.mjs';
import { validGrant } from './transport.mjs';

export const maxRelayPayload = 1024 * 1024;
export const maxRelayClients = 256;

export function relayToken(settings, origin, protocolHeader) {
  const protocols = (protocolHeader ?? '').split(',').map((part) => part.trim());
  const auth = protocols.find((part) => part.startsWith('auth.'));
  // The hosted adapter negotiates the first offered protocol. The grant must never be echoed.
  return origin === settings.appOrigin && protocols[0] === 'beignet.v1' && auth ? auth.slice(5) : null;
}

export function acceptsRelayGrant(settings, origin, protocolHeader) {
  const token = relayToken(settings, origin, protocolHeader);
  return !!token && validGrant(settings, token);
}

export function bridgeSocket(ws, target) {
  if (target.endpointId) {
    void bridgeIroh(ws, target);
    return;
  }
  const upstream = target.tls
    ? tls.connect({
        host: target.host,
        port: target.port,
        servername: net.isIP(target.host) ? undefined : target.host,
      })
    : net.connect(target.port, target.host);
  const stream = createWebSocketStream(ws);
  const timer = setTimeout(() => upstream.destroy(new Error('Connection timed out')), 15_000);
  const cleanup = () => {
    clearTimeout(timer);
    upstream.destroy();
  };
  ws.on('close', cleanup);
  stream.on('error', cleanup);
  upstream.on('error', () => ws.close(1011, 'BEIGNET_UPSTREAM_UNAVAILABLE'));
  upstream.on('close', () => ws.close());
  upstream.once(target.tls ? 'secureConnect' : 'connect', () => {
    clearTimeout(timer);
    stream.pipe(upstream).pipe(stream);
  });
}
