'use client';

import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef } from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { Audio } from '@/atoms/Audio/Audio';
import { Container } from '@/atoms/Container/Container';
import { Iframe } from '@/atoms/Iframe/Iframe';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { VIDEO_EMBED_PROPS } from '@/molecules/PostLinkEmbeds/Providers/Provider.constants';
import type { PlayerStart, PlayerTarget } from './resourcePlayer.utils';
import type { PlayerLoadState } from './useResourcePlayer';

interface ResourcePlayerFrameProps {
  target: PlayerTarget;
  /** The resource's name, for the frame's accessible title. */
  title: string;
  load: PlayerLoadState;
  onLoaded: () => void;
  /** A plain audio file has started playing (a song's player up front becomes the page's player). */
  onPlay?: () => void;
  /**
   * An embed shown up front (a card without Also on, `GenericResourcePreview`), not opened by Play:
   * no status line, since nothing was asked to start; loaded once near the screen, like a post's
   * video embed.
   */
  quiet?: boolean;
}

/**
 * Posts a player's start message to its frame, once per frame document: `sentFor` holds the `src`
 * it was sent for, so a re-render with an equal target sends nothing more.
 */
function postStart(
  frame: HTMLIFrameElement | null,
  src: string,
  start: PlayerStart | undefined,
  sentFor: RefObject<string | null>,
): void {
  const frameWindow = frame?.contentWindow;
  if (!start || !frameWindow || sentFor.current === src) return;
  sentFor.current = src;
  frameWindow.postMessage(start.message, start.origin);
}

/**
 * Tells a player that has no autoplay parameter to start (`PlayerStart`), once per frame: when it
 * posts its ready message, or, without one, when it has loaded. Returns the frame's ref and its load
 * handler.
 */
function useStartMessage(target: PlayerTarget, onLoaded: () => void) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const sentFor = useRef<string | null>(null);
  const { src, start } = target;

  // A new but equal `start` only re-adds the listener: what was sent is kept per `src`.
  useEffect(() => {
    const readyType = start?.readyType;
    if (!start || !readyType) return;
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (event.origin !== start.origin || !frame || event.source !== frame.contentWindow) return;
      const data: unknown = event.data;
      if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === readyType) {
        postStart(frame, src, start, sentFor);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [src, start]);

  const onLoad = () => {
    onLoaded();
    if (start && !start.readyType) postStart(frameRef.current, src, start, sentFor);
  };

  return { frameRef, onLoad };
}

/**
 * A service's own player, unchanged: the iframe its embed code makes (or the themed `Audio` for a
 * plain file), at the service's height for audio and 16:9 for video (at the card's full width, no height
 * floor). Until the frame loads, a pulsing placeholder of the same size covers it, and only the
 * status line names the service, to screen readers. A frame that has not loaded after a while
 * offers the service's page. One press on our Play starts it: by its `src` or by its start message
 * (Spotify, TIDAL). A service that cannot start that way (Mixcloud, Deezer) says a press inside its
 * player is needed, to screen readers only; the card never claims playback.
 */
export function ResourcePlayerFrame({
  target,
  title,
  load,
  onLoaded,
  quiet = false,
  onPlay,
}: ResourcePlayerFrameProps) {
  const { frameRef, onLoad } = useStartMessage(target, onLoaded);
  const label = `${target.name} player: ${title}`;
  const isVideo = target.layout.kind === 'video';
  const style =
    target.layout.kind === 'audio'
      ? ({
          '--player-h': `${target.layout.height}px`,
          '--player-dock-h': `${target.layout.dockHeight ?? target.layout.height}px`,
        } as CSSProperties)
      : undefined;

  return (
    <Container overrideDefaults className="flex min-w-0 flex-col gap-2" data-testid="resource-player">
      <div
        role="region"
        aria-label={label}
        aria-busy={load === 'loading'}
        data-provider={target.provider}
        data-load={load}
        data-player-region
        style={style}
        // The services draw their own rounded corners (TIDAL, Spotify: 12 px, `rounded-lg` here): ours
        // match them, and our background shows only until the player has loaded, so none peeks out at a
        // corner; never behind a plain file, whose own pill is rounder than the box.
        className={cn(
          'relative w-full overflow-hidden rounded-lg',
          target.element !== 'audio' && load !== 'ready' && 'bg-card',
          isVideo ? 'aspect-video' : 'h-(--player-h)',
        )}
      >
        {target.element === 'audio' ? (
          <Audio
            src={target.src}
            controls
            autoPlay={target.autoplay}
            preload="metadata"
            aria-label={label}
            onLoadedMetadata={onLoaded}
            onPlay={onPlay}
            className="absolute inset-0 size-full"
            data-testid="resource-player-audio"
          />
        ) : (
          <Iframe
            ref={frameRef}
            src={target.src}
            // Named by `aria-label`; its `title` is left empty: a title is the browser's hover tooltip,
            // which covered the dock's buttons.
            title=""
            aria-label={label}
            allow={target.allow}
            sandbox={`${VIDEO_EMBED_PROPS.sandbox} allow-popups-to-escape-sandbox`}
            referrerPolicy="strict-origin-when-cross-origin"
            loading={quiet ? 'lazy' : 'eager'}
            height="auto"
            onLoad={onLoad}
            data-testid="resource-player-frame"
            className={cn(
              'absolute inset-0 size-full border-0 transition-opacity duration-300 motion-reduce:transition-none',
              load === 'loading' ? 'opacity-0' : 'opacity-100',
            )}
          />
        )}
        {load === 'loading' && (
          <Container
            overrideDefaults
            aria-hidden="true"
            data-testid="resource-player-placeholder"
            className="absolute inset-0 flex animate-pulse items-center justify-center bg-card text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
          </Container>
        )}
      </div>
      <Typography
        as="p"
        size="xs"
        role="status"
        data-testid="resource-player-status"
        className={cn('font-normal text-muted-foreground', load !== 'slow' && 'sr-only', quiet && 'hidden')}
      >
        {load === 'loading' && `Loading the ${target.name} player`}
        {load === 'ready' && !target.autoplay && `Press play in the ${target.name} player to start.`}
        {load === 'slow' && (
          <>
            {target.name} has not answered.{' '}
            <Link href={target.link} overrideDefaults className="inline-flex items-center gap-0.5 underline">
              Open in {target.name}
              <ArrowUpRight aria-hidden="true" className="size-3" />
            </Link>
          </>
        )}
      </Typography>
    </Container>
  );
}

/**
 * Animates its height when its content changes size (player in, player out, provider switch). The
 * height is fixed only while it animates and is `auto` otherwise, so the content is never clipped
 * once settled, even where size changes are reported late; reduced motion skips the animation.
 */
export function AnimatedHeight({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof ResizeObserver === 'undefined') return;
    let last = inner.offsetHeight;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      const next = inner.offsetHeight;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (next === last || reduced) {
        last = next;
        return;
      }
      outer.style.height = `${last}px`;
      // Read layout so the browser starts the transition from the old height.
      outer.getBoundingClientRect();
      outer.style.height = `${next}px`;
      last = next;
      clearTimeout(timer);
      timer = setTimeout(() => {
        outer.style.height = '';
      }, 320);
    });
    observer.observe(inner);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={outerRef}
      className="min-w-0 overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
    >
      <div ref={innerRef} className="flex min-w-0 flex-col gap-3">
        {children}
      </div>
    </div>
  );
}
