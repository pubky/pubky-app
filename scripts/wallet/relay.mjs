import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { acceptsRelayGrant, bridgeSocket, maxRelayClients, maxRelayPayload } from './bridge.mjs';
import { connectionSettings, socketTarget } from './transport.mjs';

export function createRelay(settings, electrum, peer = settings.peer) {
  const server = createServer((_request, response) => response.writeHead(404).end());
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: maxRelayPayload,
    perMessageDeflate: false,
    handleProtocols: () => 'beignet.v1',
  });
  server.on('upgrade', (request, socket, head) => {
    const target = request.url === '/electrum' ? electrum : request.url === '/peer' ? peer : null;
    if (
      !target ||
      !acceptsRelayGrant(settings, request.headers.origin, request.headers['sec-websocket-protocol']) ||
      sockets.clients.size >= maxRelayClients
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => bridgeSocket(ws, target));
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
