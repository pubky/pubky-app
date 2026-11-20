'use client';

import { CircleAlert, Link2Off, RotateCw } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { Typography } from '@/atoms/Typography/Typography';
import { isPinakesConfigured } from '@/config/pinakes';
import { useOtherLinkTags } from '@/hooks/useOtherLinkTags/useOtherLinkTags';
import { usePinakesGroup } from '@/hooks/usePinakesGroup/usePinakesGroup';
import type { UsePinakesQueryResult } from '@/hooks/usePinakesQuery/usePinakesQuery.types';
import { IllustratedEmptyState } from '@/molecules/IllustratedEmptyState/IllustratedEmptyState';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import { getHttpUrl, getResourceLinks, getResourceTagsLabel } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { useCardPlayer } from '@/molecules/ResourcePlayer/useCardPlayer';
import { ResourceActions } from '@/organisms/ResourceActions/ResourceActions';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getOtherLinks, getOwnLinkUris, mergeOtherLinkTags } from './ResourceOtherTags.utils';

const EMPTY_STATE_IMAGE = '/images/post-not-found-empty-state.webp';

interface ResourceDetailsProps {
  /** The link the page is for (`?uri=`), as given; `null` when the page was opened without one. */
  uri: string | null;
  /** The page's read of the link's card (`usePinakesCard(uri)`), shared with its sidebar cards. */
  read: UsePinakesQueryResult<TPinakesResourceDetail>;
  /** Reads the card again (the page remounts its read: a failed read is not cached). */
  onRetry: () => void;
}

/**
 * The resource page's body, where a post's page has the post: the heading, then the link's large
 * card with a post's footer. When Pinakes does not know the link, is not configured, or cannot be
 * read, it says so and offers the plain link.
 */
export function ResourceDetails(props: ResourceDetailsProps) {
  return (
    <>
      <PageHeading />
      <ResourceBody {...props} />
    </>
  );
}

function ResourceBody({ uri, read, onRetry }: ResourceDetailsProps) {
  if (!uri) {
    return (
      <ResourceEmptyState
        icon={Link2Off}
        title="No link to show"
        subtitle="This page shows an external resource by its link, and none was given."
        dataCy="resource-no-link"
      />
    );
  }
  if (!isPinakesConfigured()) {
    return (
      <ResourceEmptyState
        icon={Link2Off}
        title="External resource details are not available"
        subtitle="This app does not read external resources from Pinakes."
        dataCy="resource-not-configured"
      >
        <PlainLink uri={uri} />
      </ResourceEmptyState>
    );
  }

  const { data: card, isLoading, isError } = read;
  if (isLoading) {
    return (
      // A labelled section, so the name is announced (a plain `div` cannot carry one).
      <Container as="section" data-testid="resource-loading" aria-busy="true" aria-label="Loading external resource">
        <ResourceCardSkeleton withActions size="large" />
      </Container>
    );
  }
  if (isError) {
    return (
      <ResourceEmptyState
        icon={CircleAlert}
        title="This external resource could not be loaded"
        subtitle="Pinakes could not be reached. Try again in a moment."
        dataCy="resource-error"
      >
        <Container overrideDefaults className="flex flex-col items-center gap-3">
          <Button type="button" variant={ButtonVariant.SECONDARY} onClick={onRetry} data-testid="resource-retry">
            <RotateCw className="size-4 shrink-0" />
            Try again
          </Button>
          <PlainLink uri={uri} />
        </Container>
      </ResourceEmptyState>
    );
  }
  if (!card) {
    return (
      <ResourceEmptyState
        icon={Link2Off}
        title="Pinakes doesn't know this link yet"
        subtitle="Nobody has shared it on Pubky yet, or it has not been read."
        dataCy="resource-not-found"
      >
        <PlainLink uri={uri} />
      </ResourceEmptyState>
    );
  }
  return <ResourceKnown card={card} uri={uri} />;
}

/**
 * The card, large, closed by a post's footer. The other links' tags are read once the group is read
 * (so the chips do not reorder when it arrives), for the tag bar's one list.
 */
function ResourceKnown({ card, uri }: { card: TPinakesResourceDetail; uri: string }) {
  const actionUri = getActionUri(card, uri);
  const { data: group, isLoading: isGroupLoading } = usePinakesGroup(card.group?.id);
  const otherLinks =
    card.group && isGroupLoading ? [] : getOtherLinks(card, group?.members, getOwnLinkUris(card, uri, actionUri));
  const otherTags = mergeOtherLinkTags(useOtherLinkTags(otherLinks).reads);
  // The services that allow embedding play on the page too, as in a post (`useCardPlayer`).
  const { playOn, renderBody } = useCardPlayer(card, undefined, 'default');
  const actions = (
    <ResourceActions
      uri={actionUri}
      postUri={getPostUri(card, actionUri)}
      collectionsCount={card.collections}
      tagsLabel={getResourceTagsLabel(card)}
      linkUrl={getResourceLinks(card, actionUri).linkUrl}
      title={card.name || null}
      otherTagList={otherTags}
      playOn={playOn}
      size="large"
    />
  );
  return (
    <Container overrideDefaults data-testid="resource-details" className="min-w-0">
      <ResourceCard card={card} size="large" actions={actions} renderBody={renderBody} />
    </Container>
  );
}

/**
 * The link the card's tags, bookmark and collections are on: one people wrote (`refs`), as a post's
 * card acts on, since Nexus has no tags on a canonical `uri` nobody wrote. The page's link when it is
 * a ref, else `uri` when it is, else the most referenced; `uri` only for a card with no refs.
 */
function getActionUri(card: TPinakesResourceDetail, pageUri: string): string {
  if (card.refs.includes(pageUri)) return pageUri;
  if (card.refs.includes(card.uri)) return card.uri;
  return card.refs[0] ?? card.uri;
}

/**
 * The web link "Post about this" puts in the composer, which shows a card only for `http(s)`: the
 * acted-on link, else the first web link of the card, its refs and its Also on entries; `null` for
 * a resource known only by other schemes (`isbn:`, `doi:`, ...).
 */
function getPostUri(card: TPinakesResourceDetail, actionUri: string): string | null {
  const candidates = [actionUri, card.uri, ...card.refs, ...card.also_on.map((entry) => entry.uri)];
  for (const candidate of candidates) {
    const href = getHttpUrl(candidate);
    if (href) return href;
  }
  return null;
}

function ResourceEmptyState(props: Omit<React.ComponentProps<typeof IllustratedEmptyState>, 'imageSrc' | 'imageAlt'>) {
  return <IllustratedEmptyState imageSrc={EMPTY_STATE_IMAGE} imageAlt="" {...props} />;
}

/**
 * The page's heading, in every state, where a post's page says "Post by <name>" (`PostPageHeader`),
 * in its size and weight. The card's title is the next heading.
 */
function PageHeading() {
  return (
    <PageHeader data-testid="resource-page-header" className="pt-0 pb-3">
      <Typography as="h1" overrideDefaults className="truncate text-2xl leading-8 font-light text-muted-foreground">
        External resource
      </Typography>
    </PageHeader>
  );
}

/** The link as written: a link out when it is `http(s)`, else text (`isbn:`, `geo:`, ...). */
function PlainLink({ uri }: { uri: string }) {
  const href = getHttpUrl(uri);
  if (!href) {
    return (
      <Typography data-testid="resource-plain-link" className="text-center wrap-anywhere text-muted-foreground">
        {uri}
      </Typography>
    );
  }
  return (
    <Link href={href} data-testid="resource-plain-link" className="text-center wrap-anywhere">
      {uri}
    </Link>
  );
}
