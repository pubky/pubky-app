import type { Session } from '@synonymdev/pubky';
import { HOMESERVER_CAPABILITIES, SOCIAL_V1_CAPABILITIES } from '@/config/network';
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

/**
 * Whether the session can run a social v1 migration as it is. A root session can; a Ring session
 * minted under `HOMESERVER_CAPABILITIES` cannot until the user approves the migration grant.
 */
export function hasSocialV1Capabilities(session: Session | null): boolean {
  return session !== null && hasRequiredCapabilities(session.info.capabilities, SOCIAL_V1_CAPABILITIES);
}
