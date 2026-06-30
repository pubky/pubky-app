import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';

/**
 * Distinct authors of a list of collection composite ids, in first-seen
 * order. Malformed ids are skipped. Shared by the Collections sections
 * to derive the `AvatarStack` pubkys from their visible card ids.
 */
export function uniqueAuthors(compositeIds: string[]): Pubky[] {
  const seen = new Set<string>();
  const out: Pubky[] = [];
  for (const id of compositeIds) {
    try {
      const { pubky } = parseCompositeId(id);
      if (!seen.has(pubky)) {
        seen.add(pubky);
        out.push(pubky);
      }
    } catch {
      // Skip malformed ids.
    }
  }
  return out;
}
