import { parseSessionBridgeAllowlist } from './allowlist';

/**
 * Client-safe allowlist reader for the isolated `/session-bridge` route.
 * Inlines `process.env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS` and reuses
 * `parseSessionBridgeAllowlist` so this module never imports `@/libs/env/env`.
 */
export function readSessionBridgeAllowlistFromEnv(): string[] {
  return parseSessionBridgeAllowlist(process.env.NEXT_PUBLIC_SESSION_BRIDGE_ALLOWED_ORIGINS);
}
