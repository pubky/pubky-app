'use client';

import type { ReactNode } from 'react';
import { getResourceRoute, getUserProfileUrl } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { cn, formatPublicKey, resolveUserDisplayName } from '@/libs/utils/utils';
import { PostAttachmentsAudios } from '@/molecules/PostAttachmentsAudios/PostAttachmentsAudios';
import { PostAttachmentsGenericFiles } from '@/molecules/PostAttachmentsGenericFiles/PostAttachmentsGenericFiles';
import { PostAttachmentsImagesAndVideos } from '@/molecules/PostAttachmentsImagesAndVideos/PostAttachmentsImagesAndVideos';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { splitAttachmentsByMediaType } from '@/organisms/PostAttachments/PostAttachments.helpers';
import type { NexusFileDetails } from '@/services/nexus/nexus.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { CARD_MUTED_TEXT, ResourceCardFrame, ResourceCardHeader } from './ResourceCardFrame';
import { FILE_TYPE_LABEL, getFileDetailsLine } from './ResourceFileCard.utils';

interface ResourceFileCardProps {
  /** The file's URI, as tagged. */
  uri: string;
  /** Whose file it is: the key in its URI. */
  ownerId: string;
  /** The file's details (`usePubkyAppFile`), or `null` for a file Nexus does not know. */
  file: NexusFileDetails | null;
  /** The footer: tags and actions on the file's URI. */
  actions?: ReactNode;
  /**
   * `large`: atop the file's own page (`/resource?uri=…`), as a resource's large card: the name is
   * the page's heading and no link, and the card is no click-through.
   */
  size?: 'default' | 'large';
}

/**
 * A pubky.app file shown as a file, never as an external resource: in the resource frame (as
 * `ResourceLinkCard`), its type "File" on the left and its owner's avatar and name on the right,
 * opening their profile; its name as the title, its type and size under it; then the file itself,
 * through a post's attachment parts: an image or a video inline (the image opens the lightbox), an
 * audio in the app's player, any other type as the file tile that opens it. A file Nexus does not
 * know shows "File" as its title and nothing else. The footer (`actions`) is a resource's: its tags
 * are Nexus' resource tags on the file's URI. The title and a click on the card open the file's page;
 * a click on the file itself, as on a post, never does.
 */
export function ResourceFileCard({ uri, ownerId, file, actions, size = 'default' }: ResourceFileCardProps) {
  const isLarge = size === 'large';
  const navigable = useIsPostPreviewNavigable();
  // The large card heads the file's own page: no click-through to it.
  const clickThroughUrl = isLarge ? null : getResourceRoute(uri);
  const title = file?.name?.trim() || FILE_TYPE_LABEL;
  const detailsLine = file ? getFileDetailsLine(file) : null;
  // A row without a type is a file of any type (the tile), never a broken card; one without a name is "File".
  const { imagesAndVideos, audios, genericFiles } = splitAttachmentsByMediaType(
    file ? [{ ...file, name: title, content_type: file.content_type || 'application/octet-stream' }] : [],
  );
  const hasMedia = imagesAndVideos.length + audios.length + genericFiles.length > 0;

  return (
    <ResourceCardFrame
      clickThroughUrl={clickThroughUrl}
      // The large card stands where a post stands on its page, on the post card's surface (`ResourceCard`).
      className={cn(isLarge && [CARD_MUTED_TEXT, 'bg-card text-card-foreground shadow-sm'])}
      data-testid="resource-file-card"
      data-size={size}
    >
      <Container
        overrideDefaults
        className={cn('flex min-w-0 flex-col gap-3', isLarge ? 'p-6' : 'p-4', clickThroughUrl && 'cursor-pointer')}
      >
        <ResourceCardHeader
          typeLabel={FILE_TYPE_LABEL}
          sourceUri={uri}
          href={null}
          siteName={null}
          source={<ResourceFileOwner ownerId={ownerId} />}
        />
        <Container overrideDefaults className="flex min-w-0 flex-col gap-1">
          {/* Like a card's title: the page's heading on the large card, else a link to the file's page
              (in a new tab where links may not navigate). */}
          {isLarge ? (
            <Typography
              as="h2"
              overrideDefaults
              dir="auto"
              data-testid="resource-file-card-title"
              className="min-w-0 text-xl font-bold wrap-anywhere text-foreground sm:text-2xl"
            >
              {title}
            </Typography>
          ) : (
            <Link
              href={getResourceRoute(uri)}
              target={navigable ? undefined : '_blank'}
              rel={navigable ? undefined : 'noopener noreferrer'}
              overrideDefaults
              dir="auto"
              data-testid="resource-file-card-title"
              className="min-w-0 text-base font-bold wrap-anywhere text-foreground hover:text-brand"
            >
              {title}
            </Link>
          )}
          {detailsLine && (
            <Typography
              as="span"
              overrideDefaults
              data-testid="resource-file-card-details"
              className="text-sm text-muted-foreground"
            >
              {detailsLine}
            </Typography>
          )}
        </Container>
        {hasMedia && (
          // The file's own controls (the lightbox, the players, the tile's link): a press never opens its page.
          <Container overrideDefaults data-resource-controls className="flex min-w-0 flex-col gap-3">
            {imagesAndVideos.length > 0 && (
              // At most as wide as a post's media, in the middle of a wide card (a feed's Wide layout, the page).
              <Container overrideDefaults className="mx-auto w-full max-w-2xl">
                <PostAttachmentsImagesAndVideos imagesAndVideos={imagesAndVideos} />
              </Container>
            )}
            {audios.length > 0 && <PostAttachmentsAudios audios={audios} />}
            {genericFiles.length > 0 && <PostAttachmentsGenericFiles genericFiles={genericFiles} allTypes />}
          </Container>
        )}
      </Container>

      {actions}
    </ResourceCardFrame>
  );
}

/**
 * The file's owner where a card names its site: their avatar and name (their key, shortened, until
 * their profile is read), opening their profile, as a post's header does (`PostHeaderUserInfo`).
 */
function ResourceFileOwner({ ownerId }: { ownerId: string }) {
  const { userDetails } = useUserDetails(ownerId);
  const avatarUrl = useAvatarUrl(userDetails);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const navigable = useIsPostPreviewNavigable();
  const name = resolveUserDisplayName(userDetails) || formatPublicKey({ key: ownerId });
  return (
    <Link
      href={getUserProfileUrl(ownerId, currentUserPubky)}
      target={navigable ? undefined : '_blank'}
      rel={navigable ? undefined : 'noopener noreferrer'}
      overrideDefaults
      aria-label={`File by ${name}: open their profile`}
      data-testid="resource-file-owner"
      className="ml-auto flex min-w-0 shrink items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-brand"
    >
      <AvatarWithFallback avatarUrl={avatarUrl} name={name} fallbackSeed={ownerId} size="xs" />
      <span className="truncate">{name}</span>
    </Link>
  );
}
