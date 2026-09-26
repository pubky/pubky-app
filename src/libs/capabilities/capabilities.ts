import type { Session } from '@synonymdev/pubky';
import { HOMESERVER_CAPABILITIES } from '@/config/network';

type Capability = { scope: string; actions: string };

/** `<scope>:<actions>`, as the homeserver serialises it (`/pub/app/:rw`, root is `/:rw`). */
const parseCapability = (entry: string): Capability | null => {
  const separator = entry.lastIndexOf(':');
  if (separator <= 0) return null;
  return { scope: entry.slice(0, separator), actions: entry.slice(separator + 1) };
};

// Mirrors the homeserver's rule: only a directory scope (trailing `/`) covers descendants,
// a file scope matches that one path. A plain prefix test would let `/pub/app` cover `/pub/apple`.
const scopeCovers = (scope: string, path: string): boolean =>
  scope === path || (scope.endsWith('/') && path.startsWith(scope));

const covers = (granted: Capability, required: Capability): boolean =>
  scopeCovers(granted.scope, required.scope) &&
  [...required.actions].every((action) => granted.actions.includes(action));

/** Whether every entry of `required` (comma-separated) is covered by some entry of `granted`. Exported for tests. */
export function hasRequiredCapabilities(granted: readonly string[], required: string): boolean {
  const grantedCapabilities = granted.map(parseCapability).filter((cap): cap is Capability => cap !== null);
  return required
    .split(',')
    .map((entry) => parseCapability(entry.trim()))
    .every(
      (requiredCapability) =>
        requiredCapability !== null && grantedCapabilities.some((cap) => covers(cap, requiredCapability)),
    );
}

/**
 * A session minted before an entry was added to `HOMESERVER_CAPABILITIES` keeps its old list for
 * life; the homeserver then rejects every request under the missing scope (#2373).
 */
export function sessionNeedsUpgrade(session: Session | null): boolean {
  return session !== null && !hasRequiredCapabilities(session.info.capabilities, HOMESERVER_CAPABILITIES);
}
