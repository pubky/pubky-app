'use client';

import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import * as Atoms from '@/atoms';
import { GenericPreviewSkeleton } from './GenericPreview.skeleton';
import { Globe } from 'lucide-react';

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
      <Atoms.Link overrideDefaults href={url}>
        <Atoms.Image src={url} alt="Image preview" className="w-full rounded-md object-contain" />
      </Atoms.Link>
    );
  if (type === 'video') return <Atoms.Video src={url} className="w-full cursor-auto object-contain" />;
  if (type === 'audio') return <Atoms.Audio src={url} className="cursor-auto" />;
  return (
    <Atoms.Link data-testid="generic-website-preview" href={url}>
      <Atoms.Container className="justify-between gap-6 rounded-md bg-muted p-6 lg:flex-row">
        <Atoms.Container className="gap-y-2">
          {title && (
            <Atoms.Typography size="lg" className="wrap-break-word">
              {title}
            </Atoms.Typography>
          )}

          <Atoms.Container className="flex-row items-center gap-x-1">
            <Globe size={13} className="shrink-0 text-muted-foreground" />

            <Atoms.Typography
              size="sm"
              className="max-w-50 overflow-hidden font-medium text-ellipsis whitespace-nowrap text-muted-foreground sm:max-w-none sm:whitespace-normal"
            >
              {displayUrl}
            </Atoms.Typography>
          </Atoms.Container>
        </Atoms.Container>

        {image && (
          <Atoms.Image
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
      </Atoms.Container>
    </Atoms.Link>
  );
}
