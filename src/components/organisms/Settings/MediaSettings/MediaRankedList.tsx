'use client';

import { type ReactNode, useId } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';

/** One entry of a ranked list: a player or a language. */
export interface MediaRankedItem {
  id: string;
  name: string;
  /** Before the name (a service's icon, the languages icon on a language's row). */
  icon?: ReactNode;
  /** The name's language when it is not the page's (a language's own name). */
  lang?: string;
  /** A row without ✕ (Card (no player)). */
  isFixed?: boolean;
}

interface MediaRankedListProps {
  /** What a row is (`player`, `language`): rows carry `data-<kind>` with their id, test ids are `media-<kind>-…`. */
  kind: string;
  /** The id of the list's label. */
  labelId: string;
  /** The rows, in order. */
  items: MediaRankedItem[];
  /** What Add offers; no Add button without any. */
  addable: MediaRankedItem[];
  /** The Add button's and menu's accessible name. */
  addLabel: string;
  /** Extra classes for the Add menu (a scroll for a long one). */
  addMenuClassName?: string;
  onMove: (from: string, to: string) => void;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
}

/**
 * A ranked list of Links & Media: each row has a drag handle (dnd-kit, as the collection reorder
 * grid: mouse, a long press on touch, and the keyboard: Space lifts, arrows move, Space drops) and a
 * remove ✕; Add, in the post menu's style, offers what is not in the list. What a move, remove or
 * add saves is up to the list using it (`MediaPlayerList`, `MediaLanguageList`).
 */
export function MediaRankedList({
  kind,
  labelId,
  items,
  addable,
  addLabel,
  addMenuClassName,
  onMove,
  onRemove,
  onAdd,
}: MediaRankedListProps) {
  // A stable id: dnd-kit's own counter gives its screen-reader hint another id on the server.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
        }}
      >
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <Container
            overrideDefaults
            role="list"
            aria-labelledby={labelId}
            data-testid={`media-${kind}-list`}
            className="flex w-full flex-col gap-1"
          >
            {items.map((item) => (
              <MediaRankedRow
                key={item.id}
                kind={kind}
                item={item}
                onRemove={item.isFixed ? undefined : () => onRemove(item.id)}
              />
            ))}
          </Container>
        </SortableContext>
      </DndContext>
      {addable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="rounded-full" aria-label={addLabel}>
              <Plus aria-hidden="true" />
              {'Add'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            aria-label={addLabel}
            className={cn('flex w-56 flex-col gap-2.5', addMenuClassName)}
            data-testid={`media-${kind}-add-menu`}
          >
            {addable.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onAdd(item.id)} className="group gap-2 p-0">
                {item.icon}
                <Typography
                  as="span"
                  overrideDefaults
                  lang={item.lang}
                  className="truncate text-base font-medium text-muted-foreground transition-colors group-hover:text-foreground group-focus:text-foreground"
                >
                  {item.name}
                </Typography>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

/** One ranked row: drag handle, the icon and name, remove ✕ (none on a fixed row). */
function MediaRankedRow({ kind, item, onRemove }: { kind: string; item: MediaRankedItem; onRemove?: () => void }) {
  const { id, name, icon, lang } = item;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <Container
      ref={setNodeRef}
      overrideDefaults
      role="listitem"
      data-testid={`media-${kind}-row`}
      {...{ [`data-${kind}`]: id }}
      // Translate, as the collection reorder grid: rows keep their own size while moving.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex w-full items-center gap-3', isDragging && 'relative z-10 opacity-80')}
    >
      <Button
        ref={setActivatorNodeRef}
        variant="ghost"
        size="icon"
        {...attributes}
        {...listeners}
        aria-label={`Move ${name}`}
        className={cn(
          'cursor-grab touch-manipulation text-muted-foreground select-none hover:text-foreground',
          isDragging && 'cursor-grabbing',
        )}
      >
        <GripVertical aria-hidden="true" />
      </Button>
      {icon}
      <Typography as="span" size="sm" lang={lang} className="min-w-0 flex-1 truncate leading-5 font-medium">
        {name}
      </Typography>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </Container>
  );
}
