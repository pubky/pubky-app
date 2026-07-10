export const COLLECTIONS_NAV_NEW_BADGE_ENABLED = true;
export const COLLECTIONS_NAV_NEW_BADGE_STORAGE_ID = 'collections-nav-v1';
export const FEATURE_DISCOVERY_STORAGE_PREFIX = 'pubky-feature-discovery';

export function buildFeatureDiscoveryStorageKey(pubky: string, featureId: string): string {
  return `${FEATURE_DISCOVERY_STORAGE_PREFIX}:${pubky}:${featureId}`;
}
