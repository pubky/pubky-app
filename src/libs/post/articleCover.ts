import { getInlineMediaKindFromMime } from '@/libs/file/inlineMediaKind';
import { parseArticleContent } from './articleContent';
import { collectAttachmentRefIndexes } from './articleInlineMedia';

export interface ArticleCoverInput {
  /** The article post's `content`: the envelope, parsed tolerantly. */
  content: string;
  /** The post's attachments as stored (Nexus serves URIs). */
  attachments: readonly string[] | null | undefined;
  /**
   * What the file at `attachments[0]` is, from its metadata (its file row, or a local entry's
   * `type`), for rule B: a 0.x article's slot 0 is its cover only when it is an image, and only
   * metadata says what it is, never the markdown (for v1 media, which Nexus keeps no metadata
   * for, the row is the one `FileNormalizer` synthesizes from the URI's extension). Omit it while
   * unread; `null` once the read settled without a row. The other shapes ignore it.
   */
  slotZeroContentType?: string | null;
}

export interface ResolvedArticleCover {
  /** The cover's URI, or null when the article has none (or, under rule B, none is known yet). */
  cover: string | null;
  /**
   * The attachment each `attachment:{n}` reference of the body names, by slot: `slots[n]`.
   * Undefined (or `''`, a hole) past the end or for a slot nothing names.
   */
  slots: readonly string[];
  /**
   * Whether the slot-0 rule (ADR-0023) applies and leaves slot 0 to a cover: no envelope cover,
   * no `attachment:0` reference, and slot 0 not known to hold anything but an image. Unlocked
   * (Locks) content, whose files the reader holds locally, keeps that convention: its slot 0 is
   * the cover exactly then.
   */
  legacyCoverSlot: boolean;
  /**
   * Rule B while slot 0's kind is unknown: its URI, whose file row decides between the cover and
   * none. The caller reads the row and resolves again with `slotZeroContentType`. Null in every
   * other case.
   */
  coverCandidate: string | null;
}

/** Whether a file of this content type can be an article's cover: covers are images only (ADR-0023). */
export function isArticleCoverContentType(contentType: string): boolean {
  return getInlineMediaKindFromMime(contentType) === 'image';
}

/**
 * Rule B's second step, once the caller knows what slot 0 is: an unsettled result (no envelope
 * cover, no `attachment:0` reference, kind unknown) settles to the candidate as the cover when
 * the file is an image, and to no cover at all otherwise (`legacyCoverSlot` false). Any other
 * result, settled already or of another shape, is returned as is. `resolveArticleCover` applies
 * it itself when given `slotZeroContentType`; a caller that located the candidate first and read
 * its row afterwards applies it here, without parsing the article again.
 */
export function settleArticleSlotZero(resolved: ResolvedArticleCover, slotZeroIsImage: boolean): ResolvedArticleCover {
  if (!resolved.legacyCoverSlot || resolved.cover !== null) return resolved;
  return slotZeroIsImage
    ? { ...resolved, cover: resolved.coverCandidate, coverCandidate: null }
    : { ...resolved, legacyCoverSlot: false, coverCandidate: null };
}

/**
 * Where an article's cover and inline media are, for the three shapes a reader meets (ADR-0023 as
 * amended by ADR-0027):
 *
 * - **A** (written by this app, and by `pubky-social-migrator` 1.0.0-rc.2, the pinned one, when it
 *   promotes a 0.x cover): `cover_image` set, `attachments` hold the inline media only and
 *   `attachment:{n}` indexes them directly. rc.2 (transform revision 4) promotes `attachments[0]`
 *   only when it is an image the body does not reference, and then renumbers every reference
 *   `attachment:{n}` to `attachment:{n-1}`; otherwise it writes a null cover and the attachments
 *   as they were, which reads as rule B.
 * - **A'** (migrated by `pubky-social-migrator` 1.0.0-rc.1, before rc.2 was pinned):
 *   `cover_image` set because the migrator promoted `attachments[0]` into it, but the body's
 *   references were not renumbered, so a reference `n` still means the file that is now at
 *   `attachments[n - 1]`. Told apart from A by references that exist but never name slot 0, which
 *   this app's writer always does when it has any inline media, and so does rc.2's renumbering of a
 *   0.x body that named slot 1, as every body the 0.x composer wrote with inline media did (one
 *   whose lowest image reference is above slot 1 would read as A'). A' stays for as long as an rc.1-written article is left to read:
 *   the migrator's writes are create-only, so neither pinning rc.2 nor raising
 *   `SOCIAL_MIGRATION_TRANSFORM_REV` rewrites an article rc.1 copied (ADR-0023, amended
 *   2026-11-10 and 2026-11-18).
 * - **B** (0.x, never migrated; also every migrated article as Nexus serves it, in the 0.x content
 *   shape): no `cover_image`; `attachments[0]` is the cover when the body does not reference
 *   `attachment:0` and its file is an image, which only its metadata says
 *   (`slotZeroContentType`). Until the caller has read that, the slot is the `coverCandidate` and
 *   nothing paints as a cover, so a PDF or a video at slot 0 never flashes as one. Every reference
 *   indexes `attachments` directly.
 *
 * Pure and server-safe.
 */
export function resolveArticleCover({
  content,
  attachments,
  slotZeroContentType,
}: ArticleCoverInput): ResolvedArticleCover {
  const article = parseArticleContent(content);
  const refs = collectAttachmentRefIndexes(article?.body ?? '');
  const list = attachments ?? [];

  if (article?.cover_image) {
    const migrated = refs.size > 0 && !refs.has(0);
    return {
      cover: article.cover_image,
      slots: migrated ? ['', ...list] : list,
      legacyCoverSlot: false,
      coverCandidate: null,
    };
  }

  // Rule B. A referenced slot 0 is inline media and the article has no cover.
  if (refs.has(0)) return { cover: null, slots: list, legacyCoverSlot: false, coverCandidate: null };

  const located: ResolvedArticleCover = {
    cover: null,
    slots: list,
    legacyCoverSlot: true,
    coverCandidate: list[0] || null,
  };
  if (slotZeroContentType === undefined) return located;
  // A settled read without a row (`null`) is no image either: the file is gone, so no cover.
  return settleArticleSlotZero(located, slotZeroContentType !== null && isArticleCoverContentType(slotZeroContentType));
}
