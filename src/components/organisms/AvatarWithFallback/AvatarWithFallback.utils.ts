import * as Config from '@/config';

/**
 * Regex pattern for validating userId format.
 * Must be exactly 52 alphanumeric characters (lowercase letters and digits).
 */
const USER_ID_PATTERN = /^[a-z0-9]{52}$/;

/**
 * Shared palette used for all fallback facehash avatars across the app.
 * The selected color remains deterministic per seed.
 */
export const FACEHASH_AVATAR_COLORS = [
  '#ec4899',
  '#f59e0b',
  '#3b82f6',
  '#f97316',
  '#10b981',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
];

interface ResolveAvatarFallbackSeedProps {
  fallbackSeed?: string | null;
  avatarUrl?: string | null;
  name?: string | null;
  defaultSeed?: string;
}

interface ResolveAvatarFallbackInitialProps {
  name?: string | null;
  seed?: string | null;
  defaultInitial?: string;
}

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
  avatarUrl,
  name,
  defaultSeed = 'user',
}: ResolveAvatarFallbackSeedProps): string {
  const normalizedFallbackSeed = fallbackSeed?.trim();
  if (normalizedFallbackSeed) return normalizedFallbackSeed;

  const userIdFromAvatarUrl = extractUserIdFromAvatarUrl(avatarUrl);
  if (userIdFromAvatarUrl) return userIdFromAvatarUrl;

  const normalizedName = name?.trim();
  if (normalizedName) return normalizedName;

  return defaultSeed;
}

export function resolveAvatarFallbackInitial({
  name,
  seed,
  defaultInitial = 'U',
}: ResolveAvatarFallbackInitialProps): string {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  const nameInitial = normalizedName
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 1);

  if (nameInitial) return nameInitial;

  const seedInitial = seed?.trim().charAt(0).toUpperCase();
  if (seedInitial) return seedInitial;

  return defaultInitial;
}
