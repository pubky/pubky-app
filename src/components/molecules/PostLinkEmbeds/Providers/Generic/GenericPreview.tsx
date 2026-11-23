'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { Audio } from '@/atoms/Audio/Audio';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { Video } from '@/atoms/Video/Video';
import { isPinakesConfigured, PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { fileNameFromUrl } from '@/libs/file/inlineMediaKind';
import { getImageRetryUrl, getLinkImageUrl, getResourceImageUrl } from '@/libs/image/resourceImage';
import {
  getDisplayLink,
  getHttpUrl,
  getLinkHost,
  getResourceStatus,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceLinkCard } from '@/molecules/ResourceCard/ResourceLinkCard';
import { PlayOnPill } from '@/molecules/ResourcePlayer/ResourcePlayerControls';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { GenericPreviewSkeleton } from './GenericPreview.skeleton';
import { useSlowRead } from './useSlowRead';

interface GenericPreviewProps {
  url: string;
}

/**
 * Generic website preview component using SWR for caching
 * Fetches OpenGraph metadata via /api/og-metadata
 */
export function GenericPreview({ url }: GenericPreviewProps) {
  const { metadata, isLoading, error } = useOgMetadata(url);
  if (isLoading) {
    return <GenericPreviewSkeleton />;
  }
  if (error || !metadata) {
    return null;
  }
  const { url: displayUrl, title, image, type } = metadata;
  if (type === 'image') return <ImageFilePreview url={url} />;
  if (type === 'video' || type === 'audio') return <MediaPreview url={url} type={type} />;
  return (
    <Link data-testid="generic-website-preview" href={url}>
      <Container className="justify-between gap-6 rounded-md bg-embed p-6 lg:flex-row @max-xl/grid:flex-col!">
        <Container className="gap-y-2">
          {title && (
            <Typography size="lg" className="wrap-break-word">
              {title}
            </Typography>
          )}

          <Container className="flex-row items-center gap-x-1">
            <Globe size={13} className="shrink-0 text-muted-foreground" />

            <Typography
              size="sm"
              className="max-w-50 overflow-hidden font-medium text-ellipsis whitespace-nowrap text-muted-foreground sm:max-w-none sm:whitespace-normal"
            >
              {displayUrl}
            </Typography>
          </Container>
        </Container>

        {image && (
          <Image
            // From the app's image route: the preview's image only, never asked from its host.
            src={getLinkImageUrl(url, image) ?? ''}
            alt="Website social image"
            width={180}
            height={100}
            onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
              e.currentTarget.style.display = 'none';
            }}
            className="h-25 w-45 shrink-0 rounded-md object-cover object-center"
          />
        )}
      </Container>
    </Link>
  );
}

/**
 * A link straight to an image file. With platform embeds up front on, the image from its host, as ever.
 * Off, nothing is asked from its host: Pinakes is asked to read the link once it is on screen
 * (`usePinakesCard`'s `resolveOnView`), which makes an image's card whose image is the file, and the
 * image shows from the app's image route as any card's (`?uri=<link>&src=<image>`), asked once more after
 * a failed answer. With no card (Pinakes unset or not reading it), or an image the route cannot serve,
 * the link shows as a finished card (`ResourceLinkCard`: the file's name and site), never as bare text.
 */
function ImageFilePreview({ url }: { url: string }) {
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  const { ref, isVisible } = useViewportObserver({ rootMargin: '0px' });
  if (embedsUpFront) {
    return (
      <Link overrideDefaults href={url}>
        <Image src={url} alt="Image preview" className="w-full rounded-md object-contain" />
      </Link>
    );
  }
  return (
    <Container overrideDefaults ref={ref} className="min-w-0" data-testid="image-file">
      <ImageFileCard url={url} isOnScreen={isVisible} />
    </Container>
  );
}

function ImageFileCard({ url, isOnScreen }: { url: string; isOnScreen: boolean }) {
  const { data, isLoading, isResolving } = usePinakesCard(isPinakesConfigured() ? url : null, {
    recheck: isOnScreen,
    resolveOnView: isOnScreen,
  });
  const isReading = isLoading || Boolean(isResolving);
  const isSlow = useSlowRead(url, isReading, PINAKES_SLOW_READ_MS);
  const [failures, setFailures] = useState(0);
  // A settled card's image: the route serves no image of a card Pinakes is still reading.
  const image = data && getResourceStatus(data.status) !== PinakesStatus.PENDING ? getHttpUrl(data.image) : null;
  const routeImage = data && image ? getResourceImageUrl(data.uri, image) : null;
  if (isReading && !isSlow) return <GenericPreviewSkeleton />;
  if (!routeImage || failures > 1) {
    return <ResourceLinkCard url={url} title={getFileName(url)} typeLabel="Image" keepFrame />;
  }
  return (
    <Link overrideDefaults href={url}>
      <Image
        src={failures > 0 ? getImageRetryUrl(routeImage) : routeImage}
        alt="Image preview"
        data-testid="image-file-preview"
        onError={() => setFailures((count) => count + 1)}
        className="w-full rounded-md object-contain"
      />
    </Link>
  );
}

/** A file link's name (the media helpers read `https:` links only: an `http:` link's from its `https:` form). */
function getFileName(url: string): string {
  return fileNameFromUrl(url.replace(/^http:/i, 'https:')) ?? getDisplayLink(url);
}

/**
 * A video or audio file the link is: the player right away with platform embeds up front on. Else the
 * link as a finished card from the app's origin (`ResourceLinkCard`: the file's kind, site and name) with
 * Play in its header; nothing is asked from the file's site until that press, which loads the player
 * inside the card, started by it. The same pill closes it, back to the card.
 */
function MediaPreview({ url, type }: { url: string; type: 'video' | 'audio' }) {
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  const [isOpen, setIsOpen] = useState(false);
  const site = getLinkHost(url) ?? url;
  const name = getFileName(url);
  const player =
    type === 'video' ? (
      <Video src={url} autoPlay={!embedsUpFront} className="w-full cursor-auto object-contain" />
    ) : (
      <Audio src={url} autoPlay={!embedsUpFront} className="cursor-auto" />
    );
  if (embedsUpFront) return player;
  return (
    <Container overrideDefaults className="min-w-0" data-testid="media-preview" data-type={type}>
      <ResourceLinkCard
        url={url}
        title={name}
        typeLabel={type === 'video' ? 'Video' : 'Audio'}
        keepFrame
        headerControl={
          <PlayOnPill
            uri={url}
            isOpen={isOpen}
            label={isOpen ? `Close ${name}` : `Play ${name} on ${site}`}
            text="Play"
            aria-expanded={isOpen}
            onClick={() => setIsOpen(!isOpen)}
            data-testid="show-embed"
          />
        }
        player={
          isOpen ? (
            <Container overrideDefaults data-testid="media-preview-player" className="min-w-0">
              {player}
            </Container>
          ) : undefined
        }
      />
    </Container>
  );
}
