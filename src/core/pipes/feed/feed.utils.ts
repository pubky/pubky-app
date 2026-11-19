import { canonicalizeTagLabel } from '@/libs/utils/utils';

/**
 * The tag list a feed filter stores, folded the way the data model folds a label
 * (`canonicalizeTagLabel`: frozen-whitespace trim, ASCII letters lowercased, every other character
 * kept), blank labels dropped and duplicates removed. `buildFeed` folds again and sorts; folding here
 * the same way keeps the id the app hashes equal to the one spec-folding clients compute.
 */
export function normalizeTagList(tags: string[] | undefined | null): string[] {
  if (!tags) return [];
  return [...new Set(tags.map(canonicalizeTagLabel).filter((tag) => tag.length > 0))];
}
