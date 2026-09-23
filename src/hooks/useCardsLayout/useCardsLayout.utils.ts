export interface CardsPlacement {
  columns: number;
  items: Array<{ id: string; column: number; top: number }>;
  height: number;
}

/** Preserve columns through appends/removals and height changes, repack on an explicit reorder. */
export function placeCardsItems(
  items: Array<{ id: string; height: number }>,
  columns: number,
  gap: number,
  previous?: CardsPlacement,
): CardsPlacement {
  const count = Math.max(1, columns);
  const ids = new Set(items.map(({ id }) => id));
  const previousIds = new Set(previous?.items.map(({ id }) => id));
  const surviving = previous?.items.filter(({ id }) => ids.has(id)).map(({ id }) => id) ?? [];
  const retained = items.filter(({ id }) => previousIds.has(id)).map(({ id }) => id);
  // New items before the old tail are an insertion, not an appended page.
  const isAppendOrRemoval = items.slice(0, retained.length).every(({ id }, i) => id === retained[i]);
  const keepColumns =
    previous?.columns === count && isAppendOrRemoval && surviving.every((id, i) => id === retained[i]);
  const assignments = new Map(keepColumns ? previous.items.map(({ id, column }) => [id, column]) : []);
  const bottoms = Array<number>(count).fill(0);
  const placed = items.map(({ id, height }) => {
    const column = assignments.get(id) ?? bottoms.indexOf(Math.min(...bottoms));
    const top = bottoms[column];
    // Empty/hidden posts don't leave phantom gaps.
    bottoms[column] = top + Math.max(0, height) + (height > 0 ? gap : 0);
    return { id, column, top };
  });
  return {
    columns: count,
    items: placed,
    height: Math.max(0, ...bottoms) - (bottoms.some((bottom) => bottom > 0) ? gap : 0),
  };
}
