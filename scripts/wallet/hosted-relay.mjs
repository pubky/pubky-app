import { upgradeWebSocket } from '@vercel/functions';
import { acceptsRelayGrant, bridgeSocket, maxRelayClients, maxRelayPayload } from './bridge.mjs';
import { connectionSettings, socketTarget } from './transport.mjs';

let activeClients = 0;

export async function upgradeRelay(request, channel) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const reject = (status) => new Response(null, { status, headers });
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return reject(426);
  if (new URL(request.url).search) return reject(403);
  let target;
  try {
    const settings = connectionSettings(process.env);
    if (!acceptsRelayGrant(settings, request.headers.get('origin'), request.headers.get('sec-websocket-protocol'))) {
      return reject(403);
    }
    if (channel === 'electrum') target = socketTarget(process.env.WALLET_ELECTRUM);
    else if (channel === 'peer') {
      target = process.env.WALLET_PEER_TUNNEL ? socketTarget(process.env.WALLET_PEER_TUNNEL) : settings.peer;
    } else return reject(404);
  } catch {
    return reject(503);
  }
  if (activeClients >= maxRelayClients) return reject(429);
  activeClients++;
  let released = false;
  const release = () => {
    if (!released) activeClients--;
    released = true;
  };
  try {
    return await upgradeWebSocket(
      (ws) => {
        ws.once('close', release);
        bridgeSocket(ws, target);
      },
      { maxPayload: maxRelayPayload },
    );
  } catch {
    release();
    return reject(503);
  }
}
