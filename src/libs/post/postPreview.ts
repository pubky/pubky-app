import { isPostDeleted } from '@/libs/utils/utils';
import { parseArticleContent } from './articleContent';
import { parseCollectionContent } from './collectionContent';

/**
 * Derives a human-readable, single-string preview of a post's content, used for
 * both the `<meta>` description (`generateMetadata`) and the dynamic Open Graph
 * image text. Kept in one place so the two never drift.
 *
 * Branching:
 *   - deleted        → a fixed "deleted" notice
 *   - `long` article → the parsed article title (falls back to raw content)
 *   - `collection`   → the parsed collection name (falls back to raw content)
 *   - everything else → raw content as-is
 *
 * Pure function — does not truncate; callers apply `truncateByGraphemes`.
 */
export function deriveTextPreview({ content, kind }: { content: string; kind: string }): string {
  if (isPostDeleted(content)) {
    return 'This post has been deleted by its author.';
  }
  if (kind === 'long') {
    return parseArticleContent(content)?.title || content;
  }
  if (kind === 'collection') {
    return parseCollectionContent(content)?.name ?? content;
  }
  return content;
}
