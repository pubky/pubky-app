import type { RegionPolicy } from './regionModes';

/** Where the viewer's IP country stands: being read, read (a country, or null when the edge couldn't tell), or unreadable. */
export type ClientRegionState =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; country: string | null };

/**
 * - `available`: nothing here holds paid unlocks for this viewer. That includes every deployment with no
 *   region list set, and a viewer whose region could not be read at all: this check is advisory, the Lock
 *   Server answers 451 on its own, and an unreadable region must not switch paid unlocks off for everyone.
 * - `checking`: the region is still being read.
 * - `blocked`: paid unlocks are held. `region`: the viewer's country is listed. `unknown`: the edge could
 *   not tell the country, and unknown viewers are held.
 */
export type PaidUnlockAvailability =
  { status: 'available' } | { status: 'checking' } | { status: 'blocked'; cause: 'region' | 'unknown' };

export const PAID_UNLOCKS_AVAILABLE: PaidUnlockAvailability = { status: 'available' };

/**
 * Whether the viewer may pay to unlock, or create a paid lock, by the region list the deployment sets. `nuanced`
 * and `blocked` regions both hold paid unlocks, because the Lock Server answers 451 for both.
 */
export function evaluatePaidUnlockAvailability(
  policy: RegionPolicy,
  client: ClientRegionState,
): PaidUnlockAvailability {
  if (!policy.holdsPaidUnlocks) return PAID_UNLOCKS_AVAILABLE;
  if (client.status === 'loading') return { status: 'checking' };
  if (client.status === 'failed') return PAID_UNLOCKS_AVAILABLE;
  if (client.country === null) {
    return policy.unknownMode === 'open' ? PAID_UNLOCKS_AVAILABLE : { status: 'blocked', cause: 'unknown' };
  }
  return policy.modeOf(client.country) === 'open' ? PAID_UNLOCKS_AVAILABLE : { status: 'blocked', cause: 'region' };
}
