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
  /** A control in the header, next to the type: a playable card's switch (`useCardPlayer`'s `switcher`). */
  headerControl?: ReactNode;
}

/**
 * A platform's own embed, as the platform makes it, in the resource card's frame: the header's type
 * and a click on the header open the resource page, its source the link; the footer is the
 * resource's tags and actions. Without a card the header names the host and `fallbackTypeLabel`.
 * The embed and the space around it are its own set of controls, never a click-through.
 */
export function ResourceEmbedFrame({
  url,
  card,
  actions,
  children,
  fallbackTypeLabel = 'Link',
  headerControl,
}: ResourceEmbedFrameProps) {
  const links = card ? getResourceLinks(card, url) : null;
  const typeLabel = (card ? getResourceTypeLabel(card) : null) ?? fallbackTypeLabel;
  const href = links?.linkUrl ?? getHttpUrl(url);
  const pageUrl = getResourceRoute(card?.uri ?? url);

  return (
    <ResourceCardFrame clickThroughUrl={pageUrl} data-testid="resource-embed-frame">
      <Container overrideDefaults className={cn('flex min-w-0 flex-col', CARD_MUTED_TEXT)}>
        <Container overrideDefaults className="min-w-0 cursor-pointer p-4 pb-3">
          <ResourceCardHeader
            typeLabel={typeLabel}
            typeHref={pageUrl}
            sourceUri={links?.sourceUri ?? url}
            href={href}
            siteName={links?.siteName ?? getLinkHost(href)}
            control={headerControl}
          />
        </Container>
        <Container
          overrideDefaults
          data-resource-controls
          className="min-w-0 px-4 pb-4"
          data-testid="resource-embed-body"
        >
          {children}
        </Container>
      </Container>
      {actions}
    </ResourceCardFrame>
  );
}
