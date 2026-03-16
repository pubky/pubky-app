import * as Config from '@/config';
import * as Libs from '@/libs';
import type { ResolveAvatarFallbackSeedProps, ResolveAvatarFallbackInitialProps } from './AvatarWithFallback.types';

/**
 * Regex pattern for validating userId format.
 * Must be exactly 52 alphanumeric characters (lowercase letters and digits).
 */
const USER_ID_PATTERN = /^[a-z0-9]{52}$/;

/**
 * Extracts the userId from an avatar URL.
 *
 * The expected URL format is: `${CDN_URL}/avatar/${userId}`
 * where userId is a 52-character lowercase alphanumeric string.
 *
 * @param avatarUrl - The full avatar URL to extract the userId from
 * @returns The userId if extraction and validation succeed, null otherwise
 *
 * @example
 * ```ts
 * const userId = extractUserIdFromAvatarUrl('https://nexus.staging.pubky.app/static/avatar/6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy');
 * // '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy'
 * ```
 */
export function extractUserIdFromAvatarUrl(avatarUrl: string | undefined | null): string | null {
  if (!avatarUrl) return null;

  const expectedPrefix = `${Config.CDN_URL}/avatar/`;

  if (!avatarUrl.startsWith(expectedPrefix)) return null;

  // Extract the userId portion (everything after the prefix, excluding query params)
  const userIdWithParams = avatarUrl.slice(expectedPrefix.length);
  const userId = userIdWithParams.split('?')[0]; // Remove query params like ?v=12345

  if (!USER_ID_PATTERN.test(userId)) return null;

  return userId;
}

export function resolveAvatarFallbackSeed({
  fallbackSeed,
  userId,
  name,
  defaultSeed = 'user',
}: ResolveAvatarFallbackSeedProps): string {
  const normalizedFallbackSeed = typeof fallbackSeed === 'string' ? fallbackSeed.trim() : '';
  if (normalizedFallbackSeed) return normalizedFallbackSeed;

  if (userId) return userId;

  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (normalizedName) return normalizedName;

  return defaultSeed;
}

export function resolveAvatarFallbackInitial({
  name,
  seed,
  defaultInitial = 'U',
}: ResolveAvatarFallbackInitialProps): string {
  const nameInitial = Libs.extractInitials({ name: name ?? '', maxLength: 1 });
  if (nameInitial) return nameInitial;

  const seedInitial = typeof seed === 'string' ? seed.trim().charAt(0).toUpperCase() : '';
  if (seedInitial) return seedInitial;

  return defaultInitial;
}
