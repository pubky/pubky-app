'use client';

import { useId, useState } from 'react';
import { Audio } from '@/atoms/Audio/Audio';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import type { TPlayableEpisode } from './ResourceCard.utils';
import { formatDuration, formatFactDate } from './ResourceFacts.utils';

/** How many episodes a show's card lists before "Show more". */
export const SHOWN_EPISODES = 3;

/**
 * A show's latest episodes in its card, newest first: each its title, date and length over the
 * app's own audio player (`Audio`), which loads nothing until played. One plays at a time, as any
 * media on the page (`useOnePlayer`). The first few show; the app's Show more button lists the rest.
 * The list is the card's controls: a click in it never opens the resource's page.
 */
export function ResourceEpisodes({ episodes }: { episodes: TPlayableEpisode[] }) {
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
        {shown.map(({ episode, audioUrl }) => {
          const name = episode.name?.trim() || 'Episode';
          const meta = [formatFactDate(episode.published), formatDuration(episode.stream?.duration_s)].filter(Boolean);
          return (
            <li
              key={`${episode.guid}|${episode.uri}`}
              data-testid="resource-card-episode"
              className="flex min-w-0 flex-col gap-1"
            >
              <Typography
                as="p"
                size="sm"
                dir="auto"
                className="flex min-w-0 gap-1.5 font-normal text-muted-foreground"
              >
                <span className="min-w-0 truncate font-bold text-foreground">{name}</span>
                {meta.length > 0 && <span className="shrink-0">· {meta.join(' · ')}</span>}
              </Typography>
              <Audio
                src={audioUrl}
                preload="none"
                data-testid="resource-card-episode-audio"
                aria-label={`Play ${name}`}
              />
            </li>
          );
        })}
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
