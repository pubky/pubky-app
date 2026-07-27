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
        paddingTop: 64,
        paddingLeft: 64,
        paddingRight: 64,
        width: '100%',
      }}
    >
      <OgAvatar src={avatarUrl} size={80} />
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
      <PubkyMark size={80} />
    </div>
  );
}
