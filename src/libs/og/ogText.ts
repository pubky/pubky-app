import { type MentionSegment, truncateSegmentsByGraphemes } from '@/libs/post/postMentions';
import { splitGraphemes } from '@/libs/utils/truncate';

/**
 * Text preparation for satori: user-authored strings need the emoji fallback
 * below, and mention-aware copy needs grapheme truncation that keeps its
 * segment styling intact.
 */

const ZWJ = '\u200d';
const VS16 = '\ufe0f';
/**
 * Fully-qualified RGI emoji, ZWJ sequences included. Built with the constructor
 * (not a literal) so the `v` flag is not subject to compiler transforms; every
 * runtime here is Node ≥ 20, which supports it.
 */
const RGI_EMOJI_REGEX = new RegExp('^\\p{RGI_Emoji}$', 'v');
/** Contains an emoji-capable code point: only such clusters are emoji sequences. */
const EMOJI_REGEX = /\p{Extended_Pictographic}/u;
/** An emoji-capable code point that renders as text unless followed by VS16 (❤, ♂, 🏳). */
const TEXT_DEFAULT_EMOJI_REGEX = /^\p{Extended_Pictographic}$/u;
const EMOJI_PRESENTATION_REGEX = /^\p{Emoji_Presentation}$/u;

/**
 * The fully-qualified form of an emoji cluster: VS16 after every text-default
 * emoji code point that lacks it. Keyboards and other clients often omit the
 * selector (`❤‍🔥` for `❤️‍🔥`); the emoji provider only has assets under the
 * qualified name, and satori keeps VS16 in its lookup when a joiner is present.
 */
function fullyQualifyEmoji(cluster: string): string {
  const codePoints = [...cluster];
  return codePoints
    .map((codePoint, index) =>
      TEXT_DEFAULT_EMOJI_REGEX.test(codePoint) &&
      !EMOJI_PRESENTATION_REGEX.test(codePoint) &&
      codePoints[index + 1] !== VS16
        ? `${codePoint}${VS16}`
        : codePoint,
    )
    .join('');
}

/**
 * Repairs emoji ZWJ clusters the emoji provider cannot draw. satori asks the
 * provider for one asset per grapheme cluster; when the asset is missing the
 * cluster's width is reserved but nothing is painted. Two repairs, in order:
 * an under-qualified sequence is fully qualified (`❤‍🔥` → `❤️‍🔥`, which has an
 * asset), and a sequence that is not a valid (RGI) emoji even then — e.g.
 * MAGE + ZWJ + TROLL, seen in a display name — is split into its component
 * emoji, which is how browsers draw it. Valid sequences (👨‍👩‍👧, 🏳️‍🌈) and
 * every non-emoji cluster are untouched: Indic conjuncts and Arabic joining
 * forms use the joiner for text shaping, where removing it changes the letters.
 *
 * Known limit: RGI sequences newer than the bundled twemoji (Emoji 15+, e.g.
 * 🐦‍🔥) pass the check and still render blank; that needs a newer provider.
 */
function repairEmojiSequences(text: string): string {
  if (!text.includes(ZWJ)) return text;
  return splitGraphemes(text)
    .map((grapheme) => {
      if (!grapheme.includes(ZWJ) || !EMOJI_REGEX.test(grapheme) || RGI_EMOJI_REGEX.test(grapheme)) return grapheme;
      const qualified = fullyQualifyEmoji(grapheme);
      return RGI_EMOJI_REGEX.test(qualified) ? qualified : grapheme.replaceAll(ZWJ, '');
    })
    .join('');
}

/** Emoji-repaired text, grapheme-truncated when `max` is given (names, titles, descriptions). */
export function prepareOgText(text: string, max?: number): string {
  if (max === undefined) return repairEmojiSequences(text);
  // Same truncate-then-repair order as the segment path, so a long string is
  // not scanned past the cut either.
  return prepareOgTextSegments([{ text, isMention: false }], max)
    .map((segment) => segment.text)
    .join('');
}

/**
 * Emoji-repaired, grapheme-truncated segments, ready for `OgText`. Truncates
 * before repairing so a long article body is not scanned past the cut, then
 * once more because a split cluster counts as two graphemes; the result is the
 * same as repairing first, since repairs never merge clusters.
 */
export function prepareOgTextSegments(segments: MentionSegment[], max: number): MentionSegment[] {
  const repaired = truncateSegmentsByGraphemes(segments, max).map((segment) => ({
    ...segment,
    text: repairEmojiSequences(segment.text),
  }));
  return truncateSegmentsByGraphemes(repaired, max);
}
