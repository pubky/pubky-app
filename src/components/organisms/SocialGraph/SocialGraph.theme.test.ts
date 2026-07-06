import { describe, expect, it } from 'vitest';
import { edgeRecencyColor, liftForDarkCanvas } from './SocialGraph.theme';

/** Relative lightness as HSL L, from a #rrggbb string. */
function lightnessOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

describe('liftForDarkCanvas', () => {
  it('lifts dark colors to a readable lightness while keeping the hue family', () => {
    const lifted = liftForDarkCanvas('#00008b');
    expect(lightnessOf(lifted)).toBeGreaterThanOrEqual(0.54);
    // Still blue-dominant
    const [r, g, b] = [lifted.slice(1, 3), lifted.slice(3, 5), lifted.slice(5, 7)].map((c) => parseInt(c, 16));
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it('leaves already-bright colors untouched', () => {
    expect(liftForDarkCanvas('#c8ff00')).toBe('#c8ff00');
    expect(liftForDarkCanvas('#ff98a0')).toBe('#ff98a0');
  });

  it('passes through malformed input unchanged', () => {
    expect(liftForDarkCanvas('not-a-color')).toBe('not-a-color');
  });
});

describe('edgeRecencyColor', () => {
  const channels = (rgba: string) => rgba.match(/[\d.]+/g)!.map(Number);

  it('fades old edges and brightens fresh ones', () => {
    const old = channels(edgeRecencyColor(0, false));
    const fresh = channels(edgeRecencyColor(1, false));
    // Fresh is brighter and more opaque than old
    expect(fresh[0] + fresh[1] + fresh[2]).toBeGreaterThan(old[0] + old[1] + old[2]);
    expect(fresh[3]).toBeGreaterThan(old[3]);
    expect(old[3]).toBeGreaterThan(0.05);
  });

  it('clamps t outside [0,1]', () => {
    expect(edgeRecencyColor(-1, false)).toBe(edgeRecencyColor(0, false));
    expect(edgeRecencyColor(2, false)).toBe(edgeRecencyColor(1, false));
  });

  it('dimmed edges collapse to the spotlight alpha regardless of age', () => {
    expect(channels(edgeRecencyColor(1, true))[3]).toBeLessThanOrEqual(0.05);
  });
});
