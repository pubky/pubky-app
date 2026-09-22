'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { type MasonryPlacement, placeMasonryItems } from './MasonryPosts.utils';

/** One observer batches card and container changes; DOM order always remains the feed order. */
export function useMasonryLayout(itemIds: string[], hasTrailing: boolean) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const previous = useRef<MasonryPlacement | undefined>(undefined);
  const itemKey = JSON.stringify(itemIds);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ids: string[] = JSON.parse(itemKey);
    const cards = Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    let frame: number | null = null;

    const measure = () => {
      frame = null;
      const css = getComputedStyle(container);
      const columns = css.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
      const gap = parseFloat(css.columnGap) || 0;
      const width = (container.clientWidth - gap * (columns - 1)) / columns;
      if (width <= 0) return;
      for (const card of cards) {
        card.style.width = columns === 1 ? '' : `${width}px`;
      }
      const items = cards
        .slice(0, ids.length)
        .map((card, index) => ({ id: ids[index], height: card.getBoundingClientRect().height }));
      const layout = placeMasonryItems(items, columns, gap, previous.current);
      previous.current = layout;
      // The Add Post tile is always placed last and never pins an appended page to its former column.
      const trailing = cards[ids.length];
      const withTrailing = trailing
        ? placeMasonryItems(
            [...items, { id: 'masonry-add-post', height: trailing.getBoundingClientRect().height }],
            columns,
            gap,
            layout,
          )
        : layout;
      cards.forEach((card, index) => {
        const placement = withTrailing.items[index];
        card.style.position = columns === 1 ? '' : 'absolute';
        card.style.left = columns === 1 ? '' : `${placement.column * (width + gap)}px`;
        card.style.top = columns === 1 ? '' : `${placement.top}px`;
      });
      container.style.height = columns === 1 ? '' : `${withTrailing.height}px`;
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    cards.forEach((card) => observer.observe(card, { box: 'border-box' }));
    // Column/gap changes can occur without a container-width change.
    window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [mounted, itemKey, hasTrailing]);

  return (node: HTMLElement | null) => {
    containerRef.current = node;
    setMounted(node !== null);
  };
}
