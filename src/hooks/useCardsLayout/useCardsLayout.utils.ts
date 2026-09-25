/**
 * Marker attribute for card content that has not resolved yet.
 *
 * A card that contains an element carrying this attribute is not ready: `useCardsLayout` measures it
 * but does not pin its column until the marker is gone, and it observes the insertion and removal of
 * the marker to re-run the layout. Render it through `POST_CONTENT_PENDING_PROPS` and query it through
 * `POST_CONTENT_PENDING_SELECTOR` so every call site shares one spelling.
 */
export const POST_CONTENT_PENDING_ATTR = 'data-post-content-pending' as const;

export const POST_CONTENT_PENDING_SELECTOR = `[${POST_CONTENT_PENDING_ATTR}]`;

/** Spread onto the marker element: `<span hidden {...POST_CONTENT_PENDING_PROPS} />`. */
export const POST_CONTENT_PENDING_PROPS = { [POST_CONTENT_PENDING_ATTR]: true } as const;

export interface CardsPlacement {
  columns: number;
  items: Array<{ id: string; column: number; top: number; pending?: boolean }>;
  height: number;
}

/** Preserve columns through appends/removals and height changes, repack on an explicit reorder. */
export function placeCardsItems(
  items: Array<{ id: string; height: number; ready?: boolean }>,
  columns: number,
  gap: number,
  previous?: CardsPlacement,
): CardsPlacement {
  const count = Math.max(1, columns);
  const ids = new Set(items.map(({ id }) => id));
  const surviving = previous?.items.filter(({ id }) => ids.has(id)).map(({ id }) => id) ?? [];
  // Surviving items must remain a prefix: insertion/reordering starts a new packing pass.
  const keepColumns = previous?.columns === count && surviving.every((id, i) => items[i]?.id === id);
  const assignments = new Map(
    keepColumns ? previous.items.filter(({ pending }) => !pending).map(({ id, column }) => [id, column]) : [],
  );
  let canCommit = true;
  const bottoms = Array<number>(count).fill(0);
  const placed = items.map(({ id, height, ready = true }) => {
    const column = assignments.get(id) ?? bottoms.indexOf(Math.min(...bottoms));
    const top = bottoms[column];
    // Empty/hidden posts don't leave phantom gaps.
    bottoms[column] = top + Math.max(0, height) + (height > 0 ? gap : 0);
    // Pin in source order only after initial content resolves. Existing pins survive
    // appends and later loading/expansion; placeholders never determine final columns.
    canCommit = canCommit && (ready || assignments.has(id));
    return { id, column, top, ...(!canCommit ? { pending: true } : {}) };
  });
  return {
    columns: count,
    items: placed,
    height: Math.max(0, ...bottoms) - (bottoms.some((bottom) => bottom > 0) ? gap : 0),
  };
}
