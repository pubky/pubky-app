// Reuse a single Segmenter instance across requests.
// 'en' locale is fine — grapheme segmentation follows Unicode rules (UAX #29)
// which are language-agnostic, so the locale has no practical effect.
const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * Truncates `text` to at most `max` grapheme clusters, appending an ellipsis
 * when truncation occurs. Segmenting by grapheme (rather than code unit) avoids
 * splitting emoji / combined characters mid-cluster.
 *
 * Pure function — safe to call from any layer (metadata generation, OG image
 * rendering, UI).
 */
export function truncateByGraphemes(text: string, max: number): string {
  const segments = [...graphemeSegmenter.segment(text)];
  if (segments.length <= max) return text;
  return `${segments
    .slice(0, max)
    .map((s) => s.segment)
    .join('')}...`;
}
