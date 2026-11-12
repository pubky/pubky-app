'use client';

import { arrayMove } from '@dnd-kit/sortable';
import { LinkIcon } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { ResourceSourceIcon } from '@/molecules/ResourceCard/ResourceSourceIcon';
import {
  CARD_PLAYER,
  getPlayerList,
  isPlayerListEntry,
  isRankedOrder,
  type ListedPlayer,
  PLAYER_CATEGORIES,
  PlayerCategory,
  type PlayerListEntry,
  type PlayerPreferences,
  PROVIDER_NAMES,
  PROVIDER_SITES,
} from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { type MediaRankedItem, MediaRankedList } from './MediaRankedList';

interface MediaPlayerListProps {
  /** The kind of resource whose services the list ranks (`PLAYER_CATEGORIES`). */
  category: PlayerCategory;
  /** That kind's Players (`getCategoryPlayers`). */
  players: PlayerPreferences;
  /** Saves the new order and removed players (`setPlayers`). */
  onChange: (playerOrder: string[], hiddenPlayers: string[]) => void;
}

/**
 * One kind's list in the Players row of Links & Media (Music, Podcasts, Video): the services its
 * cards play on, ranked (`getPlayerList`), as a `MediaRankedList`. Each row
 * has a drag handle (dnd-kit, as the collection reorder grid: mouse, a long press on touch, and the
 * keyboard: Space lifts, arrows move, Space drops) and a remove ✕; Add, in the post menu's style,
 * brings a removed service back (at the end, or under Auto at its default place) and shows only
 * while one is removed. Removing every service is allowed: then no card loads a player. Card (no
 * player) is a row without ✕, last until moved: a song whose first service ranks below it shows its
 * card. In Podcasts it is the built-in player, first until moved: a podcast that plays in its card
 * shows the card and its own player first.
 *
 * Until the viewer reorders, the order has no service this version lists (Auto: a link's own service
 * first); a reorder, or an Add once there is an order, saves the list as shown. Moving only Card
 * saves the services above it, ending at Card, which keeps Auto (`isRankedOrder`). Ids this version
 * does not play (a later version's) keep their place after it.
 */
export function MediaPlayerList({ category, players, onChange }: MediaPlayerListProps) {
  const { name: categoryName, services } = PLAYER_CATEGORIES[category];
  const cardName = category === PlayerCategory.PODCASTS ? 'Built-in player' : 'Card (no player)';
  const labelId = `media-players-${category}-label`;
  const { shown, removed } = getPlayerList(players, services);
  // Ids this list does not show (another kind's services, a later version's) keep their place after it.
  const later = players.playerOrder.filter(
    (id) => !shown.includes(id as PlayerListEntry) && !removed.includes(id as ListedPlayer),
  );
  // The viewer has ranked the services (else Auto: a link's own service first).
  const isRanked = isRankedOrder(players.playerOrder);
  // Card (no player) last after a service is where it is by default, so it is not stored there: a
  // service a later version adds then comes before it, as one added back does. Alone (every service
  // removed) it stays where it was. In Auto, so do the services saved above it.
  const save = (order: string[], hiddenPlayers: string[], ranked = true) => {
    const after = getPlayerList({ playerOrder: order, hiddenPlayers }, services).shown;
    const isCardLast = after.length > 1 && after.at(-1) === CARD_PLAYER;
    onChange(
      isCardLast ? order.filter((id) => (ranked ? id !== CARD_PLAYER : !isPlayerListEntry(id))) : order,
      hiddenPlayers,
    );
  };

  const move = (from: PlayerListEntry, to: PlayerListEntry) => {
    const next = arrayMove(shown, shown.indexOf(from), shown.indexOf(to));
    // Moving only Card keeps Auto: the services above it are saved, ending at Card (none at the end).
    const card = next.indexOf(CARD_PLAYER);
    const order = from === CARD_PLAYER && !isRanked ? (card === next.length - 1 ? [] : next.slice(0, card + 1)) : next;
    save([...order, ...later], players.hiddenPlayers);
  };
  const remove = (id: ListedPlayer) =>
    save(
      players.playerOrder.filter((entry) => entry !== id),
      [...players.hiddenPlayers, id],
      isRanked,
    );
  const add = (id: ListedPlayer) =>
    save(
      isRanked
        ? [...shown.filter((entry, index) => entry !== CARD_PLAYER || index < shown.length - 1), id, ...later]
        : players.playerOrder,
      players.hiddenPlayers.filter((entry) => entry !== id),
    );

  // A row and an Add entry: the service's icon and name; Card (no player), the built-in player in
  // Podcasts, has the app's link icon and no ✕.
  const item = (id: PlayerListEntry): MediaRankedItem =>
    id === CARD_PLAYER
      ? { id, name: cardName, icon: <LinkIcon className="size-4 shrink-0" aria-hidden="true" />, isFixed: true }
      : { id, name: PROVIDER_NAMES[id], icon: <ResourceSourceIcon uri={PROVIDER_SITES[id]} /> };

  return (
    <Container overrideDefaults className="flex w-full flex-col items-start gap-2">
      {/* The app's group label (as "Tags on other services"), under the Players title. */}
      <Typography
        as="h3"
        id={labelId}
        overrideDefaults
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {categoryName}
      </Typography>
      <MediaRankedList
        kind="player"
        labelId={labelId}
        items={shown.map(item)}
        addable={removed.map(item)}
        addLabel={`Add a player to ${categoryName}`}
        onMove={(from, to) => move(from as PlayerListEntry, to as PlayerListEntry)}
        onRemove={(id) => remove(id as ListedPlayer)}
        onAdd={(id) => add(id as ListedPlayer)}
      />
    </Container>
  );
}
