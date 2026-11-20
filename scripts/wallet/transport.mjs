import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const lifetimeMs = 15 * 60_000;
const loopback = new Set(['127.0.0.1', '[::1]', 'localhost']);

function originOf(value, secureProtocol, localProtocol) {
  const url = new URL(value);
  if (
    (url.protocol !== secureProtocol && !(url.protocol === localProtocol && loopback.has(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Invalid wallet transport origin');
  return url.origin;
}

export function connectionSettings(env) {
  const network = env.WALLET_NETWORK;
  const primaryUri = env.WALLET_PRIMARY_URI;
  const key = env.WALLET_RELAY_SECRET;
  if (
    !['regtest', 'testnet', 'mainnet'].includes(network) ||
    !/^(02|03)[a-f0-9]{64}@/i.test(primaryUri ?? '') ||
    !/^[0-9a-f]{64}$/i.test(key ?? '')
  )
    throw new Error('Wallet transport is not configured');
  const [, address, extra] = primaryUri.split('@');
  if (!address || extra !== undefined) throw new Error('Invalid wallet primary');
  const peer = address.startsWith('iroh:') ? irohTarget(address) : socketTarget('tcp://' + address);
  const appOrigin = originOf(env.WALLET_APP_ORIGIN, 'https:', 'http:');
  const relayOrigin = originOf(env.WALLET_RELAY_ORIGIN, 'wss:', 'ws:');
  if (appOrigin.startsWith('https:') && relayOrigin.startsWith('ws:')) throw new Error('Use WSS with HTTPS');
  return { network, primaryUri, appOrigin, relayOrigin, peer, key: Buffer.from(key, 'hex') };
}

function irohTarget(address) {
  const match = /^iroh:([a-f0-9]{64})\?relay=([^&]+)$/i.exec(address);
  if (!match) throw new Error('Invalid Iroh primary');
  const relay = new URL(decodeURIComponent(match[2]));
  if (
    relay.protocol !== 'https:' ||
    relay.username ||
    relay.password ||
    relay.hash ||
    relay.search ||
    relay.pathname !== '/'
  ) {
    throw new Error('Invalid Iroh relay');
  }
  return { endpointId: match[1], relayUrl: relay.href };
}

export function socketTarget(input) {
  const url = new URL(input);
  if (
    !['tcp:', 'tls:'].includes(url.protocol) ||
    !url.hostname ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== '/')
  ) {
    throw new Error('Expected a fixed tcp:// or tls:// host and port');
  }
  const port = Number(url.port);
  if (port < 1 || port > 65535) throw new Error('Invalid target port');
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port, tls: url.protocol === 'tls:' };
}

function signature(settings, claim) {
  return createHmac('sha256', settings.key)
    .update(JSON.stringify([settings.appOrigin, settings.relayOrigin, settings.network, settings.primaryUri]))
    .update(claim)
    .digest();
}

// Only the fixed relay accepts a grant. It confers no wallet or signing authority.
export function connectionGrant(settings, now = Date.now()) {
  const expiresAt = now + lifetimeMs;
  const claim = randomBytes(24);
  claim.writeBigUInt64BE(BigInt(expiresAt));
  return {
    network: settings.network,
    // The browser's socket factory sends all peer bytes to the fixed WebSocket.
    // Give its TCP-shaped parser the selected Lightning key without invoking native Iroh in the browser.
    primaryUri: settings.peer?.endpointId
      ? settings.primaryUri.split('@')[0] + '@peer.relay:9735'
      : settings.primaryUri,
    electrum: { host: 'electrum.relay', port: 50001, tls: false },
    peerUrl: settings.relayOrigin + '/peer',
    electrumUrl: settings.relayOrigin + '/electrum',
    token: Buffer.concat([claim, signature(settings, claim)]).toString('base64url'),
    expiresAt,
  };
}

export function validGrant(settings, token, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{75}$/.test(token)) return false;
  const bytes = Buffer.from(token, 'base64url');
  const expiresAt = Number(bytes.readBigUInt64BE());
  return (
    expiresAt > now &&
    expiresAt <= now + lifetimeMs &&
    timingSafeEqual(signature(settings, bytes.subarray(0, 24)), bytes.subarray(24))
  );
}
