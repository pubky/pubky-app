import type { Session } from '@synonymdev/pubky';
import { HOMESERVER_CAPABILITIES } from '@/config/network';
import { hasCapabilities } from '@/libs/auth/capabilities';

/** Use the same effective permission check as grant adoption and authorization requests. */
export function hasRequiredCapabilities(granted: readonly string[], required: string): boolean {
  return hasCapabilities(
    granted,
    required.split(',').map((entry) => entry.trim()),
  );
}

/**
 * A session minted before an entry was added to `HOMESERVER_CAPABILITIES` keeps its old list for
 * life; the homeserver then rejects every request under the missing scope (#2373).
 */
export function sessionNeedsUpgrade(session: Session | null): boolean {
  return session !== null && !hasRequiredCapabilities(session.info.capabilities, HOMESERVER_CAPABILITIES);
}
