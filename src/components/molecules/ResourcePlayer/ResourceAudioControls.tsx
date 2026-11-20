'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Check, ChevronDown, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { Audio } from '@/atoms/Audio/Audio';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { ResourceAudioArt } from './ResourceAudioArt';
import type { PlayerTarget } from './resourcePlayer.utils';
import { MENU_ROW, MENU_ROW_TEXT } from './ResourcePlayerControls';

/** The speeds the player offers. */
export const AUDIO_SPEEDS = [1, 1.25, 1.5, 2] as const;
/** Seconds Back and Forward skip. */
export const SKIP_BACK_S = 15;
export const SKIP_FORWARD_S = 30;

/** `0:04`, `1:02:03`: elapsed and total time, as the episode rows give a length (`formatDuration`). */
export function formatClock(seconds: number): string {
  const rounded = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

const speedLabel = (speed: number) => `${speed}x`;

interface ResourceAudioControlsProps {
  /** The audio file (`getAudioPlayer`): its `src`, name and `about` (cover, show, page). */
  target: PlayerTarget;
  /** Its title. */
  title: string;
  /** The player region's name, for the audio element. */
  label: string;
  /** Asked once mounted: `true` when a press on a row's Play opened it, whose focus Play/Pause then takes. */
  takeFocus?: () => boolean;
  onLoadedMetadata: () => void;
  onError: () => void;
}

/**
 * The app's audio player for a plain audio file (a podcast episode): its cover, its title (opening
 * its page in the app, when it has one) and what it is from, then Play/Pause, back 15 s, forward
 * 30 s, a scrubber with the time played and the whole length, and the speed (1x to 2x), in the
 * post menu's style. The audio element under it has no controls of its own and starts by the press
 * that opened the player (`autoPlay`). It lays out by its own width (a container query): one row of
 * controls beside the scrubber in a card, the scrubber above the buttons in the narrow dock, where the
 * skip buttons drop their numbers, and the speed its chevron, on the narrowest phones (their names say
 * them).
 */
export function ResourceAudioControls({
  target,
  title,
  label,
  takeFocus,
  onLoadedMetadata,
  onError,
}: ResourceAudioControlsProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const { image, from, page, pageTarget } = target.about ?? {};
  const subtitle = from?.trim() || target.name;
  const hasLength = Number.isFinite(duration) && duration > 0;

  const read = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setTime(audio.currentTime);
    setDuration(audio.duration);
    setIsPlaying(!audio.paused && !audio.ended);
  };
  const seek = (to: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const end = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(Math.max(0, to), end);
    read();
  };
  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play()?.catch(() => undefined);
    else audio.pause();
  };
  const changeSpeed = (next: number) => {
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  // Opened by a press on the row's Play, which is gone now: the press's focus moves to Pause. Mounted
  // again without a press (the host loads a hidden player anew), it leaves the focus alone.
  const focusOnOpen = useEffectEvent(() => {
    const lost = !document.activeElement || document.activeElement === document.body;
    if (takeFocus?.() && lost) toggleRef.current?.focus({ preventScroll: true });
  });
  useEffect(() => focusOnOpen(), []);

  const titleClass = 'line-clamp-2 text-sm font-bold wrap-anywhere text-foreground';
  const skipClass = 'h-8 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground has-[>svg]:px-2';

  return (
    <Container
      overrideDefaults
      data-testid="resource-audio-controls"
      // In the dock it keeps clear of the dock's edge; in a card it lines up with the rows around it.
      className="@container flex min-w-0 flex-col gap-2 in-data-docked:p-2"
    >
      <Audio
        ref={audioRef}
        src={target.src}
        controls={false}
        autoPlay={target.autoplay}
        preload="metadata"
        aria-label={label}
        onLoadedMetadata={() => {
          read();
          onLoadedMetadata();
        }}
        onDurationChange={read}
        onTimeUpdate={read}
        onPlay={read}
        onPlaying={read}
        onPause={read}
        onEnded={read}
        // A file that fails ends the placeholder; the controls stay, its time at 0:00.
        onError={onError}
        className="hidden"
        data-testid="resource-player-audio"
      />
      <Container overrideDefaults className="flex min-w-0 items-center gap-3">
        {/* As wide as a row's Play: the title lines up with the rows' titles. */}
        <ResourceAudioArt image={image} className="size-11" />
        <Container overrideDefaults className="flex min-w-0 flex-1 flex-col">
          {page ? (
            <Link
              href={page}
              target={pageTarget}
              rel={pageTarget ? 'noopener noreferrer' : undefined}
              overrideDefaults
              dir="auto"
              data-testid="resource-audio-title"
              className={cn(titleClass, 'hover:text-brand')}
            >
              {title}
            </Link>
          ) : (
            <Typography as="span" overrideDefaults dir="auto" data-testid="resource-audio-title" className={titleClass}>
              {title}
            </Typography>
          )}
          <Typography
            as="span"
            size="xs"
            dir="auto"
            data-testid="resource-audio-from"
            className="truncate font-normal text-muted-foreground"
          >
            {subtitle}
          </Typography>
        </Container>
      </Container>
      {/* The scrubber first, as it reads: above the buttons in the narrow dock, beside them in a card. */}
      <Container overrideDefaults className="flex min-w-0 flex-col gap-1 @md:flex-row @md:items-center @md:gap-3">
        <Container overrideDefaults className="flex min-w-0 flex-1 items-center gap-2">
          <Typography
            as="span"
            size="xs"
            data-testid="resource-audio-time"
            className="shrink-0 font-normal text-muted-foreground tabular-nums"
          >
            {formatClock(time)}
          </Typography>
          <input
            type="range"
            min={0}
            max={hasLength ? duration : 0}
            step={1}
            value={hasLength ? Math.min(time, duration) : 0}
            disabled={!hasLength}
            aria-label={`Seek in ${title}`}
            aria-valuetext={`${formatClock(time)} of ${hasLength ? formatClock(duration) : 'unknown length'}`}
            data-testid="resource-audio-seek"
            onChange={(event) => seek(Number(event.target.value))}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-brand disabled:cursor-default"
          />
          <Typography
            as="span"
            size="xs"
            data-testid="resource-audio-length"
            className="shrink-0 font-normal text-muted-foreground tabular-nums"
          >
            {hasLength ? formatClock(duration) : '--:--'}
          </Typography>
        </Container>
        {/* Back, Play and Forward centred under the scrubber, the speed at the end; one row beside it in a card. */}
        <Container overrideDefaults className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center @md:flex @md:gap-1">
          <span aria-hidden="true" className="@md:hidden" />
          <Container overrideDefaults className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Back ${SKIP_BACK_S} seconds`}
              data-testid="resource-audio-back"
              onClick={() => seek((audioRef.current?.currentTime ?? 0) - SKIP_BACK_S)}
              className={skipClass}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <span className="@max-[12rem]:hidden">{SKIP_BACK_S}</span>
            </Button>
            <Button
              ref={toggleRef}
              type="button"
              variant="brand"
              size="icon"
              aria-label={isPlaying ? `Pause ${title}` : `Play ${title}`}
              data-testid="resource-audio-toggle"
              onClick={toggle}
              className="size-9 rounded-full"
            >
              {isPlaying ? (
                <Pause aria-hidden="true" className="size-4 fill-current" />
              ) : (
                <Play aria-hidden="true" className="size-4 fill-current" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Forward ${SKIP_FORWARD_S} seconds`}
              data-testid="resource-audio-forward"
              onClick={() => seek((audioRef.current?.currentTime ?? 0) + SKIP_FORWARD_S)}
              className={skipClass}
            >
              <span className="@max-[12rem]:hidden">{SKIP_FORWARD_S}</span>
              <RotateCw aria-hidden="true" className="size-4" />
            </Button>
          </Container>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Speed: ${speedLabel(speed)}`}
                data-testid="resource-audio-speed"
                className={cn(skipClass, 'justify-self-end tabular-nums')}
              >
                {speedLabel(speed)}
                <ChevronDown aria-hidden="true" className="size-3 @max-[10rem]:hidden" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" aria-label="Playback speed" className="flex w-32 flex-col gap-2.5">
              {AUDIO_SPEEDS.map((option) => {
                const isCurrent = option === speed;
                return (
                  <DropdownMenuItem
                    key={option}
                    data-testid="resource-audio-speed-option"
                    aria-current={isCurrent || undefined}
                    onSelect={() => changeSpeed(option)}
                    className={MENU_ROW}
                  >
                    <Typography
                      as="span"
                      overrideDefaults
                      className={cn(
                        MENU_ROW_TEXT,
                        'min-w-0 flex-1 tabular-nums',
                        isCurrent ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {speedLabel(option)}
                    </Typography>
                    {isCurrent && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </Container>
      </Container>
    </Container>
  );
}
