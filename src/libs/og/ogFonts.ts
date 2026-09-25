import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Inter Tight font data for `ImageResponse`.
 *
 * satori needs raw font bytes (it cannot use `next/font`), so the static
 * Regular (400), Medium (500) and Bold (700) TTFs — the same family the app
 * renders with via `next/font/google` — are bundled under `./assets`.
 *
 * Loaded LAZILY (not at module scope): Next generates a lightweight
 * `opengraph-image--metadata` module that imports this file only to read
 * `size`/`alt`, and a module-scope read would run — and fail — there too. Doing
 * the read on first render keeps that path clean while still caching for the
 * lifetime of the server process.
 *
 * `fileURLToPath(new URL('./assets/...', import.meta.url))` passes a plain path
 * string to `readFileSync` (avoiding a cross-realm `URL instanceof` failure seen
 * in the bundled server runtime) while keeping the `import.meta.url` reference so
 * the bundler traces the assets into the server output.
 *
 * Each URL must be a string literal. Turbopack resolves a template-literal path
 * (`./assets/${file}`) to a single matching asset, so every weight would silently
 * receive the same font file.
 */

type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700;
  style: 'normal';
};

let cachedFonts: OgFont[] | null = null;

function readFont(url: URL): Buffer {
  return readFileSync(fileURLToPath(url));
}

export function getOgFonts(): OgFont[] {
  if (!cachedFonts) {
    cachedFonts = [
      {
        name: 'Inter Tight',
        data: readFont(new URL('./assets/InterTight-Regular.ttf', import.meta.url)),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Inter Tight',
        data: readFont(new URL('./assets/InterTight-Medium.ttf', import.meta.url)),
        weight: 500,
        style: 'normal',
      },
      {
        name: 'Inter Tight',
        data: readFont(new URL('./assets/InterTight-Bold.ttf', import.meta.url)),
        weight: 700,
        style: 'normal',
      },
    ];
  }
  return cachedFonts;
}
