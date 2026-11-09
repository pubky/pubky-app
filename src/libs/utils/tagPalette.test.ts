import { describe, expect, it } from 'vitest';
import { DEFAULT_TAG_LIGHT_PALETTE } from '@/config/theme';
import { getTagDayPalette, getTagPaletteStyle } from './tagPalette';
import { generateRandomColor } from './utils';

const WHITE_LABEL = 'var(--color-white)';
const DARK_LABEL = 'var(--foreground)';
/** Light theme `--foreground` */
const DARK_LABEL_HEX = '#303034';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Every colour `generateRandomColor` can produce: six channel patterns times 256 values */
function allGeneratorColours(): string[] {
  const colours = new Set<string>();
  for (let byte = 0; byte < 256; byte++) {
    const x = byte.toString(16).padStart(2, '0');
    [`#ff00${x}`, `#ff${x}00`, `#${x}ff00`, `#${x}00ff`, `#00${x}ff`, `#00ff${x}`].forEach((c) => colours.add(c));
  }
  ['bitcoin', 'synonym', 'bitkit', 'pubky', 'blocktank', 'tether', 'ai'].forEach((name) =>
    colours.add(generateRandomColor(name).toLowerCase()),
  );
  return [...colours];
}

describe('getTagDayPalette (saturated)', () => {
  it('keeps every generator colour readable on its day chip', () => {
    for (const colour of allGeneratorColours()) {
      const { background, label } = getTagDayPalette(colour, 'saturated');
      const labelHex = label === WHITE_LABEL ? '#ffffff' : DARK_LABEL_HEX;
      expect(contrast(background, labelHex), colour).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives deep hues a white label, keeping the hue at mid lightness', () => {
    expect(getTagDayPalette('#FF0000', 'saturated')).toMatchObject({
      background: '#e42a1f',
      label: WHITE_LABEL,
      count: 'color-mix(in oklab, var(--color-white) 70%, transparent)',
    });
    expect(getTagDayPalette('#00FF00', 'saturated').background).toBe('#008a00');
    expect(getTagDayPalette('#0000FF', 'saturated').background).toBe('#184bd7');
  });

  it('gives amber, yellow and lime a bright chip with a dark label and a deep accent', () => {
    expect(getTagDayPalette('#FFFF00', 'saturated')).toEqual({
      background: '#e3e448',
      label: DARK_LABEL,
      count: 'color-mix(in oklab, var(--foreground) 60%, transparent)',
      accent: '#7a7a00',
    });
    expect(getTagDayPalette('#C8FF00', 'saturated')).toMatchObject({
      background: '#c4ed64',
      label: DARK_LABEL,
      accent: '#637f00',
    });
    expect(getTagDayPalette('#FFAE00', 'saturated')).toMatchObject({ label: DARK_LABEL, accent: '#a06b00' });
    expect(getTagDayPalette(generateRandomColor('bitcoin'), 'saturated').label).toBe(DARK_LABEL);
  });

  it('keeps amber and orange at their own lightness instead of bleaching them', () => {
    expect(getTagDayPalette('#FF9900', 'saturated').background).toBe('#ff9d24');
    expect(getTagDayPalette('#FFAE00', 'saturated').background).toBe('#ffae03');
  });

  it('keeps true orange as a deep chip', () => {
    expect(getTagDayPalette('#FF8800', 'saturated').label).toBe(WHITE_LABEL);
  });

  it('keeps the bright band accent visible against a white card', () => {
    for (const colour of ['#FFAE00', '#FFFF00', '#C8FF00']) {
      expect(contrast(getTagDayPalette(colour, 'saturated').accent, '#ffffff'), colour).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every chip an edge distinct from its fill, so the hover glow and border show', () => {
    for (const colour of allGeneratorColours()) {
      const { background, accent } = getTagDayPalette(colour, 'saturated');
      expect(contrast(accent, background), colour).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('treats greys as deep chips, since their hue is meaningless', () => {
    expect(getTagDayPalette('#a0a0a0', 'saturated').label).toBe(WHITE_LABEL);
  });

  it('accepts shorthand hex and is case insensitive', () => {
    expect(getTagDayPalette('#f00', 'saturated')).toEqual(getTagDayPalette('#FF0000', 'saturated'));
    expect(getTagDayPalette('#ff0000', 'saturated')).toBe(getTagDayPalette('#FF0000', 'saturated'));
  });

  it('passes through colours it cannot parse', () => {
    expect(getTagDayPalette('rgba(255, 0, 0, 0.3)', 'saturated')).toEqual({
      background: 'rgba(255, 0, 0, 0.3)',
      label: DARK_LABEL,
      count: 'color-mix(in oklab, var(--foreground) 60%, transparent)',
      accent: 'rgba(255, 0, 0, 0.3)',
    });
  });
});

describe('getTagDayPalette (pastel)', () => {
  it('lays 70% white over the tag colour and keeps the foreground label', () => {
    expect(getTagDayPalette('#FF0000', 'pastel')).toEqual({
      background: '#ffb3b3',
      label: DARK_LABEL,
      count: 'color-mix(in oklab, var(--foreground) 60%, transparent)',
      accent: '#ff0000',
    });
    expect(getTagDayPalette('#00FF00', 'pastel').background).toBe('#b3ffb3');
    expect(getTagDayPalette('#0000FF', 'pastel').background).toBe('#b3b3ff');
    expect(getTagDayPalette('#FFFF00', 'pastel').background).toBe('#ffffb3');
  });

  it('keeps every generator colour readable on its day chip', () => {
    for (const colour of allGeneratorColours()) {
      const { background, label } = getTagDayPalette(colour, 'pastel');
      expect(label, colour).toBe(DARK_LABEL);
      expect(contrast(background, DARK_LABEL_HEX), colour).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uses the raw tag colour for the selected border and hover glow', () => {
    expect(getTagDayPalette(generateRandomColor('bitcoin'), 'pastel').accent).toBe(
      generateRandomColor('bitcoin').toLowerCase(),
    );
  });

  it('accepts shorthand hex and is case insensitive', () => {
    expect(getTagDayPalette('#f00', 'pastel')).toEqual(getTagDayPalette('#FF0000', 'pastel'));
    expect(getTagDayPalette('#ff0000', 'pastel')).toBe(getTagDayPalette('#FF0000', 'pastel'));
  });

  it('passes through colours it cannot parse', () => {
    expect(getTagDayPalette('rgba(255, 0, 0, 0.3)', 'pastel')).toEqual(
      getTagDayPalette('rgba(255, 0, 0, 0.3)', 'saturated'),
    );
  });
});

describe('getTagDayPalette default', () => {
  it('uses the pastel mapping when none is given', () => {
    expect(DEFAULT_TAG_LIGHT_PALETTE).toBe('pastel');
    expect(getTagDayPalette('#FF0000')).toEqual(getTagDayPalette('#FF0000', 'pastel'));
  });

  it('memoises each mapping separately', () => {
    expect(getTagDayPalette('#FF0000', 'saturated')).not.toEqual(getTagDayPalette('#FF0000', 'pastel'));
  });
});

describe('getTagPaletteStyle', () => {
  it('maps night and day values onto the custom properties `.tag-palette` reads', () => {
    const day = getTagDayPalette('#FF0000', 'saturated');
    expect(getTagPaletteStyle({ nightFill: 'night-fill', nightEdge: 'night-edge', dayFill: 'day-fill', day })).toEqual({
      '--tag-night-fill': 'night-fill',
      '--tag-night-edge': 'night-edge',
      '--tag-day-fill': 'day-fill',
      '--tag-day-edge': day.accent,
      '--tag-day-label': day.label,
      '--tag-day-count': day.count,
    });
  });
});
