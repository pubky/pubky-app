'use client';

import { type CSSProperties, useRef, useState } from 'react';
import { type LucideIcon, Play } from 'lucide-react';
import { Image } from '@/atoms/Image/Image';
import { Typography } from '@/atoms/Typography/Typography';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { cn } from '@/libs/utils/utils';
import { ResourceArrowText } from '@/molecules/ResourceCard/ResourceArrowText';
import { getResourceSummary } from '@/molecules/ResourceCard/ResourceFacts.utils';
import { ResourceSourceIcon } from '@/molecules/ResourceCard/ResourceSourceIcon';
import { getResourceTypeIcon } from '@/molecules/ResourceCard/ResourceTypeIcon';
import { useCardImage } from '@/molecules/ResourceCard/useCardImage';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { getMinFrameWidth, type PlayerTarget } from './resourcePlayer.utils';
import { useFitScale } from './ResourcePlayerFrame';

/** An audio player shorter than this shows its title only, beside a small cover. */
const COMPACT_HEIGHT = 100;
/** An audio player shorter than this leaves out the card's summary line. */
const SUMMARY_HEIGHT = 140;

export interface ResourcePlayerFacadeProps {
  card: TPinakesResourceDetail;
  /** The chosen service, whose player this stands for: its place, size and mark. */
  target: PlayerTarget;
  /** What it plays: the card's title. */
  title: string;
  /** A preview (the composer): a press shows the player paused. */
  preview?: boolean;
  /** The press: loads the service's player in this place. */
  onPlay: () => void;
}

/**
 * A service's player as the app draws it before the viewer's press, with platform embeds up front off
 * (`useCardPlayer`'s `embed`): in the player's place, in the player's box (`ResourcePlayerFrame`: a
 * video's 16:9 at most 80% of the screen tall, an audio player's own height, scaled with it where the
 * service lays out at a minimum width, `useFitScale`), from the card's data only, its image the card's
 * own (`useCardImage`, on the app's image route). Nothing loads from the service. A video shows its still
 * with the title and the service's mark over it; audio its cover, title, the card's summary line
 * (artist, length, album) and the service's mark. The whole drawing is one button ("Play <title> on
 * <service>"; a preview "Show the <service> player"): a press, Enter or Space loads the real player in
 * its place, started where the service allows.
 */
export function ResourcePlayerFacade({ card, target, title, preview = false, onPlay }: ResourcePlayerFacadeProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  // As the card does: an image it lacks is read from its group or its link's preview once it has been near the screen.
  const { ref: viewportRef, isVisible } = useViewportObserver();
  const [wasNear, setWasNear] = useState(isVisible);
  if (isVisible && !wasNear) setWasNear(true);
  const { shownImageSrc, onShownImageError } = useCardImage(card, { canFillIn: wasNear, fillDescription: false });
  const fit = useFitScale(boxRef, target.element === 'iframe' ? getMinFrameWidth(target) : undefined);
  const label = preview ? `Show the ${target.name} player` : `Play ${title} on ${target.name}`;
  const { layout } = target;
  const isVideo = layout.kind === 'video';
  const height = layout.kind === 'audio' ? layout.height * fit : 0;
  const compact = !isVideo && height < COMPACT_HEIGHT;
  const summary = isVideo || height < SUMMARY_HEIGHT ? null : getResourceSummary(card);
  const style: CSSProperties = isVideo ? { aspectRatio: String(layout.aspect ?? 16 / 9) } : { height };

  const mark = (
    <span className="flex min-w-0 items-center gap-1.5">
      <ResourceSourceIcon uri={target.link} />
      <Typography as="span" overrideDefaults className="truncate text-xs font-medium">
        {target.name}
      </Typography>
    </span>
  );

  return (
    <div
      ref={(node) => {
        boxRef.current = node;
        viewportRef(node);
      }}
      className="min-w-0"
    >
      <button
        type="button"
        aria-label={label}
        onClick={onPlay}
        data-testid="player-facade"
        data-provider={target.provider}
        style={style}
        className={cn(
          'group relative flex w-full min-w-0 cursor-pointer overflow-hidden rounded-lg text-start outline-none',
          'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isVideo
            ? 'max-h-[80vh] bg-black text-white'
            : 'items-center gap-3 bg-foreground/5 p-3 text-foreground hover:bg-foreground/10',
        )}
      >
        {isVideo ? (
          <>
            {shownImageSrc && (
              <Image
                src={shownImageSrc}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                onError={onShownImageError}
                data-testid="player-facade-image"
                className="object-cover object-center"
              />
            )}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 flex min-w-0 flex-col gap-1.5 bg-gradient-to-b from-black/80 to-transparent p-3 pb-8"
            >
              <Typography
                as="span"
                overrideDefaults
                dir="auto"
                className="line-clamp-2 text-sm font-bold wrap-anywhere"
              >
                {title}
              </Typography>
              {/* The service's mark on a chip in the theme's colours, which its favicon already follows. */}
              <span className="w-fit max-w-full rounded-full bg-background/90 px-2 py-0.5 text-foreground">{mark}</span>
            </span>
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
              {/* Over a video's still in either theme: white on translucent black, as the app's video overlays. */}
              <span
                data-testid="player-facade-glyph"
                className="flex size-16 items-center justify-center rounded-full bg-black/60 text-white shadow-md transition-transform group-hover:scale-105"
              >
                <Play aria-hidden="true" className="size-7 fill-current" />
              </span>
            </span>
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="relative flex aspect-square h-full max-h-40 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/10 max-sm:max-h-24"
            >
              {shownImageSrc ? (
                <Image
                  src={shownImageSrc}
                  alt=""
                  fill
                  sizes="160px"
                  onError={onShownImageError}
                  data-testid="player-facade-image"
                  className="object-cover object-center"
                />
              ) : (
                <FacadeTypeIcon icon={getResourceTypeIcon(card)} />
              )}
            </span>
            <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1">
              <Typography
                as="span"
                overrideDefaults
                dir="auto"
                className={cn('font-bold wrap-anywhere', compact ? 'truncate text-sm' : 'line-clamp-2 text-base')}
              >
                {title}
              </Typography>
              {summary && (
                <Typography
                  as="span"
                  overrideDefaults
                  dir="auto"
                  className="line-clamp-2 text-sm font-medium wrap-anywhere text-muted-foreground"
                >
                  <ResourceArrowText text={summary} />
                </Typography>
              )}
              {!compact && <span className="text-muted-foreground">{mark}</span>}
            </span>
            <span
              aria-hidden="true"
              data-testid="player-facade-glyph"
              className={cn(
                'flex shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-md transition-transform group-hover:scale-105',
                compact ? 'size-9' : 'size-12',
              )}
            >
              <Play aria-hidden="true" className="size-5 fill-current" />
            </span>
          </>
        )}
      </button>
    </div>
  );
}

/** The card's type icon where it has no image, as the card's own tile shows it. */
function FacadeTypeIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-1/2 max-h-8 max-w-8 text-muted-foreground" />;
}
