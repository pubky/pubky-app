export const FEATURE_DISCOVERY_STORAGE_PREFIX = 'pubky-feature-discovery';

export function buildFeatureDiscoveryStorageKey(pubky: string, featureId: string): string {
  return `${FEATURE_DISCOVERY_STORAGE_PREFIX}:${pubky}:${featureId}`;
}

/**
 * Feature-discovery storage id for the Pubky Vibes Home alert (composed with
 * `buildFeatureDiscoveryStorageKey`). v2: the shared reminder format (`done` instead of `tried`).
 */
export const VIBES_ALERT_STORAGE_ID = 'vibes-alert-v2';

/** Escalating "Later" snooze schedule for the Vibes alert; the last delay repeats. */
export const VIBES_REMINDER_DELAYS_MS = [24, 72, 168].map((hours) => hours * 60 * 60 * 1000);
