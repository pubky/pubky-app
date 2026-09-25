// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getOgFonts } from './ogFonts';

const assetBytes = (file: string) => readFileSync(join(__dirname, 'assets', file));

describe('getOgFonts', () => {
  it('loads each weight from its own font file', () => {
    const fonts = getOgFonts();

    expect(fonts.map(({ weight }) => weight)).toEqual([400, 500, 700]);
    expect(fonts[0].data.equals(assetBytes('InterTight-Regular.ttf'))).toBe(true);
    expect(fonts[1].data.equals(assetBytes('InterTight-Medium.ttf'))).toBe(true);
    expect(fonts[2].data.equals(assetBytes('InterTight-Bold.ttf'))).toBe(true);
  });

  it('reads the files once per process', () => {
    expect(getOgFonts()).toBe(getOgFonts());
  });

  // Vitest resolves a template URL at runtime, so only the source can show the production
  // regression: Turbopack binds `new URL(`./assets/${file}`)` to one asset for every weight.
  it('keeps every asset URL a string literal', () => {
    const source = readFileSync(join(__dirname, 'ogFonts.ts'), 'utf8');

    expect(source).not.toMatch(/new URL\(`/);
    expect(source.match(/new URL\('\.\/assets\/InterTight-\w+\.ttf', import\.meta\.url\)/g)).toHaveLength(3);
  });
});
