import type { CSSProperties, ReactNode } from 'react';
import type { MentionSegment } from '@/libs/post/postMentions';
import { OG_TOKENS } from './ogConstants';
import { FallbackAvatar, PubkyMark } from './OgIcons';

/**
 * Reusable building blocks for the OG image trees.
 *
 * NOTE (satori): every element with more than one child must set
 * `display: 'flex'`, and there is no CSS-variable / `currentColor` support — all
 * values are literals.
 */

/** 1200x630 canvas: card background, column flow by default. */
export function OgFrame({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: OG_TOKENS.cardBg,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const HEADER_PADDING_TOP = 64;
/** Height of the avatar / brand-mark row — the tallest header content. */
const HEADER_ROW_HEIGHT = 80;
/**
 * `OgHeader`'s rendered height (no bottom padding). Exported so layouts that
 * size the space below the header (e.g. the collection card's full-bleed cover
 * section) stay in sync with the header's actual geometry.
 */
export const OG_HEADER_HEIGHT = HEADER_PADDING_TOP + HEADER_ROW_HEIGHT;

/**
 * Circular avatar. Renders the image (object-cover, clipped to a circle over a
 * muted backing) when `src` is present, otherwise a solid brand-color circle.
 */
export function OgAvatar({ src, size }: { src: string | null; size: number }) {
  if (!src) {
    return <FallbackAvatar size={size} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        backgroundColor: OG_TOKENS.avatarMuted,
      }}
    />
  );
}

/** One unbreakable run of non-whitespace characters and its styling. */
type OgTextRun = { text: string; isMention: boolean };
/** A whitespace-delimited word: several runs when a mention is glued to punctuation (`@Jeb,`). */
type OgTextWord = { runs: OgTextRun[]; spaceAfter: boolean };

/**
 * Groups segment text into words for satori's wrapping flex row. Whitespace
 * runs (newlines included) collapse to a single space after the preceding
 * word, as `white-space: normal` did on the single text node this replaces,
 * and runs from adjacent segments with no whitespace between them share one
 * word so a mention never parts from its trailing punctuation across rows.
 */
function toWords(segments: MentionSegment[]): OgTextWord[] {
  const words: OgTextWord[] = [];
  let current: OgTextWord | null = null;

  for (const segment of segments) {
    for (const part of segment.text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (current) current.spaceAfter = true;
        current = null;
        continue;
      }
      if (!current) {
        current = { runs: [], spaceAfter: false };
        words.push(current);
      }
      current.runs.push({ text: part, isMention: segment.isMention });
    }
  }

  return words;
}

function OgTextRunSpan({ run, spaceAfter }: { run: OgTextRun; spaceAfter: boolean }) {
  // pre-wrap keeps the word's trailing space (normal would trim it) while still
  // breaking an overlong word such as a URL across rows.
  return (
    <span style={{ whiteSpace: 'pre-wrap', ...(run.isMention ? { color: OG_TOKENS.brand } : {}) }}>
      {spaceAfter ? `${run.text} ` : run.text}
    </span>
  );
}

/**
 * Flowing text whose mention runs are drawn in the brand colour, as the app's
 * mention links are. satori (0.25) cannot style part of a text run: nested
 * inline spans are painted over each other, and with `wordBreak` set their
 * layout never terminates. So the copy becomes word items in a wrapping flex
 * row — the standard satori idiom — which wraps at word boundaries like a
 * paragraph and still honours the caller's height cap. Block styling (size,
 * weight, colour, line height, `maxHeight` / `overflow`, `wordBreak`) is
 * passed as `style` and inherited by the items.
 */
export function OgText({ segments, style }: { segments: MentionSegment[]; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', ...style }}>
      {toWords(segments).map((word, index) =>
        word.runs.length === 1 ? (
          <OgTextRunSpan key={index} run={word.runs[0]} spaceAfter={word.spaceAfter} />
        ) : (
          // Glued runs (mention + punctuation) share a non-wrapping row so they stay together.
          <div key={index} style={{ display: 'flex' }}>
            {word.runs.map((run, runIndex) => (
              <OgTextRunSpan
                key={runIndex}
                run={run}
                spaceAfter={word.spaceAfter && runIndex === word.runs.length - 1}
              />
            ))}
          </div>
        ),
      )}
    </div>
  );
}

/** Post header: avatar + author name (single-line, ellipsis) + Pubky brand mark. */
export function OgHeader({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        paddingTop: HEADER_PADDING_TOP,
        paddingLeft: 64,
        paddingRight: 64,
        width: '100%',
      }}
    >
      <OgAvatar src={avatarUrl} size={HEADER_ROW_HEIGHT} />
      <div
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          fontSize: 48,
          fontWeight: 700,
          color: OG_TOKENS.foreground,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </div>
      <PubkyMark size={HEADER_ROW_HEIGHT} />
    </div>
  );
}
