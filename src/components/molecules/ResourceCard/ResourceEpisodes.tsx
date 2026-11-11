'use client';

import { useId, useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { ResourceAudioPlayer } from '@/molecules/ResourcePlayer/ResourceAudioPlayer';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import type { TPlayableEpisode } from './ResourceCard.utils';
import { formatDuration, formatFactDate } from './ResourceFacts.utils';

/** How many episodes a show's card lists before "Show more". */
export const SHOWN_EPISODES = 3;

/**
 * A show's latest episodes in its card, newest first: each its Play, title, date and length
 * (`ResourceAudioPlayer`), which loads nothing until played and then plays as the page's player, in
 * the app's player host and dock like a service's player. One plays at a time, as any media on the
 * page (`useOnePlayer`). The first few show; the app's Show more button lists the rest. The list is
 * the card's controls: a click in it never opens the resource's page.
 */
export function ResourceEpisodes({
  episodes,
  surface,
}: {
  episodes: TPlayableEpisode[];
  /** What the Play buttons sit on (`ResourceActions`' `surface`). */
  surface?: PostActionSurface;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const listId = useId();
  const shown = isExpanded ? episodes : episodes.slice(0, SHOWN_EPISODES);

  return (
    <Container
      overrideDefaults
      data-resource-controls
      data-testid="resource-card-episodes"
      className="flex flex-col gap-3"
    >
      <ul id={listId} aria-label="Latest episodes" className="flex flex-col gap-3">
        {shown.map(({ episode, audioUrl }) => (
          <li key={`${episode.guid}|${episode.uri}`} data-testid="resource-card-episode" className="min-w-0">
            <ResourceAudioPlayer
              src={audioUrl}
              resource={episode.uri || audioUrl}
              title={episode.name?.trim() || 'Episode'}
              date={formatFactDate(episode.published)}
              length={formatDuration(episode.stream?.duration_s)}
              surface={surface}
              data-testid="resource-card-episode-audio"
            />
          </li>
        ))}
      </ul>
      {episodes.length > SHOWN_EPISODES && (
        // The app's Show more button (`PostAttachmentsImagesAndVideos`), centred under the list.
        <Container overrideDefaults className="flex w-full justify-center">
          <Button
            type="button"
            variant="default"
            size="sm"
            aria-expanded={isExpanded}
            aria-controls={listId}
            data-testid="resource-card-episodes-toggle"
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </Button>
        </Container>
      )}
    </Container>
  );
}
