import type { Session } from '@synonymdev/pubky';
import { MIGRATION_CAPS } from 'pubky-social-specs';
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

/**
 * Whether the session can run the social v1 migration and the 1.x app as it is: it covers
 * `MIGRATION_CAPS` (both v1 trees, the app's private namespace and the 0.x tree). A root session
 * does; a Ring session minted under the pre-port `HOMESERVER_CAPABILITIES` does not, and the gate
 * signs it out for a new grant.
 */
export function hasSocialV1Capabilities(session: Session | null): boolean {
  return session !== null && hasRequiredCapabilities(session.info.capabilities, MIGRATION_CAPS);
}
