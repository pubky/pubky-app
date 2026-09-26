'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { type CardsPlacement, placeCardsItems, POST_CONTENT_PENDING_SELECTOR } from './useCardsLayout.utils';

/** Batched measurements preserve source DOM order and commit columns after initial content resolves. */
export function useCardsLayout(itemIds: string[], hasTrailing: boolean) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const previous = useRef<CardsPlacement | undefined>(undefined);
  const itemKey = JSON.stringify(itemIds);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!mounted || !container) return;
    const ids: string[] = JSON.parse(itemKey);
    const cards = Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    let frame: number | null = null;
    let containerWidth = container.clientWidth;

    const measure = () => {
      frame = null;
      const css = getComputedStyle(container);
      const columns = css.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
      if (columns === 1) {
        for (const card of cards) {
          card.style.width = '';
          card.style.position = '';
          card.style.left = '';
          card.style.top = '';
        }
        container.style.height = '';
        previous.current = undefined;
        return;
      }
      const gap = parseFloat(css.columnGap) || 0;
      const width = (container.clientWidth - gap * (columns - 1)) / columns;
      if (width <= 0) return;
      for (const card of cards) {
        card.style.width = `${width}px`;
      }
      const items = cards.slice(0, ids.length).map((card, index) => ({
        id: ids[index],
        height: card.getBoundingClientRect().height,
        ready: !card.querySelector(POST_CONTENT_PENDING_SELECTOR),
      }));
      const layout = placeCardsItems(items, columns, gap, previous.current);
      previous.current = layout;
      // The Add Post tile is always placed last and never pins an appended page to its former column.
      const trailing = cards[ids.length];
      const withTrailing = trailing
        ? placeCardsItems(
            [...items, { id: 'cards-add-post', height: trailing.getBoundingClientRect().height }],
            columns,
            gap,
            layout,
          )
        : layout;
      cards.forEach((card, index) => {
        const placement = withTrailing.items[index];
        card.style.position = 'absolute';
        card.style.left = `${placement.column * (width + gap)}px`;
        card.style.top = `${placement.top}px`;
      });
      container.style.height = `${withTrailing.height}px`;
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver((entries) => {
      const widthChanged = container.clientWidth !== containerWidth;
      containerWidth = container.clientWidth;
      // Updating the tallest column changes container height, not card geometry.
      if (widthChanged || entries.some(({ target }) => target !== container)) schedule();
    });
    // Content can resolve to the same height as its placeholder. Observe only
    // insertion/removal of explicit content placeholders, not arbitrary skeletons.
    const containsPendingContent = (node: Node) =>
      node instanceof Element &&
      (node.matches(POST_CONTENT_PENDING_SELECTOR) || Boolean(node.querySelector(POST_CONTENT_PENDING_SELECTOR)));
    const contentObserver = new MutationObserver((records) => {
      if (
        records.some(({ addedNodes, removedNodes }) => [...addedNodes, ...removedNodes].some(containsPendingContent))
      ) {
        schedule();
      }
    });
    contentObserver.observe(container, { childList: true, subtree: true });
    observer.observe(container);
    cards.forEach((card) => observer.observe(card, { box: 'border-box' }));
    // Column/gap changes can occur without a container-width change.
    window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [mounted, itemKey, hasTrailing]);

  return (node: HTMLElement | null) => {
    containerRef.current = node;
    setMounted(node !== null);
  };
}
