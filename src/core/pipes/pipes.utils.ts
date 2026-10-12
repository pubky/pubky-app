import type { Pubky } from '@/models/models.types';

/**
 * The `pubky://` URL of an owner-relative path from `deletionPaths` or a plan. The package has
 * `toPath` for the other direction only.
 */
export function ownerPathToUrl(owner: Pubky, path: string): string {
  return `pubky://${owner}${path}`;
}
