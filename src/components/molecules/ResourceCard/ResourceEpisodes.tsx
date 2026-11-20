'use client';

import { ChevronRight } from 'lucide-react';
import { getResourceRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceAudioPlayer } from '@/molecules/ResourcePlayer/ResourceAudioPlayer';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import type { TPinakesEpisode } from '@/services/pinakes/pinakes.types';
import { EPISODES_ANCHOR, type TPlayableEpisode } from './ResourceCard.utils';
import { formatDuration, formatFactDate } from './ResourceFacts.utils';

/** How many of a show's latest episodes its card lists: the newest, then two more. */
export const CARD_EPISODES = 3;

/** The show an episode row is from: its name, cover and link. */
export interface TEpisodeShow {
  uri: string;
  name?: string | null;
  image?: string | null;
}

interface ResourceEpisodeRowProps {
  episode: TPinakesEpisode;
  /** The episode's audio (`getAudioStreamUrl`). */
  audioUrl: string;
  show: TEpisodeShow;
  featured?: boolean;
  surface?: PostActionSurface;
}

/**
 * One of a show's episodes as a row (`ResourceAudioPlayer`): Play, its title (opening the episode's
 * own resource page, as does a press anywhere on the row but Play; in a new tab where links may not
 * navigate), its date and length. Play plays it in place, in the app's player, as the show's.
 */
export function ResourceEpisodeRow({ episode, audioUrl, show, featured = false, surface }: ResourceEpisodeRowProps) {
  const navigable = useIsPostPreviewNavigable();
  return (
    <ResourceAudioPlayer
      src={audioUrl}
      resource={episode.uri || audioUrl}
      title={episode.name?.trim() || 'Episode'}
      date={formatFactDate(episode.published)}
      length={formatDuration(episode.stream?.duration_s)}
      href={episode.uri ? getResourceRoute(episode.uri) : null}
      linkTarget={navigable ? undefined : '_blank'}
      from={show.name?.trim() || null}
      image={episode.image || show.image || null}
      featured={featured}
      surface={surface}
      data-testid="resource-card-episode-audio"
    />
  );
}

/**
 * A show's latest episodes in its card, newest first: the newest as the lead row (its cover, its
 * title on up to two lines), then the next two (`CARD_EPISODES`), each a `ResourceEpisodeRow`, then
 * "All episodes", opening the show's page at its Episodes section. The list is the card's controls:
 * a press in it never opens the show's page, only an episode's or that link.
 */
export function ResourceEpisodes({
  episodes,
  show,
  surface,
}: {
  episodes: TPlayableEpisode[];
  show: TEpisodeShow;
  /** What the Play buttons sit on (`ResourceActions`' `surface`). */
  surface?: PostActionSurface;
}) {
  const navigable = useIsPostPreviewNavigable();
  const shown = episodes.slice(0, CARD_EPISODES);

  return (
    <Container
      overrideDefaults
      data-resource-controls
      data-testid="resource-card-episodes"
      className="flex flex-col gap-3"
    >
      <ul aria-label="Latest episodes" className="flex flex-col gap-3">
        {shown.map(({ episode, audioUrl }, index) => (
          <li key={`${episode.guid}|${episode.uri}`} data-testid="resource-card-episode" className="min-w-0">
            <ResourceEpisodeRow
              episode={episode}
              audioUrl={audioUrl}
              show={show}
              featured={index === 0}
              surface={surface}
            />
          </li>
        ))}
      </ul>
      <Link
        href={`${getResourceRoute(show.uri)}#${EPISODES_ANCHOR}`}
        target={navigable ? undefined : '_blank'}
        rel={navigable ? undefined : 'noopener noreferrer'}
        overrideDefaults
        data-testid="resource-card-all-episodes"
        className="inline-flex w-fit items-center gap-0.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        All episodes
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </Container>
  );
}
