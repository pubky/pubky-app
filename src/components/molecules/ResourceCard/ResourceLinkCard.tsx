'use client';

import { type ReactNode, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Image } from '@/atoms/Image/Image';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { cn } from '@/libs/utils/utils';
import { GenericPreview } from '@/molecules/PostLinkEmbeds/Providers/Generic/GenericPreview';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { getDisplayLink, getHttpUrl, getLinkHost } from './ResourceCard.utils';
import { ResourceCardFrame, ResourceCardHeader } from './ResourceCardFrame';

interface ResourceLinkCardProps {
  /** The link as written in the post. */
  url: string;
  /** The action row and tag bar; absent while composing. */
  actions?: ReactNode;
}

/**
 * An external resource Pinakes has no card for: the link's own preview (its Open Graph title and
 * image) in the same frame as a card, with the host as the source on the right and the same
 * actions. Without a preview the link itself, without its scheme, is the title.
 *
 * A link the preview reads as an image, video or audio file keeps `GenericPreview`, which shows or
 * plays it inline.
 */
export function ResourceLinkCard({ url, actions }: ResourceLinkCardProps) {
  const { metadata, isLoading } = useOgMetadata(url);
  const [failedImage, setFailedImage] = useState<string | null>(null);

  if (isLoading) return <ResourceCardSkeleton withActions={Boolean(actions)} />;
  if (metadata && metadata.type !== 'website') return <GenericPreview url={url} />;

  const linkUrl = getHttpUrl(url);
  const title = metadata?.title?.trim() || getDisplayLink(url);
  const imageUrl = getHttpUrl(metadata?.image);
  const showImage = imageUrl !== null && failedImage !== imageUrl;

  return (
    <ResourceCardFrame clickThroughUrl={linkUrl} data-testid="resource-link-card">
      <Container overrideDefaults className={cn('flex min-w-0 flex-col gap-3 p-4', linkUrl && 'cursor-pointer')}>
        <ResourceCardHeader typeLabel={null} sourceUri={url} href={linkUrl} siteName={getLinkHost(url)} />
        <Container overrideDefaults className="flex min-w-0 gap-4">
          {showImage && (
            <Image
              src={imageUrl}
              alt=""
              width={96}
              height={96}
              data-testid="resource-link-card-image"
              onError={() => setFailedImage(imageUrl)}
              className="size-20 shrink-0 rounded-md object-cover object-center sm:size-24"
            />
          )}
          {linkUrl ? (
            <Link
              href={linkUrl}
              overrideDefaults
              data-testid="resource-link-card-title"
              className="min-w-0 flex-1 text-base font-bold wrap-anywhere text-foreground hover:text-brand"
            >
              {title}
            </Link>
          ) : (
            <Typography data-testid="resource-link-card-title" className="min-w-0 flex-1 font-bold wrap-anywhere">
              {title}
            </Typography>
          )}
        </Container>
      </Container>

      {actions}
    </ResourceCardFrame>
  );
}
