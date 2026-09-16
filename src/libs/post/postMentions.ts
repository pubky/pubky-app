import { MENTION_IN_TEXT_REGEX } from '@/libs/identity/identity.constants';
import { sliceGraphemes } from '@/libs/utils/truncate';
import { formatPublicKey, stripPubkyPrefix } from '@/libs/utils/utils';

/** A run of text: plain copy, or a mention already resolved to its label. */
export type MentionSegment = { text: string; isMention: false } | { text: string; isMention: true; pubky: string };

/**
 * Display label for a mentioned user, mirroring what `PostMentions` renders in
 * the app: `@name` when the profile has a name, otherwise the shortened key,
 * upper-cased as the app's `uppercase` class does.
 */
export function formatMentionLabel({ pubky, name }: { pubky: string; name?: string | null }): string {
  return name ? `@${name}` : formatPublicKey({ key: pubky }).toUpperCase();
}

/**
 * Splits `content` into plain runs and mentions, each standalone mention
 * replaced by `labelFor(pubky)` and flagged so renderers can style it (the OG
 * image draws mentions in the brand colour, as the app does). The captured
 * leading boundary (start of text or whitespace) stays in the plain run before
 * the mention. Pure — callers decide how a key maps to a label.
 */
export function splitMentions(content: string, labelFor: (pubky: string) => string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MENTION_IN_TEXT_REGEX)) {
    const [, leading, mention] = match;
    const mentionStart = (match.index ?? 0) + leading.length;
    const before = content.slice(lastIndex, mentionStart);
    if (before) segments.push({ text: before, isMention: false });
    const pubky = stripPubkyPrefix(mention);
    segments.push({ text: labelFor(pubky), isMention: true, pubky });
    lastIndex = mentionStart + mention.length;
  }

  const rest = content.slice(lastIndex);
  if (rest) segments.push({ text: rest, isMention: false });
  return segments;
}

/** Ellipsis appended by truncation: a plain run, so it never inherits a mention's colour. */
const ELLIPSIS_SEGMENT: MentionSegment = { text: '...', isMention: false };

/**
 * Segment-aware `truncateByGraphemes`: keeps the first `max` grapheme clusters
 * across `segments`, cutting the run that crosses the limit, and appends the
 * ellipsis as its own plain run. Flattened, the result equals
 * `truncateByGraphemes(flattened input, max)` unless a grapheme cluster
 * straddles two runs (a combining mark typed right after a key), where the
 * count differs by one. Segments past the cut are not scanned.
 */
export function truncateSegmentsByGraphemes(segments: MentionSegment[], max: number): MentionSegment[] {
  const kept: MentionSegment[] = [];
  let remaining = max;

  for (const segment of segments) {
    const { text, count, truncated } = sliceGraphemes(segment.text, remaining);
    if (!truncated) {
      kept.push(segment);
      remaining -= count;
      continue;
    }
    if (text) kept.push({ ...segment, text });
    kept.push(ELLIPSIS_SEGMENT);
    return kept;
  }

  return kept;
}
