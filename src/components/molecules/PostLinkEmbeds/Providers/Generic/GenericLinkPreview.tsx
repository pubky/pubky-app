'use client';

import { Container } from '@/atoms/Container/Container';
import { isPinakesConfigured, PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { useOgMetadata } from '@/hooks/useOgMetadata/useOgMetadata';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { useCardPlayer } from '@/molecules/ResourcePlayer/useCardPlayer';
import { getNativeEmbedCard } from '../Native/nativeEmbed.utils';
import { GenericPreview } from './GenericPreview';
import { useSlowRead } from './useSlowRead';

/**
 * A generic link that is only in a post's text: its own website preview (`GenericPreview`). When that
 * preview says nothing (a page with neither a title nor an image: only its address in a grey box) and
 * Pinakes is configured, Pinakes is asked to read the link once it is on screen (`usePinakesCard`'s
 * `resolveOnView`, with its bounds), the card's skeleton holding the place for at most
 * `PINAKES_SLOW_READ_MS`; a card it makes shows instead, as a text link's card does (no footer of its
 * own, its player inside it from its Play), else the preview stays. A preview with a title or an
 * image is never sent. In the composer the composer's own resolve asks instead (once the link has stayed
 * as written, `PINAKES_RESOLVE_DEBOUNCE_MS`), and a card's player previews.
 */
export function GenericLinkPreview({ url, isComposing = false }: { url: string; isComposing?: boolean }) {
  const { metadata, isLoading } = useOgMetadata(url);
  const isBare = !isLoading && metadata?.type === 'website' && !metadata.title?.trim() && !metadata.image;
  if (!isBare || !isPinakesConfigured()) return <GenericPreview url={url} />;
  return <BarePreview url={url} isComposing={isComposing} />;
}

interface BarePreviewProps {
  url: string;
  /** The composer's preview: the composer's own resolve (once the link has stayed as written), a player previewed. */
  isComposing: boolean;
}

function BarePreview(props: BarePreviewProps) {
  const { ref, isVisible } = useViewportObserver({ rootMargin: '0px' });
  return (
    <Container overrideDefaults ref={ref} className="min-w-0" data-testid="generic-link-preview">
      <BarePreviewRead {...props} isOnScreen={isVisible} />
    </Container>
  );
}

function BarePreviewRead({ url, isComposing, isOnScreen }: BarePreviewProps & { isOnScreen: boolean }) {
  // In the composer the link is still being typed: the debounced resolve, never one per keystroke.
  const { data, isLoading, isResolving } = usePinakesCard(
    url,
    isComposing ? { resolve: true } : { recheck: isOnScreen, resolveOnView: isOnScreen },
  );
  const isReading = isLoading || Boolean(isResolving);
  const isSlow = useSlowRead(url, isReading, PINAKES_SLOW_READ_MS);
  const surface = useResourceSurface() === 'card' ? 'default' : undefined;
  const card = getNativeEmbedCard(data);
  const player = useCardPlayer(card, url, surface, { preview: isComposing });
  if (isReading && !isSlow) return <ResourceCardSkeleton />;
  if (!card) return <GenericPreview url={url} />;
  return <ResourceCard card={card} href={url} headerControl={player.switcher} player={player.player} asPost />;
}
