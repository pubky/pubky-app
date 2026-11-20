import { upgradeWebSocket } from '@vercel/functions';
import { bridgeSocket, maxRelayClients, maxRelayPayload, relayToken } from './bridge.mjs';
import { validTicket } from './tickets.mjs';
import { connectionSettings } from './transport.mjs';

let activeClients = 0;

export async function upgradeRelay(request, channel) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const reject = (status) => new Response(null, { status, headers });
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return reject(426);
  const url = new URL(request.url);
  if (url.search) return reject(403);
  if (process.env.VERCEL !== '1') return reject(503);
  let target;
  try {
    const settings = connectionSettings(process.env);
    const token = relayToken(settings, request.headers.get('origin'), request.headers.get('sec-websocket-protocol'));
    if (url.host !== new URL(settings.relayOrigin).host || !token || !(await validTicket(settings, token))) {
      return reject(403);
    }
    if (channel === 'electrum') target = settings.electrumTarget;
    else if (channel === 'peer') target = settings.peerTarget;
    else return reject(404);
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
