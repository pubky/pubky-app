'use client';

import { useId } from 'react';
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
  arrayMove,
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
import { ResourceSourceIcon } from '@/molecules/ResourceCard/ResourceSourceIcon';
import {
  getPlayerList,
  isListedPlayer,
  type ListedPlayer,
  type PlayerPreferences,
  PROVIDER_NAMES,
  PROVIDER_SITES,
} from '@/molecules/ResourcePlayer/resourcePlayer.utils';

interface MediaPlayerListProps {
  players: PlayerPreferences;
  /** Saves the new order and removed players (`setPlayers`). */
  onChange: (playerOrder: string[], hiddenPlayers: string[]) => void;
}

/**
 * The Players row of Links & Media: the services a card plays on, ranked (`getPlayerList`). Each row
 * has a drag handle (dnd-kit, as the collection reorder grid: mouse, a long press on touch, and the
 * keyboard: Space lifts, arrows move, Space drops) and a remove ✕; Add, in the post menu's style,
 * brings a removed service back (at the end, or under Auto at its default place) and shows only
 * while one is removed. Removing every service is allowed: then no card loads a player.
 *
 * Until the viewer reorders, the order has no service this version lists (Auto: a link's own service
 * first); a reorder, or an Add once there is an order, saves the list as shown. Ids this version
 * does not play (a later version's) keep their place after it.
 */
export function MediaPlayerList({ players, onChange }: MediaPlayerListProps) {
  const { shown, removed } = getPlayerList(players);
  const later = players.playerOrder.filter((id) => !isListedPlayer(id));
  // A stable id: dnd-kit's own counter gives its screen-reader hint another id on the server.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const move = (from: ListedPlayer, to: ListedPlayer) =>
    onChange([...arrayMove(shown, shown.indexOf(from), shown.indexOf(to)), ...later], players.hiddenPlayers);
  const remove = (id: ListedPlayer) =>
    onChange(
      players.playerOrder.filter((entry) => entry !== id),
      [...players.hiddenPlayers, id],
    );
  const add = (id: ListedPlayer) =>
    onChange(
      players.playerOrder.some(isListedPlayer) ? [...shown, id, ...later] : players.playerOrder,
      players.hiddenPlayers.filter((entry) => entry !== id),
    );

  return (
    <Container overrideDefaults className="flex w-full flex-col items-start gap-2">
      <Typography id="media-players-label" size="sm" className="leading-5 font-medium">
        {'Players'}
      </Typography>
      <Typography size="sm" className="font-normal text-muted-foreground">
        {
          'Cards play on the first of these services they are on; removed ones never play. Until you reorder them, a link plays on its own service first.'
        }
      </Typography>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (over && active.id !== over.id) move(active.id as ListedPlayer, over.id as ListedPlayer);
        }}
      >
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          <Container
            overrideDefaults
            role="list"
            aria-labelledby="media-players-label"
            data-testid="media-player-list"
            className="flex w-full flex-col gap-1"
          >
            {shown.map((id) => (
              <MediaPlayerRow key={id} id={id} onRemove={() => remove(id)} />
            ))}
          </Container>
        </SortableContext>
      </DndContext>
      {removed.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="rounded-full" aria-label="Add a player">
              <Plus aria-hidden="true" />
              {'Add'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            aria-label="Add a player"
            className="flex w-56 flex-col gap-2.5"
            data-testid="media-player-add-menu"
          >
            {removed.map((id) => (
              <DropdownMenuItem key={id} onSelect={() => add(id)} className="group gap-2 p-0">
                <ResourceSourceIcon uri={PROVIDER_SITES[id]} />
                <Typography
                  as="span"
                  overrideDefaults
                  className="truncate text-base font-medium text-muted-foreground transition-colors group-hover:text-foreground group-focus:text-foreground"
                >
                  {PROVIDER_NAMES[id]}
                </Typography>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Container>
  );
}

/** One ranked service: drag handle, the service's icon and name, remove ✕. */
function MediaPlayerRow({ id, onRemove }: { id: ListedPlayer; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const name = PROVIDER_NAMES[id];

  return (
    <Container
      ref={setNodeRef}
      overrideDefaults
      role="listitem"
      data-testid="media-player-row"
      data-player={id}
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
      <ResourceSourceIcon uri={PROVIDER_SITES[id]} />
      <Typography as="span" size="sm" className="min-w-0 flex-1 truncate leading-5 font-medium">
        {name}
      </Typography>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground"
      >
        <X aria-hidden="true" />
      </Button>
    </Container>
  );
}
