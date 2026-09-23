import type { Paragraph, Root, Text } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { visit } from 'unist-util-visit';
import { canonicalizeTagLabel, isValidTagLabel } from '@/libs/utils/utils';
import { HASHTAG_IN_TEXT_REGEX } from '@/libs/utils/utils.constants';
import { remarkDisallowMarkdownLinks, remarkPlaintextTables } from './markdown';

/**
 * Hashtag labels carried by a post's markdown, and the merge rule used when a
 * post is created.
 *
 * A post with `#tag` in its content should end up tagged `tag` (issue #1882).
 * The rule here mirrors `remarkHashtags` (`@/molecules/PostText/PostText.utils`),
 * which decides which hashtags a reader sees as links, so a created tag always
 * has a visible hashtag behind it and vice versa:
 *
 * - Paragraph text is scanned after the same table and short-post link rewrites
 *   used by the renderer. Genuine article links, headings, code and image alt
 *   text are excluded unless a table rewrite exposes them as plain text.
 * - The same pattern (`HASHTAG_IN_TEXT_REGEX`, pubky-app-specs `tagInvalidChars`
 *   terminate the body) and the same gate (`isValidTagLabel`) as rendering, so
 *   an over-long or character-invalid hashtag stays a plain hashtag.
 * - Labels are canonicalized (`trim().toLowerCase()`, the form written by
 *   `TagNormalizer.from`) and deduplicated case-insensitively.
 *
 * This module is pure (markdown in, labels out): no IO, no stores, no React.
 */

const parseMarkdown = (markdown: string): Root =>
  fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });

/** The canonical label a rendered hashtag stands for (`#Tag` → `tag`). */
const toHashtagLabel = (hashtag: string): string => canonicalizeTagLabel(hashtag.slice(1));

/** Whether `remarkHashtags` renders this hashtag as a link (and so creates a tag). */
const isConvertibleHashtag = (hashtag: string): boolean => isValidTagLabel(toHashtagLabel(hashtag));

/**
 * Canonical labels for the hashtags a reader would see linked in `markdown`,
 * in order of first appearance and without duplicates.
 */
export function extractHashtagLabelsFromMarkdown(markdown: string, isArticle = false): string[] {
  if (!markdown.trim()) return [];

  const labels: string[] = [];
  const seen = new Set<string>();

  const tree = parseMarkdown(markdown);
  remarkPlaintextTables()(tree);
  if (!isArticle) remarkDisallowMarkdownLinks()(tree);

  visit(tree, 'paragraph', (paragraph: Paragraph) => {
    for (const child of paragraph.children) {
      // Only direct text children, exactly like `remarkHashtags`: a hashtag inside a
      // link label, inline code or image alt is not a hashtag the reader can click.
      if (child.type !== 'text') continue;

      // `HASHTAG_IN_TEXT_REGEX` is shared with the renderer; `matchAll` clones it and
      // never advances the shared pattern's `lastIndex`.
      for (const match of (child as Text).value.matchAll(HASHTAG_IN_TEXT_REGEX)) {
        const hashtag = match[2];
        if (!isConvertibleHashtag(hashtag)) continue;

        const label = toHashtagLabel(hashtag);
        if (seen.has(label)) continue;

        seen.add(label);
        labels.push(label);
      }
    }
  });

  return labels;
}

/**
 * The tag labels a create should carry: the composer's explicit labels first
 * (they are the user's own choice, so they are never dropped), then the extracted
 * hashtags, deduplicated case-insensitively, with extracted labels stopped at
 * `maxLabels`.
 *
 * `maxLabels` is the existing per-post tag limit (`POST_MAX_TAGS`), so extraction
 * cannot push a post past what the composer itself allows.
 */
export function mergeTagLabels(
  explicitLabels: readonly string[],
  extractedLabels: readonly string[],
  maxLabels: number,
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const label of explicitLabels) {
    const canonical = canonicalizeTagLabel(label);
    if (seen.has(canonical)) continue;

    seen.add(canonical);
    merged.push(label);
  }

  for (const label of extractedLabels) {
    if (merged.length >= maxLabels) break;

    const canonical = canonicalizeTagLabel(label);
    if (seen.has(canonical)) continue;

    seen.add(canonical);
    merged.push(label);
  }

  return merged;
}
