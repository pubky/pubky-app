'use client';

import { Globe } from 'lucide-react';
import { Audio } from '@/atoms/Audio/Audio';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { Video } from '@/atoms/Video/Video';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
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
  if (type === 'video') return <Video src={url} className="w-full cursor-auto object-contain" />;
  if (type === 'audio') return <Audio src={url} className="cursor-auto" />;
  return (
    <Link data-testid="generic-website-preview" href={url}>
      <Container className="justify-between gap-6 rounded-md bg-muted p-6 lg:flex-row">
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
