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
 * Truncates `text` to at most `max` grapheme clusters, appending an ellipsis
 * when truncation occurs. Segmenting by grapheme (rather than code unit) avoids
 * splitting emoji / combined characters mid-cluster.
 *
 * Pure function — safe to call from any layer (metadata generation, OG image
 * rendering, UI).
 */
export function truncateByGraphemes(text: string, max: number): string {
  const graphemes = splitGraphemes(text);
  if (graphemes.length <= max) return text;
  return `${graphemes.slice(0, max).join('')}...`;
}
