import { OG_TOKENS } from './ogConstants';

/**
 * Inline SVGs for the OG image tree. satori renders plain SVG elements but has
 * no `currentColor` cascade, so stroke/fill colors are set explicitly.
 */

/**
 * Pubky brand mark (the lime keyhole). Path copied verbatim from `PubkyIcon`
 * in `src/libs/icons/icons.tsx` (viewBox 0 0 22 33). `size` is the rendered
 * height in px; width preserves the 22:33 aspect ratio.
 */
export function PubkyMark({ size = 80 }: { size?: number }) {
  const width = (size * 22) / 33;
  return (
    <svg width={width} height={size} viewBox="0 0 22 33" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.6133 0L8.04785 3.36154L4.74401 1.28202L3.83457 4.78379L0 3.97891L3.4879 9.67247C5.38937 8.00389 7.88184 6.99219 10.61 6.99137V6.99142H10.6167V6.99137C13.3448 6.9922 15.8373 8.00391 17.7387 9.67248L21.2266 3.97891L17.3921 4.78379L16.4826 1.28202L13.1788 3.36154L10.6167 0.00440823V0.00436164L10.616 0.00351212L10.6133 0ZM10.6133 9.66582C6.12357 9.66582 2.48365 13.3029 2.48365 17.7898C2.48365 19.7315 3.16595 21.5122 4.29976 22.9073L1.18964 32.4116H20.0371L16.9269 22.9073C18.0607 21.5122 18.743 19.7315 18.743 17.7898C18.743 13.3029 15.1031 9.66582 10.6133 9.66582ZM14.9142 17.7899C14.9142 15.4165 12.9888 13.4923 10.6134 13.4923H10.6133C8.23793 13.4923 6.31251 15.4165 6.31251 17.7899C6.31251 19.4347 7.23722 20.8641 8.59649 21.5866L8.73608 21.6608L6.47016 28.5853H14.7565L12.4906 21.6608L12.6302 21.5866C13.9895 20.8641 14.9142 19.4347 14.9142 17.7899Z"
        fill={OG_TOKENS.brand}
      />
    </svg>
  );
}

/**
 * Fallback avatar shown when a user has no profile image: the app's Facehash
 * "no image" face (brand circle + two eyes + mouth). Reconstructed as inline SVG
 * (exported from Figma) so it stays crisp at any size — a single static face for
 * every avatar-less user. `viewBox` is fixed at 80; `size` scales it.
 */
export function FallbackAvatar({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0 40C0 17.9086 17.9086 0 40 0C62.0914 0 80 17.9086 80 40C80 62.0914 62.0914 80 40 80C17.9086 80 0 62.0914 0 40Z"
        fill={OG_TOKENS.brand}
      />
      <path d="M15 30H33.3333" stroke="black" strokeWidth="3" strokeLinecap="round" />
      <path d="M24.1562 39.175L24.1562 20.8417" stroke="black" strokeWidth="3" strokeLinecap="round" />
      <path d="M48.3359 30H66.6693" stroke="black" strokeWidth="3" strokeLinecap="round" />
      <path d="M57.4922 39.175L57.4922 20.8417" stroke="black" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M41.1641 54.47C40.2617 54.47 39.4505 54.2649 38.7305 53.8547C38.0104 53.4446 37.4408 52.8499 37.0215 52.0706C36.6022 51.2913 36.3926 50.3502 36.3926 49.2473C36.3926 48.1353 36.6022 47.1897 37.0215 46.4104C37.4408 45.6265 38.0104 45.0318 38.7305 44.6262C39.4505 44.2161 40.2617 44.011 41.1641 44.011C42.0664 44.011 42.8776 44.2161 43.5977 44.6262C44.3177 45.0318 44.8851 45.6265 45.2998 46.4104C45.7191 47.1897 45.9287 48.1353 45.9287 49.2473C45.9287 50.3547 45.7191 51.2981 45.2998 52.0774C44.8851 52.8567 44.3177 53.4514 43.5977 53.8616C42.8776 54.2672 42.0664 54.47 41.1641 54.47ZM41.1641 52.5696C41.6882 52.5696 42.1439 52.442 42.5312 52.1868C42.9186 51.9316 43.2171 51.5579 43.4268 51.0657C43.641 50.5689 43.748 49.9628 43.748 49.2473C43.748 48.5273 43.641 47.9189 43.4268 47.4221C43.2171 46.9254 42.9186 46.5494 42.5312 46.2942C42.1439 46.039 41.6882 45.9114 41.1641 45.9114C40.6445 45.9114 40.1911 46.039 39.8037 46.2942C39.4163 46.5494 39.1133 46.9254 38.8945 47.4221C38.6803 47.9189 38.5732 48.5273 38.5732 49.2473C38.5732 49.9628 38.6803 50.5689 38.8945 51.0657C39.1133 51.5579 39.4163 51.9316 39.8037 52.1868C40.1911 52.442 40.6445 52.5696 41.1641 52.5696Z"
        fill="black"
      />
    </svg>
  );
}

const LUCIDE_STROKE_WIDTH = 2;

/** lucide `users-round` (followers), inlined with an explicit stroke color. */
export function UsersRoundIcon({ size = 48, color = OG_TOKENS.foreground }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={LUCIDE_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18 21a8 8 0 0 0-16 0" />
      <circle cx="10" cy="8" r="5" />
      <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
    </svg>
  );
}

/** lucide `library` (collection), inlined with an explicit stroke color. */
export function LibraryIcon({ size = 40, color = OG_TOKENS.foreground }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={LUCIDE_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </svg>
  );
}

/** lucide `newspaper` (article), inlined with an explicit stroke color. */
export function NewspaperIcon({ size = 64, color = OG_TOKENS.foreground }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={LUCIDE_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M15 18h-5" />
      <path d="M18 14h-8" />
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2" />
      <rect width="8" height="4" x="10" y="6" rx="1" />
    </svg>
  );
}

/** lucide `sticky-note` (posts), inlined with an explicit stroke color. */
export function StickyNoteIcon({ size = 48, color = OG_TOKENS.foreground }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={LUCIDE_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
      <path d="M15 3v5a1 1 0 0 0 1 1h5" />
    </svg>
  );
}
