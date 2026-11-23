'use client';

import { type ReactNode, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { getYouTubeThumbnailUrl } from '@/libs/image/resourceImage';
import { extractYouTubeVideoId } from '@/libs/utils/videoUrl';
import { getLinkHost } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceLinkCard } from '@/molecules/ResourceCard/ResourceLinkCard';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { getPlayerTarget } from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { PlayOnPill } from '@/molecules/ResourcePlayer/ResourcePlayerControls';
import type { EmbedResourceKind } from '../Provider.types';
import { getShowPostLabel } from './nativeEmbed.utils';

/** A YouTube video's 16:9 thumbnail sizes, in the order the card tries them (`mqdefault` every video has). */
const YOUTUBE_SIZES = ['hq720', 'mqdefault'] as const;

interface NativeEmbedLinkCardProps {
  /** The link as written. */
  link: string;
  kind: EmbedResourceKind;
  /** The platform's embed, loaded by the press: a video starts on load. */
  renderEmbed: () => ReactNode;
  /** The post's footer for the link (`ResourceActions`), when it is the post's embed. */
  actions?: ReactNode;
  /** Whether the embed is open, when the caller keeps it (it may close it: an embed X cannot show). */
  open?: boolean;
  /** Told when the press opens or closes the embed. */
  onOpen?: (isOpen: boolean) => void;
}

/**
 * A platform's link (a YouTube or Vimeo video, an X post) that has no Pinakes card, with platform embeds
 * up front off: the link's own preview as a finished card from the app's origin (`ResourceLinkCard`:
 * its title and site, under them a YouTube video's thumbnail from the image route, else the page's own
 * preview image), with Play on <site> (Show on <site> for a post) in its header. The press loads the
 * platform's embed inside the card, in the image's place, a video started by that press; the same pill
 * closes it, back to the card. Nothing is asked from the platform before the press.
 */
export function NativeEmbedLinkCard({ link, kind, renderEmbed, actions, open, onOpen }: NativeEmbedLinkCardProps) {
  const [ownOpen, setIsOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  // On the post card's surface (a collection's item, a quoted post) the pill is the post's own.
  const surface = useResourceSurface() === 'card' ? 'default' : undefined;
  const isVideo = kind === 'video';
  const siteName = getPlayerTarget(link)?.name ?? getLinkHost(link);
  const youTubeId = isVideo ? extractYouTubeVideoId(link) : null;
  // A video shows a still under its title, as a player would: YouTube's own thumbnail sizes, else
  // (Vimeo) its page's preview image, both from the image route.
  const images = youTubeId
    ? YOUTUBE_SIZES.map((size) => getYouTubeThumbnailUrl(youTubeId, size))
    : isVideo
      ? []
      : undefined;
  return (
    <ResourceLinkCard
      url={link}
      actions={actions}
      typeLabel={isVideo ? 'Video' : 'Post'}
      images={images}
      headerControl={
        <PlayOnPill
          uri={link}
          isOpen={isOpen}
          label={getShowPostLabel(siteName, isOpen, isVideo)}
          text={isVideo ? 'Play' : 'Show'}
          aria-expanded={isOpen}
          surface={surface}
          onClick={() => {
            setIsOpen(!isOpen);
            onOpen?.(!isOpen);
          }}
          data-testid="show-embed"
        />
      }
      player={
        isOpen ? (
          <Container overrideDefaults className="min-w-0" data-testid="native-embed-body">
            {renderEmbed()}
          </Container>
        ) : undefined
      }
    />
  );
}
