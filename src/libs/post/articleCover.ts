import { parseArticleContent } from './articleContent';
import { collectAttachmentRefIndexes } from './articleInlineMedia';

export interface ArticleCoverInput {
  /** The article post's `content`: the envelope, parsed tolerantly. */
  content: string;
  /** The post's attachments as stored (Nexus serves URIs). */
  attachments: readonly string[] | null | undefined;
}

export interface ResolvedArticleCover {
  /** The cover's URI, or null when the article has none. */
  cover: string | null;
  /**
   * The attachment each `attachment:{n}` reference of the body names, by slot: `slots[n]`.
   * Undefined (or `''`, a hole) past the end or for a slot nothing names.
   */
  slots: readonly string[];
  /**
   * Whether the slot-0 rule (ADR-0023) applies and leaves slot 0 to a cover: no envelope cover
   * and no `attachment:0` reference. Unlocked (Locks) content, whose files the reader holds
   * locally, keeps that convention: its slot 0 is the cover exactly then.
   */
  legacyCoverSlot: boolean;
}

/**
 * Where an article's cover and inline media are, for the three shapes a reader meets (ADR-0023 as
 * amended by ADR-0027):
 *
 * - **A** (written by this app): `cover_image` set, `attachments` hold the inline media only and
 *   `attachment:{n}` indexes them directly.
 * - **A'** (migrated by `pubky-social-migrator` 1.0.0-rc.1): `cover_image` set because the
 *   migrator promoted `attachments[0]` into it, but the body's references were not renumbered,
 *   so a reference `n` still means the file that is now at `attachments[n - 1]`. Told apart from A
 *   by references that exist but never name slot 0, which this app's writer always does when it
 *   has any inline media.
 * - **B** (0.x, never migrated): no `cover_image`; `attachments[0]` is the cover unless the body
 *   references `attachment:0`, and every reference indexes `attachments` directly.
 *
 * Pure and server-safe.
 */
export function resolveArticleCover({ content, attachments }: ArticleCoverInput): ResolvedArticleCover {
  const article = parseArticleContent(content);
  const refs = collectAttachmentRefIndexes(article?.body ?? '');
  const list = attachments ?? [];

  if (article?.cover_image) {
    const migrated = refs.size > 0 && !refs.has(0);
    return { cover: article.cover_image, slots: migrated ? ['', ...list] : list, legacyCoverSlot: false };
  }

  const legacyCoverSlot = !refs.has(0);
  return { cover: legacyCoverSlot && list[0] ? list[0] : null, slots: list, legacyCoverSlot };
}
