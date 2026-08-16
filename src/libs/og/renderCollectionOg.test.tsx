import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { solidTagColor, TagChip } from './renderCollectionOg';

describe('solidTagColor', () => {
  it('blends the tag color at 30% over the page background into an opaque rgb', () => {
    // 'bitcoin' has the custom color #FF9900; base is #05050a.
    // 0.3·(255,153,0) + 0.7·(5,5,10) = (80, 49.4, 7) → rounded.
    expect(solidTagColor('bitcoin')).toBe('rgb(80, 49, 7)');
  });

  it('matches the brand color blend for the pubky tag', () => {
    // 'pubky' → #C8FF00: 0.3·(200,255,0) + 0.7·(5,5,10) = (63.5, 80, 7).
    expect(solidTagColor('pubky')).toBe('rgb(64, 80, 7)');
  });

  it('is deterministic for arbitrary labels and never emits alpha', () => {
    const color = solidTagColor('some-arbitrary-tag');
    expect(solidTagColor('some-arbitrary-tag')).toBe(color);
    expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });
});

describe('TagChip', () => {
  it('renders the label with a compact count on an opaque chip background', () => {
    const html = renderToStaticMarkup(<TagChip label="bitcoin" count={1234} />);

    expect(html).toContain('bitcoin');
    // Compact notation (intentional divergence from the app's raw counts —
    // keeps chips narrow within the card's fixed width).
    expect(html).toContain('1.2K');
    expect(html).toContain('rgb(80, 49, 7)');
    expect(html).toMatchSnapshot();
  });

  it('truncates over-long labels by graphemes', () => {
    const longLabel = 'a'.repeat(40);
    const html = renderToStaticMarkup(<TagChip label={longLabel} count={1} />);

    expect(html).not.toContain(longLabel);
    // OG_TRUNCATE.collectionTag (20) graphemes + the truncation marker.
    expect(html).toContain(`${'a'.repeat(20)}...`);
  });
});
