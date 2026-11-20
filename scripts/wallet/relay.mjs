import { createServer } from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';
import { createWebSocketStream,WebSocketServer } from 'ws';
import { connectionSettings, socketTarget, validGrant } from './transport.mjs';

export function createRelay(settings, electrum, peer = settings.peer) {
  const server = createServer((_request, response) => response.writeHead(404).end());
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
    handleProtocols: () => 'beignet.v1',
  });
  server.on('upgrade', (request, socket, head) => {
    const target = request.url === '/electrum' ? electrum : request.url === '/peer' ? peer : null;
    const protocols = (request.headers['sec-websocket-protocol'] ?? '').split(',').map((part) => part.trim());
    const auth = protocols.find((part) => part.startsWith('auth.'));
    if (
      !target ||
      request.headers.origin !== settings.appOrigin ||
      !protocols.includes('beignet.v1') ||
      !auth ||
      !validGrant(settings, auth.slice(5)) ||
      sockets.clients.size >= 256
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => {
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
    });
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = connectionSettings(process.env);
  const electrum = socketTarget(process.env.WALLET_ELECTRUM);
  const peer = process.env.WALLET_PEER_TUNNEL ? socketTarget(process.env.WALLET_PEER_TUNNEL) : config.peer;
  createRelay(config, electrum, peer).listen(Number(process.env.WALLET_RELAY_PORT || 8790), '127.0.0.1', () => {
    console.info('Wallet relay listening on loopback for ' + config.network);
  });
}
