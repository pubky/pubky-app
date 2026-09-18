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
/**
 * Whether the preview `deriveTextPreview` derives for this post is post copy
 * the app links mentions in (`PostText`), rather than an article title or a
 * collection name, which the app shows verbatim. A `long` post whose content is
 * not an article envelope previews its raw content, and that copy does get
 * mention links in the app. Shared by the page description and the OG card so
 * the two never disagree on which previews resolve mentions.
 */
export function isMentionResolvablePreview({ content, kind }: { content: string; kind: string }): boolean {
  if (isPostDeleted(content)) return false;
  if (kind === 'long') return parseArticleContent(content) === null;
  return kind !== 'collection';
}

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
