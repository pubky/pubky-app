'use client';

import type { ReactNode } from 'react';
import { getResourceRoute } from '@/app/routes';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getHttpUrl, getLinkHost, getResourceLinks, getResourceTypeLabel } from './ResourceCard.utils';
import { CARD_MUTED_TEXT, ResourceCardFrame, ResourceCardHeader } from './ResourceCardFrame';

interface ResourceEmbedFrameProps {
  /** The link as written: what the source opens and the tags and actions are on. */
  url: string;
  /** The link's Pinakes card when there is one: its type opens the resource page, its site names the source. */
  card: TPinakesResourceDetail | null;
  /** The resource's footer (`ResourceActions`). */
  actions: ReactNode;
  /** The platform's own embed (an X post, a video, a music player). */
  children: ReactNode;
  /** What the embed is, named in the header when there is no card to say it ("Post", "Video"). */
  fallbackTypeLabel?: string;
}

/**
 * A platform's own embed, as the platform makes it, in the resource card's frame: the header's type
 * opens the resource page and its source the link; the footer is the resource's tags and actions.
 * Without a card the header names the host and `fallbackTypeLabel`. The frame is no click-through:
 * the embed is its own set of controls.
 */
export function ResourceEmbedFrame({
  url,
  card,
  actions,
  children,
  fallbackTypeLabel = 'Link',
}: ResourceEmbedFrameProps) {
  const links = card ? getResourceLinks(card, url) : null;
  const typeLabel = (card ? getResourceTypeLabel(card) : null) ?? fallbackTypeLabel;
  const href = links?.linkUrl ?? getHttpUrl(url);

  return (
    <ResourceCardFrame clickThroughUrl={null} data-testid="resource-embed-frame">
      <Container overrideDefaults className={cn('flex min-w-0 flex-col gap-3 p-4', CARD_MUTED_TEXT)}>
        <ResourceCardHeader
          typeLabel={typeLabel}
          typeHref={getResourceRoute(card?.uri ?? url)}
          sourceUri={links?.sourceUri ?? url}
          href={href}
          siteName={links?.siteName ?? getLinkHost(href)}
        />
        <Container overrideDefaults className="min-w-0" data-testid="resource-embed-body">
          {children}
        </Container>
      </Container>
      {actions}
    </ResourceCardFrame>
  );
}
