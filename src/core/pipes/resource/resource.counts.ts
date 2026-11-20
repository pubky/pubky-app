import type { TResourceCounts } from '@/services/nexus/resource/resource.types';

/**
 * The counts of one resource read on several spellings of its link (Nexus counts each apart; the
 * link itself first): `undefined` while the link itself is not read, `null` when Nexus knows none of
 * the spellings read, else the counts summed (a collection holding two spellings counts twice)
 * under the first known spelling's id, with every known spelling's id in `resourceIds` (the replies
 * are read from each). A spelling not read yet, or whose read failed, is left out until it is read.
 * One answer comes back as it is.
 */
export function mergeResourceCounts(
  answers: readonly (TResourceCounts | null | undefined)[],
): TResourceCounts | null | undefined {
  if (answers.length <= 1 || answers[0] === undefined) return answers[0];
  const known = answers.filter((answer): answer is TResourceCounts => Boolean(answer));
  if (known.length === 0) return null;
  const sum = (field: 'replies' | 'embeds' | 'collections') =>
    known.some((answer) => answer[field] !== undefined)
      ? known.reduce((total, answer) => total + (answer[field] ?? 0), 0)
      : undefined;
  return {
    resourceId: known[0].resourceId,
    resourceIds: known.map((answer) => answer.resourceId),
    replies: sum('replies'),
    embeds: sum('embeds'),
    collections: sum('collections'),
  };
}
