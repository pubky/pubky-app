'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { Audio } from '@/atoms/Audio/Audio';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { Video } from '@/atoms/Video/Video';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { getLinkHost } from '@/molecules/ResourceCard/ResourceCard.utils';
import { PlayOnPill } from '@/molecules/ResourcePlayer/ResourcePlayerControls';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { getShowPostLabel } from '../Native/nativeEmbed.utils';
import { GenericPreviewSkeleton } from './GenericPreview.skeleton';

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
  if (type === 'image')
    return (
      <Link overrideDefaults href={url}>
        <Image src={url} alt="Image preview" className="w-full rounded-md object-contain" />
      </Link>
    );
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
            src={image}
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
 * A video or audio file the link is: the player right away with platform embeds up front on; else
 * nothing is asked from its site until Play on is pressed (the card player's pill), then the player,
 * started by that press.
 */
function MediaPreview({ url, type }: { url: string; type: 'video' | 'audio' }) {
  const embedsUpFront = useSettingsStore((state) => state.media.embedsUpFront);
  const [isOpen, setIsOpen] = useState(false);
  const shows = embedsUpFront || isOpen;
  const player =
    type === 'video' ? (
      <Video src={url} autoPlay={!embedsUpFront} className="w-full cursor-auto object-contain" />
    ) : (
      <Audio src={url} autoPlay={!embedsUpFront} className="cursor-auto" />
    );
  if (embedsUpFront) return player;
  return (
    <Container overrideDefaults className="flex min-w-0 flex-col gap-3" data-testid="media-on-press">
      <PlayOnPill
        uri={url}
        isOpen={isOpen}
        label={getShowPostLabel(getLinkHost(url), isOpen, true)}
        aria-expanded={isOpen}
        className="self-start"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="show-embed"
      />
      {shows && player}
    </Container>
  );
}
