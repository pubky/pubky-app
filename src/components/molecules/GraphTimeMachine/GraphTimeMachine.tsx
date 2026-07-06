'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { GLASS_PANEL_CLASS } from '@/config/theme';
import { cn } from '@/libs/utils/utils';

export interface GraphTimeMachineProps {
  bounds: { min: number; max: number };
  /** Sorted ascending event timestamps; playback reveals at a constant EVENT
   * rate so heavily skewed timelines still read as steady assembly */
  timestamps?: number[];
  cap: number | null;
  onCapChange: (cap: number | null) => void;
  onClose: () => void;
  className?: string;
}

const PLAY_DURATION_MS = 8000;
const PLAY_TICK_MS = 50;

/**
 * GraphTimeMachine
 *
 * A timeline scrubber over the graph's edge/post timestamps: drag to watch
 * the network at any moment, press play to watch it assemble itself.
 */
export function GraphTimeMachine({ bounds, timestamps, cap, onCapChange, onClose, className }: GraphTimeMachineProps) {
  const t = useTranslations('graph');
  const format = useFormatter();
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const value = cap ?? bounds.max;
  const span = Math.max(1, bounds.max - bounds.min);

  useEffect(() => {
    if (!playing) {
      if (playRef.current) clearInterval(playRef.current);
      return;
    }
    const stamps = timestamps && timestamps.length > 2 ? timestamps : null;
    if (stamps) {
      // Constant event-rate playback: real timelines are heavily skewed
      // toward recent activity, so linear time playback shows nothing for
      // seconds and then everything at once
      const perTick = stamps.length / (PLAY_DURATION_MS / PLAY_TICK_MS);
      // Restart from the beginning when already at the end
      let index =
        value >= bounds.max
          ? 0
          : Math.max(
              0,
              stamps.findIndex((s) => s >= value),
            );
      onCapChange(stamps[Math.floor(index)]);
      playRef.current = setInterval(() => {
        index += perTick;
        if (index >= stamps.length - 1) {
          onCapChange(null);
          setPlaying(false);
        } else {
          onCapChange(stamps[Math.floor(index)]);
        }
      }, PLAY_TICK_MS);
    } else {
      const step = (span / PLAY_DURATION_MS) * PLAY_TICK_MS;
      let current = value >= bounds.max ? bounds.min : value;
      onCapChange(current);
      playRef.current = setInterval(() => {
        current += step;
        if (current >= bounds.max) {
          onCapChange(null);
          setPlaying(false);
        } else {
          onCapChange(current);
        }
      }, PLAY_TICK_MS);
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current);
    };
    // `value` is intentionally omitted: it advances every tick and would
    // restart the interval; bounds ARE included so merged pages during
    // playback extend the run instead of ending at a stale max.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, bounds.min, bounds.max, timestamps]);

  return (
    <div
      className={cn(GLASS_PANEL_CLASS, 'flex items-center gap-3 px-4 py-2.5', className)}
      data-cy="graph-time-machine"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => setPlaying((prev) => !prev)}
        aria-label={playing ? t('time.pause') : t('time.play')}
        title={playing ? t('time.pause') : t('time.play')}
        data-cy="graph-time-play"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        value={value}
        onChange={(e) => {
          setPlaying(false);
          const next = Number(e.target.value);
          onCapChange(next >= bounds.max ? null : next);
        }}
        className="h-1.5 w-28 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-(--brand) sm:w-48 md:w-72"
        aria-label={t('time.scrub')}
      />
      <Typography size="sm" className="hidden w-24 shrink-0 text-center text-muted-foreground tabular-nums sm:block">
        {cap === null ? t('time.now') : format.dateTime(new Date(value), { dateStyle: 'medium' })}
      </Typography>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => {
          setPlaying(false);
          onCapChange(null);
          onClose();
        }}
        aria-label={t('time.close')}
        title={t('time.close')}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
