'use client';

import { useState } from 'react';
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
import type { UseResourceRepliesResult } from '@/hooks/useResourceReplies/useResourceReplies';
import { IllustratedEmptyState } from '@/molecules/IllustratedEmptyState/IllustratedEmptyState';
import { parseUrlForLinkEmbed } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds.utils';
import {
  chooseNativeEmbed,
  getNativeEmbedCard,
  getShowPostLabel,
} from '@/molecules/PostLinkEmbeds/Providers/Native/nativeEmbed.utils';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import {
  getHttpUrl,
  getResourceLinks,
  getResourceTagsLabel,
  getResourceTarget,
  isWritableResourceUri,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceLinkCard } from '@/molecules/ResourceCard/ResourceLinkCard';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { PlayOnPill } from '@/molecules/ResourcePlayer/ResourcePlayerControls';
import { useCardPlayer } from '@/molecules/ResourcePlayer/useCardPlayer';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';
import { DialogReply } from '@/organisms/DialogReply/DialogReply';
import { ResourceActions } from '@/organisms/ResourceActions/ResourceActions';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { getOtherLinks, getOwnLinkUris, mergeOtherLinkTags } from './ResourceOtherTags.utils';
import { ResourceReplies } from './ResourceReplies';

const EMPTY_STATE_IMAGE = '/images/post-not-found-empty-state.webp';

interface ResourceDetailsProps {
  /** The link the page is for (`?uri=`), as given; `null` when the page was opened without one. */
  uri: string | null;
  /**
   * The page's read of the link's card (`usePinakesCard(uri)`), shared with its sidebar cards;
   * `isResolving` while Pinakes is asked to read a link it did not know.
   */
  read: UsePinakesQueryResult<TPinakesResourceDetail> & { isResolving?: boolean };
  /** Reads the card again (the page remounts its read: a failed read is not cached). */
  onRetry: () => void;
  /** The page's read of the link's replies (`useResourceReplies`), shared with Participants. */
  replies: UseResourceRepliesResult;
}

/**
 * The resource page's body, where a post's page has the post: the heading, then the link's large
 * card with a post's footer. Without a card (Pinakes does not know the link or is not configured),
 * the link's own preview takes its place, with the same footer; when Pinakes cannot be read, it
 * says so and offers the plain link. While Pinakes reads a link it did not know (`resolve`: until it
 * answers, up to about two minutes while a pending card settles), the loading card holds its place, as on the first read; the link's preview shows only
 * once Pinakes has refused or given up. When a card replaces the link's preview (a resolve answering),
 * the footer is a new one (its tags and actions reset); the thread stays when its link is the same,
 * and so does a reply or a post being written in the page's Reply and Post about this composers.
 */
export function ResourceDetails(props: ResourceDetailsProps) {
  return (
    <>
      <PageHeading />
      <ResourceBody {...props} />
    </>
  );
}

function ResourceBody({ uri, read, onRetry, replies }: ResourceDetailsProps) {
  // The page's composer, opened from the footer of whichever card shows, one at a time: a reply to
  // the link, or a new post about it.
  const [composer, setComposer] = useState<{ kind: 'reply' | 'post'; uri: string } | null>(null);
  const dialogs: PageDialogs = {
    onReply: (replyUri) => setComposer({ kind: 'reply', uri: replyUri }),
    onPost: (postUri) => setComposer({ kind: 'post', uri: postUri }),
  };
  const closeComposer = (open: boolean) => {
    if (!open) setComposer(null);
  };
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
  const { data: card, isLoading, isError } = read;

  // The thread is on the acted-on link: the card's canonical one, else the page's; none on the
  // card's first read.
  let threadUri: string | null = uri;
  let body: React.ReactNode;
  if (isPinakesConfigured() && isLoading) {
    threadUri = null;
    body = <ResourceLoading uri={uri} replies={replies} dialogs={dialogs} />;
  } else if (!isPinakesConfigured()) {
    // The tags and replies come from Nexus: they show without Pinakes too.
    body = <ResourceUnknown uri={uri} replies={replies} dialogs={dialogs} />;
  } else if (isError) {
    body = (
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
  } else if (!card) {
    // Pinakes is reading the link (`resolve`): its card may still come.
    body = read.isResolving ? (
      <ResourceLoading uri={uri} replies={replies} dialogs={dialogs} />
    ) : (
      <ResourceUnknown uri={uri} replies={replies} dialogs={dialogs} />
    );
  } else {
    // The card's canonical link; the page's link, its refs and aliases are its spellings, read along.
    const target = getResourceTarget(card, uri);
    threadUri = target.uri;
    body = <ResourceKnown card={card} uri={uri} target={target} replies={replies} dialogs={dialogs} />;
  }
  // The thread and the composers are rendered once, past the body, so a card that replaces the
  // loading card or the link's own preview (a resolve answering) keeps the thread and a half-typed
  // quick reply when its link is the same, and a reply or a post being written.
  return (
    <>
      {body}
      {threadUri && <ResourceReplies key={threadUri} uri={threadUri} replies={replies} />}
      {/* Once the thread's link is known (past the first read), so the reply joins it at once. */}
      {composer?.kind === 'reply' && threadUri && (
        <DialogReply
          resourceUri={composer.uri}
          open
          onOpenChangeAction={closeComposer}
          onReplySubmitted={replies.addReply}
        />
      )}
      {composer?.kind === 'post' && (
        <DialogNewPost open onOpenChangeAction={closeComposer} initialContent={composer.uri} />
      )}
    </>
  );
}

/**
 * The large card while it is read: what is known without it (the link as its title, a web link's
 * site, the footer on the link as written, as `ResourceUnknown` has it) and "Loading details...";
 * skeletons for the rest (the footer's too for a link the app writes only once it has a card, such
 * as `btc:`). The card or the link's preview that takes its place brings a new footer
 * (an open menu or a half-typed tag start over); the thread and the page's composers stay.
 */
function ResourceLoading({ uri, replies, dialogs }: LinkActionsProps) {
  return (
    // A labelled section, so the name is announced (a plain `div` cannot carry one).
    <Container as="section" data-testid="resource-loading" aria-busy="true" aria-label="Loading external resource">
      <ResourceCardSkeleton withActions size="large" link={uri} actions={getLinkActions({ uri, replies, dialogs })} />
    </Container>
  );
}

/**
 * The card, large, closed by a post's footer; the page puts the thread of the posts replying to the
 * acted-on link (`target.uri`) under it. The other links' tags are read once the group is read (so
 * the chips do not reorder when it arrives), for the tag bar's one list.
 */
function ResourceKnown({
  card,
  uri,
  target,
  replies,
  dialogs,
}: {
  card: TPinakesResourceDetail;
  uri: string;
  target: ReturnType<typeof getResourceTarget>;
  replies: UseResourceRepliesResult;
  dialogs: PageDialogs;
}) {
  const actionUri = target.uri;
  // What "Post about this" and the ⋯ menu's link give, as a post's card does: a link people wrote
  // (the page's own when it is one), else the canonical link.
  const writtenUri = card.refs.includes(uri) ? uri : (card.refs[0] ?? actionUri);
  const { data: group, isLoading: isGroupLoading } = usePinakesGroup(card.group?.id);
  const otherLinks =
    card.group && isGroupLoading ? [] : getOtherLinks(card, group?.members, getOwnLinkUris(card, uri, actionUri));
  const otherTags = mergeOtherLinkTags(useOtherLinkTags(otherLinks).reads);
  // An X post shows X's own embed as the card's body, as in a post (`usePostEmbed`).
  const postEmbed = usePostEmbed(card, uri);
  // Embed or card, as in a post (`useCardPlayer`): the page's own link's player up front in place of
  // the card's image and text, a generic link's card; the switch in the large card's header. An X
  // post's embed, or its Show on, is its only source; once X cannot show it, its card is generic.
  const showsPost = postEmbed !== null && (postEmbed.isOpen || postEmbed.showPost !== undefined);
  const { embed, switcher } = useCardPlayer(showsPost ? null : card, uri, 'default');
  const actions = (
    <ResourceActions
      uri={actionUri}
      spellings={target.spellings}
      spellingsByUri
      postUri={getPostUri(card, writtenUri)}
      collectionsCount={card.collections}
      tagsLabel={getResourceTagsLabel(card)}
      linkUrl={getResourceLinks(card, writtenUri).linkUrl}
      title={card.name || null}
      otherTagList={otherTags}
      playOn={postEmbed?.showPost}
      size="large"
      replyCount={replies.replyCount}
      onReplySubmitted={replies.addReply}
      {...dialogs}
    />
  );
  return (
    <Container overrideDefaults data-testid="resource-details" className="min-w-0">
      <ResourceCard
        card={card}
        size="large"
        actions={actions}
        renderBody={
          embed
            ? () => (
                <>
                  {/* The player shows the title; the page keeps it as its heading for screen readers. */}
                  <Typography as="h2" overrideDefaults className="sr-only">
                    {card.name?.trim() || uri}
                  </Typography>
                  {embed}
                </>
              )
            : postEmbed?.renderBody
        }
        isBodyReplaced={postEmbed?.isOpen}
        headerControl={switcher}
      />
    </Container>
  );
}

/**
 * An X post's own embed (a provider whose `resourceKind` is `post`) as the large card's body, chosen
 * as in a post (`chooseNativeEmbed`): up front, its only source (no switch). A post X cannot show
 * leaves our card without the pill. `null` for any other link. A viewer who turned platform embeds
 * up front off (Settings, Links & Media) gets our card with "Show on <site>".
 */
function usePostEmbed(card: TPinakesResourceDetail, uri: string) {
  const [isPostOpen, setIsPostOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  const found = [uri, card.uri]
    .map((link) => parseUrlForLinkEmbed(link, false))
    .find(({ provider }) => provider?.resourceKind === 'post');
  if (!found?.embed || !found.provider) return null;
  const { embed, provider } = found;

  const choice = chooseNativeEmbed({
    hasCard: getNativeEmbedCard(card) !== null,
    embedFailed: failed,
    upFront: embedsUpFront,
  });
  const isOpen = !failed && (choice === 'embed' || isPostOpen);
  // The card player's pill, as on a post's card, on the page's surface.
  const showPost =
    choice === 'card' && !failed ? (
      <PlayOnPill
        uri={uri}
        isOpen={isPostOpen}
        label={getShowPostLabel(getResourceLinks(card, uri).siteName, isPostOpen)}
        surface="default"
        aria-expanded={isPostOpen}
        onClick={() => setIsPostOpen((open) => !open)}
        data-testid="show-embed"
      />
    ) : undefined;
  // Only while the embed shows: otherwise the card's own body.
  const renderBody = isOpen
    ? () => (
        <>
          {/* The embed shows the post's text; the page keeps it as its heading for screen readers. */}
          <Typography as="h2" overrideDefaults className="sr-only">
            {card.name?.trim() || uri}
          </Typography>
          <Container overrideDefaults className="min-w-0" data-testid="native-embed-body">
            {provider.renderEmbed(embed, { isPostEmbed: true, onEmbedError: () => setFailed(true), fill: true })}
          </Container>
        </>
      )
    : undefined;
  return { showPost, renderBody, isOpen };
}

/**
 * A link Pinakes has no card for (it would not read it, has not yet, or is not configured): the
 * link's own preview, as a post shows such a link (`ResourceLinkCard`), large, closed by the same
 * footer as a card, on the link as written: tags and replies are Nexus', by link, and need no card.
 * A URI the app does not write (`javascript:`, junk, a link with credentials) gets no footer. The
 * page puts the posts replying to it under it.
 */
function ResourceUnknown({ uri, replies, dialogs }: LinkActionsProps) {
  return (
    <Container overrideDefaults data-testid="resource-unknown" className="min-w-0">
      <ResourceLinkCard url={uri} size="large" actions={getLinkActions({ uri, replies, dialogs })} />
    </Container>
  );
}

/** Open the page's composers (`ResourceActions` `onReply`, `onPost`). */
interface PageDialogs {
  onReply: (uri: string) => void;
  onPost: (uri: string) => void;
}

interface LinkActionsProps {
  uri: string;
  replies: UseResourceRepliesResult;
  dialogs: PageDialogs;
}

/** The footer on the link as written, with no card; none for a URI the app does not write. */
function getLinkActions({ uri, replies, dialogs }: LinkActionsProps) {
  if (!isWritableResourceUri(uri)) return undefined;
  // A link that is not web (`isbn:`, `geo:`) has no web address to post about or copy.
  const linkUrl = getHttpUrl(uri);
  return (
    <ResourceActions
      uri={uri}
      postUri={linkUrl}
      tagsLabel={getResourceTagsLabel(null)}
      linkUrl={linkUrl}
      size="large"
      replyCount={replies.replyCount}
      onReplySubmitted={replies.addReply}
      {...dialogs}
    />
  );
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
