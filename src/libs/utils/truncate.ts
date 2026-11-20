import toArray from 'lodash-es/toArray';

// Reuse a single Segmenter instance across requests.
// 'en' locale is fine — grapheme segmentation follows Unicode rules (UAX #29)
// which are language-agnostic, so the locale has no practical effect.
const graphemeSegmenter =
  typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

function* iterateGraphemes(text: string): Generator<string> {
  if (graphemeSegmenter) {
    for (const { segment } of graphemeSegmenter.segment(text)) yield segment;
  } else {
    // Older browsers use Lodash's Unicode symbols: emoji and common combining
    // sequences stay whole, but this is not the full UAX #29 algorithm.
    yield* toArray(text);
  }
}

/**
 * Splits `text` into grapheme clusters, with Unicode-symbol fallback in browsers
 * without Intl.Segmenter. Pure.
 */
export function splitGraphemes(text: string): string[] {
  return [...iterateGraphemes(text)];
}

/**
 * The first `max` grapheme clusters of `text`, how many that is, and whether
 * anything was cut. Native segmentation stops at the cut; the legacy fallback
 * splits the full string first. Pure.
 */
export function sliceGraphemes(text: string, max: number): { text: string; count: number; truncated: boolean } {
  let end = 0;
  let count = 0;
  for (const segment of iterateGraphemes(text)) {
    if (count === max) return { text: text.slice(0, end), count, truncated: true };
    end += segment.length;
    count += 1;
  }
  return { text, count, truncated: false };
}

/**
 * Truncates `text` to at most `max` grapheme clusters, appending an ellipsis
 * when truncation occurs. Uses the same native/fallback segmentation as
 * splitGraphemes and sliceGraphemes, keeping emoji whole at the cut.
 *
 * Pure function — safe to call from any layer (metadata generation, OG image
 * rendering, UI).
 */
export function truncateByGraphemes(text: string, max: number): string {
  const { text: kept, truncated } = sliceGraphemes(text, max);
  return truncated ? `${kept}...` : text;
}
