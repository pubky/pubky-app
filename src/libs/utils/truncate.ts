// Reuse a single Segmenter instance across requests.
// 'en' locale is fine — grapheme segmentation follows Unicode rules (UAX #29)
// which are language-agnostic, so the locale has no practical effect.
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Splits `text` into grapheme clusters (UAX #29), so emoji and combined
 * characters stay whole. Pure.
 */
export function splitGraphemes(text: string): string[] {
  return [...graphemeSegmenter.segment(text)].map((s) => s.segment);
}

/**
 * The first `max` grapheme clusters of `text`, how many that is, and whether
 * anything was cut. Stops segmenting at the cut, so a long text costs only as
 * much as the part kept. Pure.
 */
export function sliceGraphemes(text: string, max: number): { text: string; count: number; truncated: boolean } {
  let end = 0;
  let count = 0;
  for (const { index, segment } of graphemeSegmenter.segment(text)) {
    if (count === max) return { text: text.slice(0, end), count, truncated: true };
    end = index + segment.length;
    count += 1;
  }
  return { text, count, truncated: false };
}

/**
 * Truncates `text` to at most `max` grapheme clusters, appending an ellipsis
 * when truncation occurs. Segmenting by grapheme (rather than code unit) avoids
 * splitting emoji / combined characters mid-cluster.
 *
 * Pure function — safe to call from any layer (metadata generation, OG image
 * rendering, UI).
 */
export function truncateByGraphemes(text: string, max: number): string {
  const { text: kept, truncated } = sliceGraphemes(text, max);
  return truncated ? `${kept}...` : text;
}
