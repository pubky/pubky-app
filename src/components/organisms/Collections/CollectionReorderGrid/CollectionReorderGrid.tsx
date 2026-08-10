'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Container } from '@/atoms/Container/Container';
import { GRID_FEED_COLUMNS_CLASS, GRID_FEED_GAP_CLASS } from '@/config/feed';
import { cn } from '@/libs/utils/utils';
import { CollectionReorderCard } from './CollectionReorderCard';
import type { CollectionReorderGridProps } from './CollectionReorderGrid.types';

/**
 * CollectionReorderGrid
 *
 * Drag-and-drop replacement for the single collection's stream grid while
 * reorder mode is active. Renders EVERY envelope item at once (no pagination)
 * in the same responsive grid footprint as `TimelineGridPosts`, each cell a
 * sortable drag surface (`CollectionReorderCard`).
 *
 * Ordering state lives in `useReorderCollection` — this component only reports
 * drops via `onMove`. Sortable ids are the envelope item URIs, so a drop maps
 * back to the draft without index bookkeeping.
 */
export function CollectionReorderGrid({ entries, onMove, disabled = false }: CollectionReorderGridProps) {
  // Mouse + Touch instead of the unified PointerSensor so each input gets its
  // own activation constraint: a small mouse distance keeps plain clicks
  // inert, while the touch long-press delay leaves one-finger scrolling
  // working. Keyboard: Space/Enter lifts, arrows move, Space/Enter drops.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
      }}
    >
      <SortableContext items={entries.map((entry) => entry.uri)} strategy={rectSortingStrategy}>
        <Container
          data-cy="collection-reorder-grid"
          overrideDefaults
          className={cn('grid', GRID_FEED_GAP_CLASS, GRID_FEED_COLUMNS_CLASS)}
        >
          {entries.map((entry) => (
            <CollectionReorderCard key={entry.uri} entry={entry} disabled={disabled} />
          ))}
        </Container>
      </SortableContext>
    </DndContext>
  );
}
