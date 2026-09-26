import { isPostDeleted } from '@/libs/utils/utils';
import { parseArticleContent } from './articleContent';
import { parseCollectionContent } from './collectionContent';
import { DEFAULT_LOCK_TITLE, parseLockTeaserContent } from './lockTeaser';

/**
 * Derives a human-readable, single-string preview of a post's content, used by the `<meta>`
 * description (`generateMetadata`), the dynamic Open Graph image text and the notification row
 * label. Kept in one place so those surfaces never drift.
 *
 * Branching:
 *   - deleted        → a fixed "deleted" notice
 *   - lock teaser    → the lock title, or the default title, as the lock card itself labels it
 *   - `long` article → the parsed article title (falls back to raw content)
 *   - `collection`   → the parsed collection name (falls back to raw content)
 *   - everything else → raw content as-is
 *
 * Pure function — does not truncate; callers apply `truncateByGraphemes`.
 */
export function deriveTextPreview({
  content,
  kind,
  lock,
}: {
  content: string;
  kind: string;
  /** The post's `lock` URL, or null. Required so a new surface cannot silently skip the lock branch. */
  lock: string | null;
}): string {
  if (isPostDeleted(content)) {
    return 'This post has been deleted by its author.';
  }
  // A lock announcement's `kind` is the teaser's own type, never a lock-specific one, so the
  // envelope is only recognizable by the post's `lock` URL. The title-only fallback is what
  // `LockedPostCard` renders, so one lock reads the same wherever it is named.
  if (lock) {
    const teaser = parseLockTeaserContent(content);
    if (teaser) return teaser.lock_title.trim() || DEFAULT_LOCK_TITLE;
  }
  if (kind === 'long') {
    return parseArticleContent(content)?.title || content;
  }
  if (kind === 'collection') {
    return parseCollectionContent(content)?.name ?? content;
  }
  return content;
}

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
