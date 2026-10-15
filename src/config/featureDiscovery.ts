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

/**
 * When the Vibes Home alert may show (epoch ms, start inclusive, end exclusive): the Lugano
 * campaign, 22 Oct 2026 08:00 UTC for two weeks. Outside it the alert stays hidden and the
 * install banner gets its slot back; the sidebar and drawer entries are not affected.
 */
export const VIBES_ALERT_WINDOW = {
  startsAt: Date.UTC(2026, 9, 22, 8),
  endsAt: Date.UTC(2026, 10, 5, 8),
} as const;
