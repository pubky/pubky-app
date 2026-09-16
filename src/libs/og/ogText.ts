import type { MentionSegment } from '@/libs/post/postMentions';
import { splitGraphemes, truncateByGraphemes } from '@/libs/utils/truncate';

/**
 * Text preparation for satori: user-authored strings need the emoji fallback
 * below, and mention-aware copy needs grapheme truncation that keeps its
 * segment styling intact.
 */

const ZWJ = '\u200d';
/**
 * Fully-qualified RGI emoji, ZWJ sequences included. Built with the constructor
 * (not a literal) so the `v` flag is not subject to compiler transforms; every
 * runtime here is Node ≥ 20, which supports it.
 */
const RGI_EMOJI_REGEX = new RegExp('^\\p{RGI_Emoji}$', 'v');
/** Contains an emoji-capable code point: only such clusters are emoji sequences. */
const EMOJI_REGEX = /\p{Extended_Pictographic}/u;

/**
 * Splits emoji ZWJ clusters that are not valid (RGI) sequences into their
 * component emoji, which is how browsers draw them when no joined glyph
 * exists. satori asks the emoji provider for one asset per grapheme cluster,
 * and an invalid sequence (e.g. MAGE + ZWJ + TROLL, seen in a display name)
 * has no asset: the cluster's width is reserved but nothing is painted. Valid
 * sequences (👨‍👩‍👧, 🏳️‍🌈, 🧙‍♂️) are untouched, and so is every non-emoji
 * cluster: Indic conjuncts and Arabic joining forms use the joiner for text
 * shaping, where removing it changes the letters.
 */
export function splitUnsupportedEmojiSequences(text: string): string {
  if (!text.includes(ZWJ)) return text;
  return splitGraphemes(text)
    .map((grapheme) =>
      grapheme.includes(ZWJ) && EMOJI_REGEX.test(grapheme) && !RGI_EMOJI_REGEX.test(grapheme)
        ? grapheme.replaceAll(ZWJ, '')
        : grapheme,
    )
    .join('');
}

/** Emoji-normalised text, grapheme-truncated when `max` is given (names, titles, descriptions). */
export function prepareOgText(text: string, max?: number): string {
  const normalized = splitUnsupportedEmojiSequences(text);
  return max === undefined ? normalized : truncateByGraphemes(normalized, max);
}

/** Ellipsis appended by truncation: a plain run, so it never inherits a mention's colour. */
const ELLIPSIS_SEGMENT: MentionSegment = { text: '...', isMention: false };

/**
 * Segment-aware `truncateByGraphemes`: keeps the first `max` grapheme clusters
 * across `segments`, cutting the run that crosses the limit, and appends the
 * ellipsis as its own plain run. Flattened, the result equals
 * `truncateByGraphemes(flattened input, max)`.
 */
export function truncateSegmentsByGraphemes(segments: MentionSegment[], max: number): MentionSegment[] {
  const kept: MentionSegment[] = [];
  let remaining = max;

  for (const segment of segments) {
    const graphemes = splitGraphemes(segment.text);
    if (graphemes.length <= remaining) {
      kept.push(segment);
      remaining -= graphemes.length;
      continue;
    }
    const cut = graphemes.slice(0, remaining).join('');
    if (cut) kept.push({ ...segment, text: cut });
    kept.push(ELLIPSIS_SEGMENT);
    return kept;
  }

  return kept;
}

/** Emoji-normalised, grapheme-truncated segments, ready for `OgText`. */
export function prepareOgTextSegments(segments: MentionSegment[], max: number): MentionSegment[] {
  return truncateSegmentsByGraphemes(
    segments.map((segment) => ({ ...segment, text: splitUnsupportedEmojiSequences(segment.text) })),
    max,
  );
}
