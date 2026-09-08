/// <reference types="vite/client" />

// Intentional import order — see comments below. Do not let `eslint --fix` reorder these imports.
/* eslint-disable import/first, simple-import-sort/imports */

// `process` does not exist in a real browser. App modules (e.g. `@/libs/logger`,
// `@/libs/env`) read `process.env.*` at module load, so polyfill BEFORE any
// imports that touch the app graph. Only fields without a Zod default in
// `src/libs/env/env.ts` are set here — everything else falls through to the
// schema default and stays in sync automatically. Do not paste real config
// values here; this file is committed.
(globalThis as { process?: { env: Record<string, string | undefined> }; __VRT__?: boolean }).process ??= {
  env: {
    NODE_ENV: 'test',
    VITEST: 'true',
    NEXT_PUBLIC_APP_VERSION: '0.0.0-test',
  },
};
(globalThis as { __VRT__?: boolean }).__VRT__ = true;

// Load Tailwind + design tokens. Without this, every screenshot collapses to an
// unstyled blank page and the baseline is useless.
import '@/app/globals.css';

import { vi } from 'vitest';

// Stabilize cross-OS / cross-run rendering for visual snapshots.
// Applied once per test file at setup time.

// 1. Disable animations, transitions, and caret blinking — these are the
//    most common causes of flaky pixel diffs. `*` does not match
//    pseudo-elements; list `::placeholder` so the 150ms composer prompt
//    fade cannot race a focused capture.
// 2. Hide the and document scrollbars (OS-dependent gutter)
// 3. Freeze facehash avatars — disable 3D tilt, blink, and hover transitions
//    (see FacehashAvatar `__VRT__` props) so GPU rasterisation is identical
//    across local runs and CI.
const stabilizerCss = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
  }

  *::placeholder {
    transition: none !important;
    animation: none !important;
  }

  [data-facehash],
  [data-facehash-face] {
    perspective: none !important;
    transform: none !important;
    transform-style: flat !important;
  }

  html,
  body {
    overflow: hidden !important;
    scrollbar-gutter: auto !important;
    scrollbar-width: none !important;
  }

  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }
`;
const styleEl = document.createElement('style');
styleEl.id = '__vrt_stabilizer__';
styleEl.textContent = stabilizerCss;
document.head.appendChild(styleEl);

// 2. Mock next/font/google so the build doesn't try to download fonts at test
//    time (next/font's runtime is server-only). Inter Tight is loaded from a
//    local npm package below so the screenshot matches the real app instead
//    of falling back to the system sans-serif.
vi.mock('next/font/google', () => ({
  Inter_Tight: vi.fn(() => ({
    variable: '--font-geist-sans',
    className: 'inter-tight',
  })),
}));

// 2b. Mock next/image with a plain <img>. next/image rewrites `src` to the
//     `/_next/image?url=...` optimizer endpoint, which has no server in the
//     vitest browser runtime, so every image 404s and renders as a broken-image
//     box (cross-OS-flaky glyph + wrong layout). A plain <img> lets Vite serve
//     the asset straight from `public/` (string src) or the bundled module
//     (static import), so screenshots show the real artwork deterministically.
//     Mocking next/image to a plain <img> is the pattern Vercel recommends for
//     tests: https://github.com/vercel/next.js/discussions/32325
import { createElement } from 'react';

vi.mock('next/image', () => ({
  __esModule: true,
  // Forward only the props a plain <img> understands; next-specific props
  // (priority, quality, loader, placeholder, sizes, unoptimized, …) are
  // intentionally dropped so React doesn't warn about unknown DOM attributes.
  default: ({ src, alt, width, height, fill, className, style }: Record<string, unknown>) => {
    // Static imports resolve to `{ src, width, height }`; string srcs pass through.
    const resolvedSrc = typeof src === 'object' && src !== null ? (src as { src: string }).src : src;
    // `fill` makes next/image absolutely cover its positioned parent.
    const fillStyle = fill
      ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
      : undefined;
    return createElement('img', {
      src: resolvedSrc,
      alt: alt ?? '',
      width: fill ? undefined : width,
      height: fill ? undefined : height,
      className,
      style: { ...(fillStyle ?? {}), ...((style as object) ?? {}) },
    });
  },
}));

// 3. Load Inter Tight from `@fontsource-variable/inter-tight` (committed npm
//    dep; same font as the real app's `next/font/google` Inter Tight, just
//    sourced locally so VRT has no network dependency). Vite resolves the
//    `?url` import to a hashed asset URL the browser can fetch.
//
//    `globals.css` declares `font-family: 'Inter Tight'`, but the fontsource
//    package ships under `'Inter Tight Variable'` — re-declare the @font-face
//    here under the family name the app actually uses so no CSS override is
//    needed. `font-display: block` plus `await document.fonts.ready` in
//    `renderForVRT` guarantee the screenshot is never taken on the fallback
//    face.
import latinWoff2Url from '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2?url';
import latinExtWoff2Url from '@fontsource-variable/inter-tight/files/inter-tight-latin-ext-wght-normal.woff2?url';

const fontFaceCss = `
  @font-face {
    font-family: 'Inter Tight';
    font-style: normal;
    font-display: block;
    font-weight: 100 900;
    src: url(${latinWoff2Url}) format('woff2-variations');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }
  @font-face {
    font-family: 'Inter Tight';
    font-style: normal;
    font-display: block;
    font-weight: 100 900;
    src: url(${latinExtWoff2Url}) format('woff2-variations');
    unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }
`;
const fontStyleEl = document.createElement('style');
fontStyleEl.id = '__vrt_inter_tight__';
fontStyleEl.textContent = fontFaceCss;
document.head.appendChild(fontStyleEl);
