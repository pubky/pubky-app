import { describe, expect, it } from 'vitest';
import { edgeRecencyColor, followAlphaFactors, liftForDarkCanvas, tagEdgeLabel } from './SocialGraph.theme';

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

describe('followAlphaFactors', () => {
  const follow = (source: string, target: string) => ({ source, target, type: 'FOLLOWS' as const });

  it('keeps small graphs at design brightness', () => {
    const edges = [
      follow('me', 'a'),
      follow('me', 'b'),
      { source: 'a', target: 'b', type: 'FRIEND' as const },
      { source: 'me', target: 'post:1', type: 'AUTHORED' as const },
    ];
    expect(followAlphaFactors(edges, 'me')).toEqual({ spoke: 1, mesh: 0.3 });
  });

  it('dims spokes gently with degree and floors them readable', () => {
    const spokes = Array.from({ length: 150 }, (_, i) => follow('me', `n${i}`));
    expect(followAlphaFactors(spokes, 'me').spoke).toBeCloseTo(Math.sqrt(60 / 150), 5);

    const dense = Array.from({ length: 2000 }, (_, i) => follow('me', `n${i}`));
    expect(followAlphaFactors(dense, 'me').spoke).toBe(0.55);
  });

  it('does not let the neighbor mesh dim the spokes', () => {
    const spokes = Array.from({ length: 40 }, (_, i) => follow('me', `n${i}`));
    const mesh = Array.from({ length: 600 }, (_, i) => follow(`n${i % 40}`, `m${i}`));
    const factors = followAlphaFactors([...spokes, ...mesh], 'me');
    expect(factors.spoke).toBe(1);
    // The mesh still recedes with total follow density
    expect(factors.mesh).toBeCloseTo(Math.sqrt(80 / 640) * 0.3, 5);
  });

  it('treats every follow edge as mesh without a focus', () => {
    const edges = Array.from({ length: 10 }, (_, i) => follow('me', `n${i}`));
    expect(followAlphaFactors(edges, null)).toEqual({ spoke: 1, mesh: 0.3 });
  });
});

describe('tagEdgeLabel', () => {
  const hub = { id: 'tag:dev', label: 'dev' };
  const chip = { id: 'ptag:alice:dev', label: 'dev' };

  it('paints the hub edges of the highlighted tag', () => {
    expect(tagEdgeLabel(hub, { source: 'tag:dev', target: 'post:a:1', type: 'TAGGED', label: 'dev' })).toBe('dev');
    expect(tagEdgeLabel(hub, { source: 'user:a', target: 'tag:dev', type: 'TAGGED', label: 'dev' })).toBe('dev');
  });

  it('paints a profile-tag chip edge, which carries no label of its own', () => {
    expect(tagEdgeLabel(chip, { source: 'user:alice', target: 'ptag:alice:dev', type: 'HAS_TAG' })).toBe('dev');
  });

  it('matches an aggregated user-to-user edge on any of its labels', () => {
    const edge = { source: 'user:a', target: 'user:b', type: 'TAGGED', label: 'apple', labels: ['apple', 'zebra'] };
    expect(tagEdgeLabel({ id: 'tag:zebra', label: 'zebra' }, edge)).toBe('zebra');
    expect(tagEdgeLabel({ id: 'tag:apple', label: 'apple' }, edge)).toBe('apple');
  });

  it('leaves unrelated edges alone', () => {
    expect(tagEdgeLabel(hub, { source: 'user:a', target: 'user:b', type: 'FOLLOWS' })).toBeNull();
    expect(tagEdgeLabel(hub, { source: 'user:a', target: 'ptag:alice:art', type: 'HAS_TAG' })).toBeNull();
    expect(tagEdgeLabel(hub, { source: 'user:a', target: 'user:b', type: 'TAGGED', label: 'art' })).toBeNull();
  });

  it('paints nothing without a highlighted tag or a usable label', () => {
    expect(tagEdgeLabel(null, { source: 'tag:dev', target: 'post:a:1', type: 'TAGGED', label: 'dev' })).toBeNull();
    expect(tagEdgeLabel({ id: 'tag:', label: '' }, { source: 'tag:', target: 'post:a:1', type: 'TAGGED' })).toBeNull();
  });
});
