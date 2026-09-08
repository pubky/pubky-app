import type { CSSProperties, ReactNode } from 'react';
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
