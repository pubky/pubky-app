'use client';

import { getResourceRoute, getUserProfileUrl } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { isPinakesConfigured, PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { usePubkyAppFile } from '@/hooks/usePubkyAppFile/usePubkyAppFile';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { isExternalParentUri } from '@/libs/post/externalParent';
import { getPubkyAppTarget, isPubkyAppAddress, type TPubkyAppTarget } from '@/libs/pubkyApp/pubkyAppTarget';
import { cn } from '@/libs/utils/utils';
import { PlatformEmbedResource } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds';
import { parseUrlForLinkEmbed } from '@/molecules/PostLinkEmbeds/PostLinkEmbeds.utils';
import { GenericResourcePreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericResourcePreview';
import { useSlowRead } from '@/molecules/PostLinkEmbeds/Providers/Generic/useSlowRead';
import {
  getAlsoOnIdentifier,
  getAlsoOnName,
  getHttpUrl,
  getPubkyObjectApp,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceFileCard } from '@/molecules/ResourceCard/ResourceFileCard';
import { FILE_TAGS_LABEL, FILE_TYPE_LABEL } from '@/molecules/ResourceCard/ResourceFileCard.utils';
import { ResourceRowContent } from '@/molecules/ResourceCard/ResourceRowContent';
import { ResourceSurfaceProvider } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { getCategoryPlayers, PlayerCategory } from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { ResourceActions } from '@/organisms/ResourceActions/ResourceActions';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useSettingsStore } from '@/stores/settings/settings.store';

interface ResourceItemProps {
  /** The resource: a web link or any other URI (`isbn:`, `geo:`, a DOI, a Pubky app's object, a pubky.app file). */
  uri: string;
  'data-testid'?: string;
}

/**
 * Whether Pinakes is asked for the card of a URI that is no web link: another Pubky app's object
 * (`pubky://…`, a Loopky deck; never anything in pubky.app's own trees, `isPubkyAppAddress`, which
 * Pinakes does not read) or an identifier a post may name (`isbn:`, `doi:`…), never anything else
 * written into a collection (`javascript:`).
 */
const hasCardToRead = (uri: string) =>
  (uri.startsWith('pubky://') && !isPubkyAppAddress(uri)) || isExternalParentUri(uri);

/**
 * An item of a list of resources (a feed of resources, search, saved links): a pubky.app object as
 * the app's own (`AppObjectItem`), any other URI as an external resource (`ExternalResourceItem`).
 */
export function ResourceItem(props: ResourceItemProps) {
  const target = getPubkyAppTarget(props.uri);
  return target ? <AppObjectItem {...props} target={target} /> : <ExternalResourceItem {...props} />;
}

/**
 * An external resource shown as an item of its own, in no post (a collection's items, a feed of
 * resources): a web link as a post's embed shows it, standing on the post card's surface: one with a
 * platform embed (an X post, a YouTube or Vimeo video) as that resource, embed or card
 * (`PlatformEmbedResource`), any other as its card (`GenericResourcePreview`); any other URI Pinakes
 * has a named card for (a Pubky app's object, a book by its ISBN) as that card too, named and
 * credited to its site as on its page. Any other URI is a row
 * opening its page, on its item's surface: a Pubky object named by its app, never by its path. It is
 * a grid cell, a `@container/grid` as the Cards layout's cells are, so the card's footer stacks its
 * tags and actions when the cell is narrow.
 */
function ExternalResourceItem({ uri, 'data-testid': testId }: ResourceItemProps) {
  const webLink = getHttpUrl(uri);
  const lookup = !webLink && hasCardToRead(uri) ? uri : null;
  const { data: card, isLoading } = usePinakesCard(lookup);
  // A read slower than a link card's gives way to the row; the card takes its place once read
  const isSlow = useSlowRead(lookup, isLoading, PINAKES_SLOW_READ_MS);
  const cardLink = webLink ?? (card?.name?.trim() ? uri : null);
  const isRow = cardLink === null && (!isLoading || isSlow);
  const app = getPubkyObjectApp(uri);
  const media = useSettingsStore((state) => state.media);
  // YouTube and Vimeo, the only platform embeds with a player here, follow Video's Players, as in a post.
  const { hiddenPlayers } = getCategoryPlayers(media, PlayerCategory.VIDEO);
  // A platform whose player the viewer removed from Players embeds nothing; without Pinakes, the card.
  const { embed, provider } = parseUrlForLinkEmbed(webLink, false, hiddenPlayers);
  const kind = isPinakesConfigured() ? provider?.resourceKind : undefined;
  // The platform's embed pauses off screen and stops other media when it starts, as in a post.
  const mediaContainerRef = usePauseMediaOutsideViewport();
  return (
    <Container
      overrideDefaults
      className={cn('@container/grid min-w-0', isRow && 'rounded-md bg-card p-4')}
      data-testid={testId}
    >
      {cardLink ? (
        <ResourceSurfaceProvider surface="card">
          {webLink && embed && provider && kind ? (
            <Container ref={mediaContainerRef} overrideDefaults className="min-w-0">
              <PlatformEmbedResource key={webLink} url={webLink} embed={embed} provider={provider} kind={kind} />
            </Container>
          ) : (
            <GenericResourcePreview url={cardLink} />
          )}
        </ResourceSurfaceProvider>
      ) : !isRow ? (
        <ResourceSurfaceProvider surface="card">
          <ResourceCardSkeleton withActions />
        </ResourceSurfaceProvider>
      ) : (
        <ItemRow uri={uri} name={app ?? getAlsoOnName({ uri })} note={app ? null : getAlsoOnIdentifier({ uri })} />
      )}
    </Container>
  );
}

/** A row opening the item's page (`getResourceRoute`, or `href`), on its item's surface (`rounded-md bg-card p-4`). */
function ItemRow({ uri, name, note = null, href }: { uri: string; name: string; note?: string | null; href?: string }) {
  return (
    <Link
      href={href ?? getResourceRoute(uri)}
      overrideDefaults
      className="flex min-w-0 items-center gap-2 rounded-md text-sm transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ResourceRowContent uri={uri} name={name} note={note} />
    </Link>
  );
}

/**
 * A pubky.app object in a list of resources (Nexus keeps a tag on a pubky.app file as a resource
 * tag): never asked of Pinakes, which reads no pubky.app object. A file shows as the file itself
 * (`ResourceFileCard`) with a resource's footer on its URI, the card's skeleton while its details
 * are read; a file Nexus does not know is a quiet row named "File". A post or a profile is a row
 * opening its own page.
 */
function AppObjectItem({ uri, target, 'data-testid': testId }: ResourceItemProps & { target: TPubkyAppTarget }) {
  if (target.kind === 'file') {
    return <AppFileItem uri={uri} ownerId={target.ownerId} fileUri={target.uri} data-testid={testId} />;
  }
  if (target.kind === 'user') return <AppProfileItem uri={uri} userId={target.userId} data-testid={testId} />;
  return (
    <Container overrideDefaults className="@container/grid min-w-0 rounded-md bg-card p-4" data-testid={testId}>
      <ItemRow uri={uri} name="Post" />
    </Container>
  );
}

/** A profile's row: the viewer's own opens `/profile`, as a post header's link does (`getUserProfileUrl`). */
function AppProfileItem({ uri, userId, 'data-testid': testId }: ResourceItemProps & { userId: string }) {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  return (
    <Container overrideDefaults className="@container/grid min-w-0 rounded-md bg-card p-4" data-testid={testId}>
      <ItemRow uri={uri} name="Profile" href={getUserProfileUrl(userId, currentUserPubky)} />
    </Container>
  );
}

function AppFileItem({
  uri,
  ownerId,
  fileUri,
  'data-testid': testId,
}: ResourceItemProps & { ownerId: string; fileUri: string }) {
  // The footer reads the file's tags once the item is first on screen, as a card's does.
  const { ref, isVisible } = useViewportObserver({ rootMargin: '0px' });
  const { file, isLoading } = usePubkyAppFile(fileUri);
  const isRow = !isLoading && !file;
  return (
    <Container
      overrideDefaults
      ref={ref}
      className={cn('@container/grid min-w-0', isRow && 'rounded-md bg-card p-4')}
      data-testid={testId}
    >
      {isRow ? (
        <ItemRow uri={uri} name={FILE_TYPE_LABEL} />
      ) : (
        <ResourceSurfaceProvider surface="card">
          {file ? (
            <ResourceFileCard
              uri={uri}
              ownerId={ownerId}
              file={file}
              actions={
                <ResourceActions
                  uri={uri}
                  postUri={null}
                  tagsLabel={FILE_TAGS_LABEL}
                  linkUrl={null}
                  title={file.name}
                  isOnScreen={isVisible}
                />
              }
            />
          ) : (
            <ResourceCardSkeleton withActions />
          )}
        </ResourceSurfaceProvider>
      )}
    </Container>
  );
}
