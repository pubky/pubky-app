'use client';

import { type ReactNode, useId } from 'react';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getPlayerTargets } from './resourcePlayer.utils';
import { PlayerDock, PlayOnSplit } from './ResourcePlayerControls';
import { AnimatedHeight, ResourcePlayerFrame } from './ResourcePlayerFrame';
import { useResourcePlayer } from './useResourcePlayer';

export interface CardPlayer {
  /** "Play on <service>" for the card's action row (`ResourceActions`'s `playOn`); absent with no player. */
  playOn?: ReactNode;
  /** Puts the open player in place of the card's image and text (`ResourceCard`'s `renderBody`). */
  renderBody?: (body: ReactNode) => ReactNode;
}

/**
 * The services' own players for a card, wherever a card with an action row renders (a post's
 * embed, the resource page): "Play on <service>" plays the first service the card is on that
 * allows embedding (`getPlayerTargets`: the card's own link first, then `also_on`), its chevron
 * picks another. The player takes the place of the card's image and text; header, details, actions
 * and tags stay, and the same pill closes it. A player whose card scrolls away keeps playing in a
 * dock at the bottom of the screen (`PlayerDock`). One player plays on the whole page.
 *
 * No player is loaded before Play is pressed (the pill shows the service's favicon). A card on no
 * such service gets neither.
 *
 * @param card - The card shown, or `null` (nothing to play: a link's own preview, a pending card)
 * @param href - The link as written, played first when it is on such a service
 * @param surface - What the action row sits on (`ResourceActions`' `surface`): `default` on the resource page
 */
export function useCardPlayer(
  card: TPinakesResourceDetail | null,
  href?: string | null,
  surface?: PostActionSurface,
): CardPlayer {
  const owner = useId();
  const targets = card ? getPlayerTargets(card, { href }) : [];
  const player = useResourcePlayer(owner, targets);
  if (!card || targets.length === 0) return {};

  const title = card.name?.trim() || href || card.uri;
  const current = player.current;
  return {
    playOn: <PlayOnSplit targets={targets} player={player} surface={surface} />,
    renderBody: (body) => (
      <AnimatedHeight>
        {current ? (
          <PlayerDock target={current} title={title} onClose={player.close}>
            <ResourcePlayerFrame
              key={current.provider}
              target={current}
              title={title}
              load={player.load}
              onLoaded={player.onLoaded}
            />
          </PlayerDock>
        ) : (
          body
        )}
      </AnimatedHeight>
    ),
  };
}
