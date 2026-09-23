import { describe, expect, it } from 'vitest';
import { placeCardsItems } from './useCardsLayout.utils';

const items = [100, 200, 50, 80, 40].map((height, index) => ({ id: String(index), height }));

describe('placeCardsItems', () => {
  it('packs natural heights into the shortest column in source order', () => {
    const result = placeCardsItems(items, 3, 24);
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
    const previous = placeCardsItems(items, 3, 24);
    const result = placeCardsItems([...items, { id: '5', height: 120 }], 3, 24, previous);
    expect(result.items.slice(0, items.length)).toEqual(previous.items);
    expect(result.items.at(-1)).toEqual({ id: '5', column: 2, top: 178 });
    expect(result.height).toBe(298);
  });

  it('reflows expansion and delayed media within their assigned columns', () => {
    const previous = placeCardsItems(items, 3, 24);
    const result = placeCardsItems(
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
    const previous = placeCardsItems(items, 3, 24);
    const result = placeCardsItems(
      items.filter(({ id }) => id !== '2'),
      3,
      24,
      previous,
    );
    expect(result.items.find(({ id }) => id === '3')).toEqual({ id: '3', column: 2, top: 0 });
  });

  it('repacks when the viewport column count or explicit order changes', () => {
    const previous = placeCardsItems(items, 3, 24);
    expect(placeCardsItems(items, 2, 12, previous)).toEqual(placeCardsItems(items, 2, 12));
    const reordered = [...items].reverse();
    expect(placeCardsItems(reordered, 3, 24, previous)).toEqual(placeCardsItems(reordered, 3, 24));
    const prepended = [{ id: 'new', height: 60 }, ...items];
    expect(placeCardsItems(prepended, 3, 24, previous)).toEqual(placeCardsItems(prepended, 3, 24));
  });

  it('handles an empty feed and collapsed cards without phantom gaps', () => {
    expect(placeCardsItems([], 3, 24).height).toBe(0);
    expect(
      placeCardsItems(
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
