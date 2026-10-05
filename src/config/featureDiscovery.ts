export const FEATURE_DISCOVERY_STORAGE_PREFIX = 'pubky-feature-discovery';

export function buildFeatureDiscoveryStorageKey(pubky: string, featureId: string): string {
  return `${FEATURE_DISCOVERY_STORAGE_PREFIX}:${pubky}:${featureId}`;
}
