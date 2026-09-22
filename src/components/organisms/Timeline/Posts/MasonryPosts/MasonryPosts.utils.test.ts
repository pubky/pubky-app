import { describe, expect, it } from 'vitest';
import { placeMasonryItems } from './MasonryPosts.utils';

const items = [100, 200, 50, 80, 40].map((height, index) => ({ id: String(index), height }));

describe('placeMasonryItems', () => {
  it('packs natural heights into the shortest column in source order', () => {
    const result = placeMasonryItems(items, 3, 24);
    expect(result.items).toEqual([
      { id: '0', column: 0, top: 0 },
      { id: '1', column: 1, top: 0 },
      { id: '2', column: 2, top: 0 },
      { id: '3', column: 2, top: 74 },
      { id: '4', column: 0, top: 124 },
    ]);
    expect(result.height).toBe(200);
  });

  it('keeps existing placement on append and places the next card at the shortest bottom', () => {
    const previous = placeMasonryItems(items, 3, 24);
    const result = placeMasonryItems([...items, { id: '5', height: 120 }], 3, 24, previous);
    expect(result.items.slice(0, items.length)).toEqual(previous.items);
    expect(result.items.at(-1)).toEqual({ id: '5', column: 2, top: 178 });
    expect(result.height).toBe(298);
  });

  it('reflows expansion and delayed media within their assigned columns', () => {
    const previous = placeMasonryItems(items, 3, 24);
    const result = placeMasonryItems(
      items.map((item) => (item.id === '2' ? { ...item, height: 450 } : item)),
      3,
      24,
      previous,
    );
    expect(result.items.map(({ column }) => column)).toEqual(previous.items.map(({ column }) => column));
    expect(result.items[3].top).toBe(474);
    expect(result.items[4].top).toBe(124);
    expect(result.height).toBe(554);
  });

  it('closes a removed card gap without moving surviving cards between columns', () => {
    const previous = placeMasonryItems(items, 3, 24);
    const result = placeMasonryItems(
      items.filter(({ id }) => id !== '2'),
      3,
      24,
      previous,
    );
    expect(result.items.find(({ id }) => id === '3')).toEqual({ id: '3', column: 2, top: 0 });
  });

  it('repacks when the viewport column count or explicit order changes', () => {
    const previous = placeMasonryItems(items, 3, 24);
    expect(placeMasonryItems(items, 2, 12, previous)).toEqual(placeMasonryItems(items, 2, 12));
    const reordered = [...items].reverse();
    expect(placeMasonryItems(reordered, 3, 24, previous)).toEqual(placeMasonryItems(reordered, 3, 24));
    const prepended = [{ id: 'new', height: 60 }, ...items];
    expect(placeMasonryItems(prepended, 3, 24, previous)).toEqual(placeMasonryItems(prepended, 3, 24));
  });

  it('handles an empty feed and collapsed cards without phantom gaps', () => {
    expect(placeMasonryItems([], 3, 24).height).toBe(0);
    expect(
      placeMasonryItems(
        [
          { id: 'hidden', height: 0 },
          { id: 'visible', height: 100 },
        ],
        1,
        12,
      ).height,
    ).toBe(100);
  });
});
