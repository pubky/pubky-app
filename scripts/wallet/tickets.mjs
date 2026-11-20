import { createHash, randomBytes } from 'node:crypto';
import { getCache } from '@vercel/functions';
import { grantResponse, lifetimeMs } from './transport.mjs';

export function ticketCache() {
  // getCache also supports a single-process development fallback. A hosted issuer needs shared storage.
  const requestCache = globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.cache;
  if (!requestCache) {
    const endpoint = process.env.RUNTIME_CACHE_ENDPOINT;
    const headers = process.env.RUNTIME_CACHE_HEADERS;
    if (!endpoint || !headers || process.env.RUNTIME_CACHE_DISABLE_BUILD_CACHE === 'true' || !JSON.parse(headers)) {
      throw new Error('Shared wallet relay cache unavailable');
    }
  }
  // The SDK's default hash shortens keys to 32 bits. Preserve every bit of our SHA-256 digest.
  return getCache({ namespace: 'wallet-relay-v1', keyHashFunction: (digest) => digest });
}

function ticketKey(settings, token) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        settings.deploymentHost,
        settings.appOrigin,
        settings.relayOrigin,
        settings.network,
        settings.primaryUri,
        settings.electrumTarget,
        settings.peerTarget,
        token,
      ]),
    )
    .digest('hex');
}

export async function issueTicket(settings, cache = ticketCache(), now = Date.now()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + lifetimeMs;
  const key = ticketKey(settings, token);
  await cache.set(key, expiresAt, { ttl: lifetimeMs / 1000, name: '' });
  if ((await cache.get(key)) !== expiresAt) throw new Error('Relay ticket cache unavailable');
  return grantResponse(settings, token, expiresAt);
}

export async function validTicket(settings, token, cache = ticketCache(), now = Date.now()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const expiresAt = await cache.get(ticketKey(settings, token));
  return Number.isSafeInteger(expiresAt) && expiresAt > now && expiresAt <= now + lifetimeMs;
}
