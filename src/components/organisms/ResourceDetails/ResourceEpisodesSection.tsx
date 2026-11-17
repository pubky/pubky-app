'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { getResourceRoute } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useResourceTags } from '@/hooks/useResourceTags/useResourceTags';
import { useShowEpisodes } from '@/hooks/useShowEpisodes/useShowEpisodes';
import { FilterPostsBar } from '@/molecules/FilterPostsBar/FilterPostsBar';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import {
  EPISODES_ANCHOR,
  getAudioStreamUrl,
  getHttpUrl,
  getResourceTarget,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceEpisodeRow, type TEpisodeShow } from '@/molecules/ResourceCard/ResourceEpisodes';
import { formatDuration, formatFactDate } from '@/molecules/ResourceCard/ResourceFacts.utils';
import { PlayStandIn } from '@/molecules/ResourcePlayer/ResourcePlayerControls';
import { CompactUserListItemSkeleton } from '@/organisms/CompactUserListItemSkeleton/CompactUserListItemSkeleton';
import { ResourceTagBar } from '@/organisms/ResourceActions/ResourceTagBar';
import type { TPinakesEpisode, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';

/** How long typing settles before the episodes are searched. */
export const EPISODES_FILTER_DEBOUNCE_MS = 300;
/** Pages in a row that add no episode before the list waits for Load more. */
const MAX_UNPRODUCTIVE_EPISODE_LOADS = 2;

/**
 * A podcast show's page: "Episodes", the episodes Pinakes keeps from the show's feed, newest first,
 * the next page read as the list scrolls to its end (`useShowEpisodes`, as the app's feeds do), and
 * "Filter episodes" searching their titles. Each is a row as in the show's card
 * (`ResourceEpisodeRow`: Play in place, the title opening the episode's own page) with the episode's
 * own tags at its end when it has any (`ResourceTagBar` inline: the chips, no "+"; an episode is
 * tagged on its own page, as any resource). A next page that fails offers
 * Try again. Nothing for a card that is no show. The section carries the page's `#episodes` anchor
 * (a show card's "All episodes") and is scrolled to once its first episodes show.
 */
export function ResourceEpisodesSection({ card }: { card: TPinakesResourceDetail | null | undefined }) {
  // A podcast show by its type; a card read before Pinakes typed it, by its latest episodes
  const isShow = (card?.type || card?.type_path?.at(-1)) === 'PodcastSeries' || Boolean(card?.episodes?.length);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), EPISODES_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);
  const list = useShowEpisodes(isShow ? card?.id : null, query);
  // A page that adds no row (all repeats) would leave the sentinel in view and ask again at once: the
  // hook budgets those reads, then hands the next one to Load more, as the notifications list does.
  const { sentinelRef, isStalled, resumeAutoLoad } = useInfiniteScroll({
    onLoadMore: () => void list.loadMore(),
    hasMore: list.hasMore && !list.isMoreError,
    isLoading: list.isLoading || list.isLoadingMore,
    itemCount: list.episodes.length,
    maxUnproductiveLoads: MAX_UNPRODUCTIVE_EPISODE_LOADS,
  });
  useScrollToAnchor(isShow && !list.isLoading);
  if (!card || !isShow) return null;
  const show: TEpisodeShow = { uri: card.uri, name: card.name, image: getHttpUrl(card.image) };

  return (
    <Container
      as="section"
      overrideDefaults
      id={EPISODES_ANCHOR}
      aria-label="Episodes"
      aria-busy={list.isLoading}
      data-testid="resource-episodes"
      className="mt-6 flex min-w-0 scroll-mt-36 flex-col gap-4 rounded-md bg-card p-4 lg:p-6"
    >
      <Heading level={2} size="lg" className="font-light text-muted-foreground">
        Episodes
      </Heading>
      <FilterPostsBar value={input} onValueChange={setInput} label="Filter episodes" />
      {list.isLoading ? (
        <Container
          overrideDefaults
          aria-hidden="true"
          data-testid="resource-episodes-loading"
          className="flex flex-col gap-3"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <CompactUserListItemSkeleton key={index} />
          ))}
        </Container>
      ) : list.isError ? (
        <Container overrideDefaults className="flex flex-col items-start gap-3">
          <Typography size="sm" data-testid="resource-episodes-message" className="font-normal text-muted-foreground">
            Episodes could not be loaded.
          </Typography>
          <Button type="button" variant={ButtonVariant.SECONDARY} size="sm" onClick={list.retry}>
            <RotateCw className="size-4 shrink-0" aria-hidden="true" />
            Try again
          </Button>
        </Container>
      ) : list.episodes.length === 0 ? (
        <Typography size="sm" data-testid="resource-episodes-message" className="font-normal text-muted-foreground">
          {query ? `No episode titles match “${query}”.` : 'No episodes yet.'}
        </Typography>
      ) : (
        <ul
          aria-label={query ? `Episodes matching ${query}` : 'All episodes'}
          className="flex min-w-0 flex-col gap-2.5"
        >
          {list.episodes.map((episode) => (
            <EpisodeItem key={`${episode.guid}|${episode.uri}`} episode={episode} show={show} />
          ))}
        </ul>
      )}
      {list.isMoreError && (
        <Container overrideDefaults className="flex flex-col items-start gap-3">
          <Typography
            size="sm"
            data-testid="resource-episodes-more-message"
            className="font-normal text-muted-foreground"
          >
            More episodes could not be loaded.
          </Typography>
          <Button type="button" variant={ButtonVariant.SECONDARY} size="sm" onClick={() => void list.loadMore()}>
            <RotateCw className="size-4 shrink-0" aria-hidden="true" />
            Try again
          </Button>
        </Container>
      )}
      {list.isLoadingMore && (
        <Container
          overrideDefaults
          aria-hidden="true"
          data-testid="resource-episodes-loading-more"
          className="flex flex-col gap-3"
        >
          <CompactUserListItemSkeleton />
        </Container>
      )}
      {list.hasMore && isStalled && !list.isLoadingMore && !list.isMoreError && (
        <Container overrideDefaults className="flex justify-center py-2">
          <Button variant={ButtonVariant.SECONDARY} type="button" onClick={resumeAutoLoad}>
            Load more
          </Button>
        </Container>
      )}
      <div ref={sentinelRef} aria-hidden="true" data-testid="resource-episodes-sentinel" className="h-px" />
    </Container>
  );
}

/**
 * One episode of the list on one line: its row (the title truncated), then its own tags at the end,
 * level with Play (and with the player's first line once it plays), in at most half the row (under the
 * title on a phone), so the title stays readable. An episode without audio that plays here keeps its
 * title (opening its page), date and length, with no Play.
 */
function EpisodeItem({ episode, show }: { episode: TPinakesEpisode; show: TEpisodeShow }) {
  const navigable = useIsPostPreviewNavigable();
  const audioUrl = getAudioStreamUrl(episode.stream);
  const title = episode.name?.trim() || 'Episode';
  return (
    <li data-testid="resource-episode" className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <Container overrideDefaults className="min-w-0 flex-1">
        {audioUrl ? (
          <ResourceEpisodeRow episode={episode} audioUrl={audioUrl} show={show} surface="default" />
        ) : (
          <PlayStandIn
            title={title}
            label={title}
            detail={
              [formatFactDate(episode.published), formatDuration(episode.stream?.duration_s)]
                .filter(Boolean)
                .join(' · ') || null
            }
            href={episode.uri ? getResourceRoute(episode.uri) : null}
            linkTarget={navigable ? undefined : '_blank'}
            className="pl-14"
            data-testid="resource-episode-no-audio"
          />
        )}
      </Container>
      {episode.uri && <EpisodeTags uri={episode.uri} aliases={episode.aliases} title={title} />}
    </li>
  );
}

/**
 * An episode's own tags, read by its link with its other links along (the entry's `aliases`, such as
 * its feed item once `uri` names its page; deduped and capped as a card's spellings), as a card's
 * footer shows them (`ResourceTagBar`) but inline: the chips only, nothing for an episode nobody
 * tagged. The rows of a page mount together, so their reads go to Nexus as one `by_ids` batch (one
 * `by-uri` read per row on a Nexus without it).
 */
function EpisodeTags({ uri, aliases, title }: { uri: string; aliases?: string[]; title: string }) {
  const { spellings } = getResourceTarget({ uri, refs: [], aliases }, uri);
  const resourceTags = useResourceTags(uri, { spellings });
  if (resourceTags.tags.length === 0) return null;
  return (
    <Container overrideDefaults className="pl-14 sm:mt-0.5 sm:max-w-1/2 sm:pl-0">
      <ResourceTagBar
        resourceTags={resourceTags}
        label={`Tags on ${title}`}
        uri={uri}
        isExpanded={false}
        isAdding={false}
        onAddingChange={() => undefined}
        inline
      />
    </Container>
  );
}

/**
 * Brings the Episodes section into view once its first episodes show, when the page was opened at it
 * (a show card's "All episodes"): it is laid out only once the show's card is read, after the browser
 * looked for the anchor.
 */
function useScrollToAnchor(isReady: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!isReady || done.current || window.location.hash !== `#${EPISODES_ANCHOR}`) return;
    done.current = true;
    document.getElementById(EPISODES_ANCHOR)?.scrollIntoView({ block: 'start' });
  }, [isReady]);
}
