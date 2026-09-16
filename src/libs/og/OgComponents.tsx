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

/** One flex item of mention-aware text: a word, or a piece of one, and its styling. */
type OgTextPiece = { text: string; isMention: boolean };

/** The whitespace satori collapses under `white-space: normal`; NBSP and other Unicode spaces stay glue. */
const WHITESPACE_RUN_REGEX = /([ \t\n\r]+)/;
const WHITESPACE_ONLY_REGEX = /^[ \t\n\r]+$/;
/** Break opportunities inside a word, as a text node would break: after `/` or `-` when more of the word follows. */
const BREAK_AFTER_REGEX = /(?<=[/-])(?=[^/-])/;

/**
 * Cuts segment text into the items of satori's wrapping flex row: words, and
 * within a word the pieces a text node could break between (`https://`,
 * `example.com/`, `rock-`, `paper-`), so long URLs and hyphenated words flow
 * across rows instead of claiming whole ones. Whitespace runs collapse to one
 * space carried by the preceding piece, as `white-space: normal` does. Runs of
 * adjacent segments with no whitespace between them (`@Jeb,`) become adjacent
 * pieces, which only part at a row end when the whole word would not fit.
 */
function toPieces(segments: MentionSegment[]): OgTextPiece[] {
  const pieces: OgTextPiece[] = [];

  for (const segment of segments) {
    for (const part of segment.text.split(WHITESPACE_RUN_REGEX)) {
      if (!part) continue;
      if (WHITESPACE_ONLY_REGEX.test(part)) {
        const last = pieces.at(-1);
        if (last && !last.text.endsWith(' ')) last.text += ' ';
        continue;
      }
      for (const piece of part.split(BREAK_AFTER_REGEX)) {
        pieces.push({ text: piece, isMention: segment.isMention });
      }
    }
  }

  return pieces;
}

/**
 * Flowing text whose mention runs are drawn in the brand colour, as the app's
 * mention links are. Block styling (size, weight, colour, line height,
 * `maxHeight` / `overflow`, `wordBreak`) is passed as `style`.
 *
 * Without mentions the copy is one text node, so satori's own line breaking
 * applies exactly as before mentions were coloured. With mentions it has to be
 * word pieces in a wrapping flex row: satori (0.25) cannot style part of a
 * text run — nested inline spans are painted over each other, and with
 * `wordBreak` set their layout never terminates. Each piece keeps its trailing
 * space (`pre-wrap`; `normal` would trim it) and still breaks an overlong
 * piece across rows; the row honours the caller's height cap. Residual
 * difference from a text node: after a piece wider than a row (an unbroken
 * 60+ character token with no slash or hyphen) wraps internally, the next
 * word starts a new row rather than sharing the token's last line.
 */
export function OgText({ segments, style }: { segments: MentionSegment[]; style?: CSSProperties }) {
  if (!segments.some((segment) => segment.isMention)) {
    return <div style={{ display: 'flex', ...style }}>{segments.map((segment) => segment.text).join('')}</div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', ...style }}>
      {toPieces(segments).map((piece, index) => (
        <span key={index} style={{ whiteSpace: 'pre-wrap', ...(piece.isMention ? { color: OG_TOKENS.brand } : {}) }}>
          {piece.text}
        </span>
      ))}
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
